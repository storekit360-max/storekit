const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const rateLimit = require('express-rate-limit');
const { PaymentGateway, Settings, Notification } = require('../models/index');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { DiscountEngine } = require('../services/discountEngine');
const { sendOrderWhatsAppNotification } = require('../services/whatsappOrderNotify');
const { sendMail, getAdminEmail, orderConfirmHtml, newOrderAdminHtml, isEmailEnabled } = require('../utils/mailer');
const { auth, adminAuth } = require('../middleware/auth');
const webhookEvents = require('../services/webhookEventService');

function recordWebhookSafely(input) {
  return webhookEvents.record(input).catch(error => console.error('[WEBHOOK_LOG_FAILED]', error.message));
}

function tenantIdForRequest(req) {
  return req.user?.tenantId || req.tenantId || null;
}

const GATEWAY_NAMES = { payhere: 'PayHere', stripe: 'Stripe', paypal: 'PayPal', payzy: 'Payzy', koko: 'KOKO' };
function providerLogoFor(plan, gateway, gateways) {
  const provider = String(plan.provider || GATEWAY_NAMES[gateway.gateway] || '').toLowerCase();
  const matching = gateways.find(item => String(GATEWAY_NAMES[item.gateway] || item.gateway).toLowerCase() === provider || item.gateway === provider);
  return matching?.logo || matching?.config?.logoUrl || (matching ? '' : plan.providerLogo || gateway.logo || gateway.config?.logoUrl || '');
}

// ── Rate limiters ─────────────────────────────────────────────────────────────
// Prevent brute-force / enumeration attacks on payment endpoints
const paymentInitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // max 20 payment init attempts per IP
  message: { message: 'Too many payment requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max: 100,                   // webhooks can be high-volume
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Security helpers ──────────────────────────────────────────────────────────

// Constant-time string comparison — prevents timing attacks on signature checks
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Still do comparison to avoid timing leak on length
    crypto.timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Validate amount — must be a positive number with max 2 decimal places
function validateAmount(amount) {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0 || n > 10000000) return null; // max Rs. 10M sanity cap
  return n.toFixed(2);
}

// Sanitise string fields coming from user input before sending to gateways
function sanitise(str, maxLen = 100) {
  if (str == null) return '';
  return String(str).replace(/[<>"']/g, '').trim().slice(0, maxLen);
}

const PAYZY_FIELDS = ['x_test_mode','x_shopid','x_amount','x_order_id','x_response_url','x_first_name','x_last_name','x_company','x_address','x_country','x_state','x_city','x_zip','x_phone','x_email','x_ship_to_first_name','x_ship_to_last_name','x_ship_to_company','x_ship_to_address','x_ship_to_country','x_ship_to_state','x_ship_to_city','x_ship_to_zip','x_freight','x_platform','x_version','signed_field_names'];
function payzySignature(values, secret, callback = false) {
  const fields = callback ? ['response_code', ...PAYZY_FIELDS] : PAYZY_FIELDS;
  const string = fields.map(field => field === 'x_version' && !callback ? `x_version${values[field]}` : `${field}=${values[field] ?? ''}`).join(',');
  return crypto.createHmac('sha256', secret).update(string).digest('base64');
}
function payzyConfig(gw) { return gw?.config || {}; }
function payzyValue(req, key) { return req.body?.[key] ?? req.query?.[key] ?? ''; }
function payzyUrl(payload) { return payload?.data?.url || payload?.data?.redirect_url || payload?.data?.checkout_url || payload?.data?.data?.url || payload?.response?.data?.url || payload?.url || payload?.redirect_url || payload?.checkout_url; }
function normalisePem(value) { return String(value || '').replace(/\\n/g, '\n').trim(); }
function safeReturnOrigin(req) {
  const tenantSiteUrl = req.tenant?.settings?.siteUrl || req.tenant?.settings?.frontendUrl;
  const configuredTenantDomain = req.tenant?.domains?.find(domain => domain.active !== false && domain.type === 'primary')?.domain
    || req.tenant?.domains?.find(domain => domain.active !== false)?.domain;
  const tenantFallbacks = [tenantSiteUrl, configuredTenantDomain && `https://${configuredTenantDomain}`].filter(Boolean);
  const requestOrigin = String(req.get('origin') || '').trim();
  try {
    const url = new URL(requestOrigin || tenantFallbacks[0] || process.env.FRONTEND_URL || '');
    if (['http:', 'https:'].includes(url.protocol)) return `${url.origin}${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`;
  } catch (_) { /* use the tenant-specific fallback below */ }
  for (const candidate of tenantFallbacks) {
    try {
      const url = new URL(candidate);
      if (['http:', 'https:'].includes(url.protocol)) return `${url.origin}${url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')}`;
    } catch (_) { /* ignore malformed tenant configuration */ }
  }
  return String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

// Server-authoritative public quote. Coupon codes are deliberately not accepted:
// product cards must never guess a customer-specific/site-wide coupon.
router.get('/installment-quote/:productId', async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    if (!tenantId) return res.status(404).json({ enabled: false, plans: [] });
    const product = await Product.findOne({ _id: req.params.productId, tenantId, isActive: true }).lean();
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const originalAmount = Number(product.price || 0);
    const discounted = Number(product.salePrice > 0 && product.salePrice < originalAmount);
    const amount = discounted ? Number(product.salePrice) : originalAmount;
    const gateways = await PaymentGateway.find({ tenantId, gateway: { $in: ['payzy', 'koko'] }, isEnabled: true }).lean();
    const setting = await Settings.findOne({ tenantId, key: 'payzyInstallmentPlans' }).lean();
    const configuredPlans = gateways.flatMap(gateway => (gateway.config?.installmentPlans || []).map(p => ({ ...p, provider: p.provider || GATEWAY_NAMES[gateway.gateway], providerLogo: providerLogoFor(p, gateway, gateways) }))).concat(setting?.value || []);
    const plans = configuredPlans.filter(p => p.active !== false && Number(p.months) > 0).map(p => {
      const totalPayable = Math.round(amount * (1 + Number(p.interestRate || 0) / 100) * 100) / 100;
      return { provider: p.provider || 'Payzy', providerLogo: p.providerLogo || '', name: p.name || `${p.months} months`, months: Number(p.months), interestRate: Number(p.interestRate || 0), totalPayable, monthlyAmount: Math.round(totalPayable / Number(p.months) * 100) / 100 };
    });
    res.json({ amount, originalAmount, discounted: Boolean(discounted), enabled: gateways.length > 0, plans });
  } catch (e) { res.status(500).json({ message: 'Could not load installment quote' }); }
});

router.get('/installment-plans', async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    if (!tenantId) return res.json({ plans: [] });
    const gateways = await PaymentGateway.find({ tenantId, gateway: { $in: ['payzy', 'koko'] }, isEnabled: true }).lean();
    const amount = Number(req.query.amount || 0);
    const plans = gateways.flatMap(gateway => (gateway.config?.installmentPlans || []).filter(p => p.active !== false && Number(p.months) > 0).map(p => { const totalPayable = Math.round(amount * (1 + Number(p.interestRate || 0) / 100) * 100) / 100; return { provider: p.provider || GATEWAY_NAMES[gateway.gateway], providerLogo: providerLogoFor(p, gateway, gateways), name: p.name || `${p.months} months`, months: Number(p.months), interestRate: Number(p.interestRate || 0), totalPayable, monthlyAmount: Math.round(totalPayable / Number(p.months) * 100) / 100 }; }));
    res.json({ plans });
  } catch (e) { res.status(500).json({ message: 'Could not load installment plans' }); }
});

router.post('/koko/create-checkout', paymentInitLimiter, async (req, res) => {
  let order;
  const reservedItems = [];
  try {
    const tenantId = tenantIdForRequest(req);
    if (!tenantId) return res.status(404).json({ message: 'Store not found' });
    const gw = await PaymentGateway.findOne({ tenantId, gateway: 'koko', isEnabled: true });
    const cfg = gw?.config || {};
    const merchantId = cfg.merchantId || cfg.merchantID;
    const apiKey = cfg.apiKey;
    const privateKey = normalisePem(cfg.privateKey);
    if (!gw || !merchantId || !apiKey || !privateKey) return res.status(400).json({ message: 'KOKO is not configured' });
    const { items, billing = {}, shipping = {}, shipToDifferentAddress, notes, deliveryService, couponCode } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'No items in order' });
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findOne({ _id: item.productId, tenantId, isActive: true });
      const quantity = Math.max(1, parseInt(item.quantity, 10));
      if (!product || product.stock < quantity) return res.status(400).json({ message: 'Product unavailable or out of stock' });
      orderItems.push(DiscountEngine.buildLineItem(product, quantity));
    }
    const subtotal = DiscountEngine.computeSubtotal(orderItems);
    const delivery = await DiscountEngine.resolveDeliveryFee(deliveryService || null, billing.city || '', subtotal, {}, tenantId);
    const benefit = await DiscountEngine.resolveBenefit({ couponCode: couponCode || null, subtotal, deliveryFee: delivery.fee, email: billing.email || null, productIds: orderItems.map(i => String(i.product)), categoryIds: orderItems.flatMap(i => [i.category, i.subCategory]).filter(Boolean), brands: orderItems.map(i => i.brand).filter(Boolean), lineItems: orderItems });
    if (couponCode && benefit.errorCoupon) return res.status(400).json({ message: benefit.errorCoupon });
    const totals = DiscountEngine.computeTotals({ subtotal, deliveryFee: delivery.fee, benefit });
    for (const item of orderItems) {
      const update = await Product.updateOne({ _id: item.product, tenantId, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity, soldCount: item.quantity } });
      if (!update.modifiedCount) throw new Error('Stock changed while starting checkout');
      reservedItems.push(item);
    }
    const backendBase = String(process.env.PAYZY_RESPONSE_BASE_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    if (!backendBase) throw new Error('Backend callback URL is not configured');
    const returnOrigin = safeReturnOrigin(req);
    order = await Order.create({ tenantId, items: orderItems, billing, shipping: shipToDifferentAddress ? shipping : billing, shipToDifferentAddress, paymentMethod: 'koko', paymentStatus: 'pending', orderStatus: 'pending', isPaymentDraft: true, paymentDraftExpiresAt: new Date(Date.now() + 3600000), subtotal: totals.subtotal, couponCode: benefit.couponDiscount > 0 ? couponCode : undefined, couponDiscount: benefit.couponDiscount || 0, shippingCost: delivery.fee, total: totals.total, notes, deliveryService: deliveryService || 'standard', deliveryServiceName: delivery.serviceName, statusHistory: [{ status: 'pending', note: 'KOKO payment draft created', updatedBy: billing.email || 'system' }] });
    if (benefit.couponDiscount > 0) {
      const applied = await DiscountEngine.applyBenefit(benefit, order._id, null, billing.email || null, 0);
      if (!applied.ok) throw new Error('Coupon is no longer available');
    }
    const encodedOrderNumber = encodeURIComponent(order.orderNumber);
    // KOKO QA has used both path and query-string return formats. Supplying
    // both keeps the tenant/order context intact even if its hosted success
    // page strips path parameters during the handoff.
    const returnUrl = `${backendBase}/api/payments/koko/return/${encodedOrderNumber}?order=${encodedOrderNumber}`;
    const cancelUrl = `${backendBase}/api/payments/koko/cancel/${encodedOrderNumber}?order=${encodedOrderNumber}`;
    const responseUrl = `${backendBase}/api/payments/koko/response`;
    const amount = Number(totals.total).toFixed(2);
    const description = `${orderItems.length} item${orderItems.length === 1 ? '' : 's'}`;
    const reference = String(order.orderNumber);
    const dataString = `${merchantId}${amount}LKRcustomapi1${returnUrl}${cancelUrl}${order.orderNumber}${reference}${sanitise(billing.firstName, 60)}${sanitise(billing.lastName, 60)}${sanitise(billing.email, 120)}${description}${apiKey}${responseUrl}`;
    const signature = crypto.sign('RSA-SHA256', Buffer.from(dataString), privateKey).toString('base64');
    const fields = { _mId: String(merchantId), api_key: String(apiKey), _returnUrl: returnUrl, _responseUrl: responseUrl, _currency: 'LKR', _amount: amount, _reference: reference, _pluginName: 'customapi', _pluginVersion: '1', _cancelUrl: cancelUrl, _orderId: String(order.orderNumber), _firstName: sanitise(billing.firstName, 60), _lastName: sanitise(billing.lastName, 60), _email: sanitise(billing.email, 120), _description: description, dataString, signature, _mobileNo: sanitise(billing.phone, 30) };
    order.koko = { signedRequest: fields, returnOrigin }; await order.save();
    const endpoint = gw.isLive ? String(cfg.endpoint || cfg.productionEndpoint || '') : String(cfg.endpoint || 'https://qaapi.paykoko.com/api/merchants/orderCreate');
    if (!/^https:\/\//i.test(endpoint)) throw new Error('KOKO endpoint is not configured');
    res.json({ endpoint, fields });
  } catch (error) {
    if (order) await Order.deleteOne({ _id: order._id, isPaymentDraft: true }).catch(() => {});
    for (const item of reservedItems) await Product.updateOne({ _id: item.product, tenantId: order?.tenantId || tenantIdForRequest(req) }, { $inc: { stock: item.quantity, soldCount: -item.quantity } }).catch(() => {});
    console.error('[KOKO CREATE]', error.message);
    res.status(502).json({ message: 'Unable to start KOKO checkout. Please try again.' });
  }
});

async function failKokoDraft(order, note) {
  const claimed = await withoutTenantScope(() => Order.findOneAndUpdate({ _id: order._id, isPaymentDraft: true, paymentStatus: 'pending' }, { $set: { paymentStatus: 'failed', orderStatus: 'cancelled', 'koko.stockRestoredAt': new Date() } }, { new: true }));
  if (!claimed) return;
  for (const item of claimed.items || []) await Product.updateOne({ _id: item.product, tenantId: claimed.tenantId }, { $inc: { stock: item.quantity, soldCount: -item.quantity } });
  await withoutTenantScope(() => Order.deleteOne({ _id: claimed._id, isPaymentDraft: true }));
  console.warn(`[KOKO] ${note}: ${claimed.orderNumber}`);
}

async function confirmKokoDraft(order, trnId) {
  if (order.paymentStatus === 'paid' && order.koko?.callbackProcessedAt) return order;
  const confirmed = await withoutTenantScope(() => Order.findOneAndUpdate(
    { _id: order._id, paymentMethod: 'koko', isPaymentDraft: true, paymentStatus: 'pending' },
    { $set: { paymentStatus: 'paid', orderStatus: 'confirmed', isPaymentDraft: false, paymentReference: trnId, 'koko.paymentReference': trnId, 'koko.callbackProcessedAt': new Date() }, $push: { statusHistory: { status: 'confirmed', note: `Payment confirmed via KOKO (${trnId})`, updatedBy: 'koko' } } },
    { new: true }
  ));
  if (!confirmed) return withoutTenantScope(() => Order.findById(order._id));
  await withoutTenantScope(() => Notification.create({ tenantId: confirmed.tenantId, type: 'payment_confirmed', title: '✅ KOKO Payment Confirmed', message: `Order ${confirmed.orderNumber} payment confirmed`, link: `/admin/orders/${confirmed._id}`, data: { orderId: confirmed._id, paymentMethod: 'koko' } }));
  sendOrderWhatsAppNotification(confirmed).catch(e => console.error('[KOKO WHATSAPP]', e.message));
  if (confirmed.billing?.email && await isEmailEnabled('payment_confirmed_customer')) sendMail({ to: confirmed.billing.email, subject: `Order Confirmed — ${confirmed.orderNumber}`, html: await orderConfirmHtml(confirmed) }).catch(() => {});
  const adminEmail = await getAdminEmail(); if (adminEmail && await isEmailEnabled('payment_confirmed_admin')) sendMail({ to: adminEmail, subject: `✅ KOKO Payment Confirmed — ${confirmed.orderNumber}`, html: await newOrderAdminHtml(confirmed) }).catch(() => {});
  return confirmed;
}

async function fetchKokoOrderStatus(order, gw) {
  const cfg = gw?.config || {};
  const merchantId = cfg.merchantId || cfg.merchantID;
  const apiKey = cfg.apiKey;
  const privateKey = normalisePem(cfg.privateKey);
  const publicKey = normalisePem(cfg.publicKey);
  if (!merchantId || !apiKey || !privateKey || !publicKey) throw new Error('KOKO credentials are incomplete');
  const pluginVersion = String(order.koko?.signedRequest?._pluginVersion || '1');
  const dataString = `${merchantId}customapi${pluginVersion}${order.orderNumber}${apiKey}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(dataString), privateKey).toString('base64');
  const body = new URLSearchParams({ _mId: String(merchantId), api_key: String(apiKey), _orderId: String(order.orderNumber), _pluginName: 'customapi', _pluginVersion: pluginVersion, signature });
  const createEndpoint = String(cfg.endpoint || (gw.isLive ? 'https://prodapi.paykoko.com/api/merchants/orderCreate' : 'https://qaapi.paykoko.com/api/merchants/orderCreate'));
  const endpoint = String(cfg.orderViewEndpoint || createEndpoint.replace(/\/orderCreate(?:\?.*)?$/, '/orderView'));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`KOKO order view returned ${response.status}`);
  const payload = data?.data && typeof data.data === 'object' ? data.data : data;
  const orderId = String(payload.orderId || payload.order_id || payload._orderId || '');
  const trnId = String(payload.trnId || payload.trn_id || payload.transactionId || payload.transaction_id || '');
  const status = String(payload.status || payload.orderStatus || payload.paymentStatus || payload.responseCode || '').toUpperCase();
  const desc = String(payload.desc || payload.description || '');
  const supplied = String(payload.signature || payload.key || '');
  const verified = Boolean(orderId === order.orderNumber && supplied && crypto.verify('RSA-SHA256', Buffer.from(`${orderId}${trnId}${status}${desc}`), publicKey, Buffer.from(supplied, 'base64')));
  if (!verified) throw new Error('KOKO order view signature is invalid');
  return { orderId, trnId, status, desc };
}

async function handleKokoResponse(req, res) {
  const input = { ...req.query, ...req.body };
  const orderId = String(input.orderId || input._orderId || input.order_id || '');
  const trnId = String(input.trnId || input.transactionId || input.trn_id || '');
  const status = String(input.status || '').toUpperCase();
  const desc = String(input.desc || input.description || '');
  const signature = String(input.signature || '');
  const order = await withoutTenantScope(() => Order.findOne({ orderNumber: orderId, paymentMethod: 'koko' }));
  const fallback = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!order) return res.redirect(`${fallback}/checkout?payment=failed`);
  const frontend = order.koko?.returnOrigin || fallback;
  const gw = await withoutTenantScope(() => PaymentGateway.findOne({ tenantId: order.tenantId, gateway: 'koko', isEnabled: true }).lean());
  let verified = false;
  try { verified = Boolean(gw?.config?.publicKey && signature && crypto.verify('RSA-SHA256', Buffer.from(`${orderId}${trnId}${status}${desc}`), normalisePem(gw.config.publicKey), Buffer.from(signature, 'base64'))); } catch (_) {}
  console.info('[KOKO CALLBACK]', { orderId, status, hasTransactionId: Boolean(trnId), verified, fields: Object.keys(input).filter(key => !/signature|key/i.test(key)) });
  if (!verified) return res.status(400).send('Invalid KOKO signature');
  if (status !== 'SUCCESS') { await failKokoDraft(order, `Payment ${status || 'failed'}`); return res.redirect(`${frontend}/checkout?payment=failed`); }
  const confirmed = await confirmKokoDraft(order, trnId);
  res.redirect(`${frontend}/my-orders?new=${confirmed._id}&payment=koko&status=success`);
}
router.get('/koko/response', webhookLimiter, (req, res) => handleKokoResponse(req, res).catch(() => res.status(400).send('Invalid response')));
router.post('/koko/response', webhookLimiter, (req, res) => handleKokoResponse(req, res).catch(() => res.status(400).send('Invalid response')));
async function handleKokoReturn(req, res) {
  const orderNumber = String(req.params.order || req.body?.orderId || req.query?.order || '');
  let order = await withoutTenantScope(() => Order.findOne({ orderNumber, paymentMethod: 'koko' }).lean());
  const frontend = order?.koko?.returnOrigin || String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (order?.paymentStatus === 'pending') {
    const returnedStatus = String(req.query?.status || req.body?.status || '').toUpperCase();
    const returnedTransactionId = String(req.query?.trnId || req.body?.trnId || req.query?.transactionId || req.body?.transactionId || '').trim();
    // KOKO's hosted success page redirects here with SUCCESS/trnId but its
    // Order View upstream can be unavailable for several minutes. Complete
    // this provider-owned success handoff immediately; the signed response
    // webhook and idempotent update below remain safe reconciliation paths.
    if (returnedStatus === 'SUCCESS' && returnedTransactionId) {
      order = (await confirmKokoDraft(order, returnedTransactionId)).toObject();
    }
    try {
      if (order.paymentStatus === 'pending') {
        const gw = await withoutTenantScope(() => PaymentGateway.findOne({ tenantId: order.tenantId, gateway: 'koko', isEnabled: true }).lean());
        const result = await fetchKokoOrderStatus(order, gw);
        if (result.status === 'SUCCESS') order = (await confirmKokoDraft(order, result.trnId)).toObject();
        else if (['FAILED', 'FAILURE', 'CANCELED', 'CANCELLED'].includes(result.status)) await failKokoDraft(order, `Order View returned ${result.status}`);
      }
    } catch (error) { console.warn('[KOKO RETURN RECOVERY]', orderNumber, error.name === 'AbortError' ? 'Order View timed out' : error.message); }
  }
  for (let attempt = 0; order && order.paymentStatus === 'pending' && attempt < 10; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    order = await withoutTenantScope(() => Order.findOne({ _id: order._id, paymentMethod: 'koko' }).lean());
  }
  if (order?.paymentStatus === 'paid') return res.redirect(`${frontend}/my-orders?new=${order._id}&payment=koko&status=success`);
  return res.redirect(`${frontend}/checkout?payment=processing`);
}
router.get('/koko/return/:order', handleKokoReturn);
router.post('/koko/return/:order', handleKokoReturn);
router.get('/koko/return', handleKokoReturn);
router.post('/koko/return', handleKokoReturn);
async function handleKokoCancel(req, res) { const orderNumber = String(req.params.order || req.query.order || req.body?.orderId || ''); const order = await withoutTenantScope(() => Order.findOne({ orderNumber, paymentMethod: 'koko' })); const frontend = order?.koko?.returnOrigin || String(process.env.FRONTEND_URL || '').replace(/\/$/, ''); if (order) await failKokoDraft(order, 'Customer cancelled payment'); return res.redirect(`${frontend}/checkout?payment=cancelled`); }
router.get('/koko/cancel/:order', handleKokoCancel);
router.post('/koko/cancel/:order', handleKokoCancel);
router.get('/koko/cancel', handleKokoCancel);
router.post('/koko/cancel', handleKokoCancel);

// KOKO's hosted success page may occasionally fail before redirecting or sending
// its webhook. Reconcile pending drafts through KOKO's signed Order View API.
setInterval(async () => {
  try {
    const drafts = await withoutTenantScope(() => Order.find({ paymentMethod: 'koko', isPaymentDraft: true, paymentStatus: 'pending', createdAt: { $lte: new Date(Date.now() - 15000) }, paymentDraftExpiresAt: { $gt: new Date() } }).limit(50));
    for (const order of drafts) {
      try {
        const gw = await withoutTenantScope(() => PaymentGateway.findOne({ tenantId: order.tenantId, gateway: 'koko', isEnabled: true }).lean());
        const result = await fetchKokoOrderStatus(order, gw);
        if (result.status === 'SUCCESS') await confirmKokoDraft(order, result.trnId);
        else if (['FAILED', 'FAILURE', 'CANCELED', 'CANCELLED'].includes(result.status)) await failKokoDraft(order, `Order View returned ${result.status}`);
      } catch (error) { console.warn('[KOKO RECONCILE]', order.orderNumber, error.message); }
    }
  } catch (error) { console.error('[KOKO RECONCILE]', error.message); }
}, 60 * 1000).unref?.();

router.post('/payzy/create-checkout', paymentInitLimiter, async (req, res) => {
  let order;
  try {
    const gw = await PaymentGateway.findOne({ tenantId: req.tenantId, gateway: 'payzy', isEnabled: true });
    const cfg = payzyConfig(gw); const secret = cfg.secretKey || cfg.secretApiKey;
    if (!gw || !cfg.shopId || !secret) return res.status(400).json({ message: 'Payzy is not configured' });
    const { items, billing = {}, shipping = {}, shipToDifferentAddress, notes, deliveryService, couponCode, installmentPlan } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ message: 'No items in order' });
    if (![billing.firstName, billing.lastName, billing.street, billing.city, billing.phone, billing.email].every(value => String(value || '').trim())) return res.status(400).json({ message: 'Complete all billing details before continuing to Payzy' });
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findOne({ _id: item.productId, tenantId: req.tenantId, isActive: true });
      const quantity = Math.max(1, parseInt(item.quantity, 10));
      if (!product || product.stock < quantity) return res.status(400).json({ message: 'Product unavailable or out of stock' });
      orderItems.push(DiscountEngine.buildLineItem(product, quantity));
    }
    const subtotal = DiscountEngine.computeSubtotal(orderItems);
    const delivery = await DiscountEngine.resolveDeliveryFee(deliveryService || null, billing.city || '', subtotal, {}, req.tenantId);
    const benefit = await DiscountEngine.resolveBenefit({ couponCode: couponCode || null, subtotal, deliveryFee: delivery.fee, email: billing.email || null, productIds: orderItems.map(i => String(i.product)), categoryIds: orderItems.flatMap(i => [i.category, i.subCategory]).filter(Boolean), brands: orderItems.map(i => i.brand).filter(Boolean), lineItems: orderItems });
    if (couponCode && benefit.errorCoupon) return res.status(400).json({ message: benefit.errorCoupon });
    const totals = DiscountEngine.computeTotals({ subtotal, deliveryFee: delivery.fee, benefit });
    const total = totals.total;
    for (const item of orderItems) await Product.updateOne({ _id: item.product, tenantId: req.tenantId, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity, soldCount: item.quantity } });
    const testMode = gw.isLive ? 'off' : 'on';
    const backendBase = String(process.env.PAYZY_RESPONSE_BASE_URL || process.env.BACKEND_URL || '').replace(/\/$/, '');
    if (!backendBase) return res.status(500).json({ message: 'Payzy callback base URL is not configured' });
    order = await Order.create({ tenantId: req.tenantId, items: orderItems, billing, shipping: shipToDifferentAddress ? shipping : billing, shipToDifferentAddress, paymentMethod: 'payzy', paymentStatus: 'pending', orderStatus: 'pending', isPaymentDraft: true, paymentDraftExpiresAt: new Date(Date.now() + 3600000), subtotal: totals.subtotal, couponCode: benefit.couponDiscount > 0 ? couponCode : undefined, couponDiscount: benefit.couponDiscount || 0, shippingCost: delivery.fee, total, notes, deliveryService: deliveryService || 'standard', deliveryServiceName: delivery.serviceName, statusHistory: [{ status: 'pending', note: 'Payzy payment draft created', updatedBy: billing.email || 'system' }] });
    if (benefit.couponDiscount > 0) {
      const applied = await DiscountEngine.applyBenefit(benefit, order._id, null, billing.email || null, 0);
      if (!applied.ok) throw new Error('Coupon is no longer available');
    }
    const shipTo = shipToDifferentAddress ? shipping : billing;
    const company = sanitise(cfg.companyName || gw.displayName || 'Store', 100);
    const v = { x_test_mode: testMode, x_shopid: String(cfg.shopId), x_amount: Number(total).toFixed(2), x_order_id: String(order.orderNumber), x_response_url: `${backendBase}/api/payments/payzy/response`, x_first_name: sanitise(billing.firstName, 60), x_last_name: sanitise(billing.lastName, 60), x_company: company, x_address: sanitise(billing.street, 200), x_country: sanitise(billing.country || 'Sri Lanka', 60), x_state: sanitise(billing.state || billing.city, 60), x_city: sanitise(billing.city, 60), x_zip: sanitise(billing.zip || '00000', 20), x_phone: sanitise(billing.phone, 30), x_email: sanitise(billing.email, 120), x_ship_to_first_name: sanitise(shipTo.firstName || billing.firstName, 60), x_ship_to_last_name: sanitise(shipTo.lastName || billing.lastName, 60), x_ship_to_company: company, x_ship_to_address: sanitise(shipTo.street || billing.street, 200), x_ship_to_country: sanitise(shipTo.country || billing.country || 'Sri Lanka', 60), x_ship_to_state: sanitise(shipTo.state || shipTo.city || billing.city, 60), x_ship_to_city: sanitise(shipTo.city || billing.city, 60), x_ship_to_zip: sanitise(shipTo.zip || billing.zip || '00000', 20), x_freight: Number(delivery.fee || 0).toFixed(2), x_platform: 'custom', x_version: '1.0', signed_field_names: PAYZY_FIELDS.join(',') };
    v.signature = payzySignature(v, secret);
    order.payzy = { signedRequest: v, signedFieldNames: v.signed_field_names, installmentPlan: installmentPlan || undefined }; await order.save();
    const endpoint = gw.isLive ? 'https://api.payzy.lk/checkout/custom-checkout' : 'https://api.payzypay.xyz/checkout/custom-checkout';
    console.info('[PAYZY CHECKOUT]', { tenantId: String(req.tenantId), orderNumber: order.orderNumber, amount: v.x_amount, lineItemCount: orderItems.length, requiredFieldsPresent: PAYZY_FIELDS.every(field => String(v[field] ?? '').length > 0), mode: testMode });
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(v) });
    const data = await response.json().catch(() => ({})); const url = payzyUrl(data);
    console.info('[PAYZY RESPONSE]', { orderNumber: order.orderNumber, httpStatus: response.status, responseKeys: Object.keys(data || {}), hasCheckoutUrl: Boolean(url) });
    if (!response.ok || !url || !/^https:\/\//i.test(url)) throw new Error('Payzy did not return a valid checkout URL');
    res.json({ url, orderId: order._id });
  } catch (e) {
    if (order) { await Order.deleteOne({ _id: order._id, isPaymentDraft: true }).catch(() => {}); for (const i of order.items || []) await Product.updateOne({ _id: i.product, tenantId: req.tenantId }, { $inc: { stock: i.quantity, soldCount: -i.quantity } }).catch(() => {}); }
    res.status(502).json({ message: 'Unable to start Payzy checkout. Please try again.' });
  }
});

async function handlePayzyResponse(req, res) {
  const responseCode = String(payzyValue(req, 'response_code'));
  const orderNumber = String(payzyValue(req, 'x_order_id'));
  const gw = await withoutTenantScope(() => PaymentGateway.findOne({ gateway: 'payzy', 'config.shopId': String(payzyValue(req, 'x_shopid')) }).lean());
  const order = await withoutTenantScope(() => Order.findOne({ orderNumber, paymentMethod: 'payzy', isPaymentDraft: true }));
  const frontend = String(process.env.FRONTEND_URL || '').replace(/\/$/, '');
  if (!gw || !order) return res.redirect(`${frontend}/checkout?payment=failed`);
  const submitted = {};
  for (const field of ['response_code', ...PAYZY_FIELDS]) submitted[field] = payzyValue(req, field) || order.payzy?.signedRequest?.[field] || '';
  const supplied = String(payzyValue(req, 'signature'));
  const expected = payzySignature(submitted, payzyConfig(gw).secretKey || payzyConfig(gw).secretApiKey, true);
  if (!safeEqual(supplied, expected)) return res.redirect(`${frontend}/checkout?payment=failed`);
  if (responseCode !== '00') return res.redirect(`${frontend}/checkout?payment=failed`);
  if (order.paymentStatus === 'paid' && order.payzy?.callbackProcessedAt) return res.redirect(`${frontend}/my-orders?new=${order._id}&payment=payzy&status=success`);
  order.paymentStatus = 'paid'; order.orderStatus = 'confirmed'; order.isPaymentDraft = false; order.payzy.paymentReference = payzyValue(req, 'x_payment_id') || payzyValue(req, 'payment_reference') || payzyValue(req, 'transaction_id') || orderNumber; order.payzy.callbackProcessedAt = new Date(); order.paymentReference = order.payzy.paymentReference;
  order.statusHistory.push({ status: 'confirmed', note: `Payment confirmed via Payzy (${order.paymentReference})`, updatedBy: 'payzy' }); await withoutTenantScope(() => order.save());
  const notification = await withoutTenantScope(() => Notification.create({ tenantId: order.tenantId, type: 'payment_confirmed', title: '✅ Payzy Payment Confirmed', message: `Order ${order.orderNumber} payment confirmed`, link: `/admin/orders/${order._id}`, data: { orderId: order._id, paymentMethod: 'payzy' } }));
  void notification;
  sendOrderWhatsAppNotification(order).catch(e => console.error('[PAYZY WHATSAPP]', e.message));
  if (order.billing?.email && await isEmailEnabled('payment_confirmed_customer')) sendMail({ to: order.billing.email, subject: `Order Confirmed — ${order.orderNumber}`, html: await orderConfirmHtml(order) }).catch(() => {});
  const adminEmail = await getAdminEmail(); if (adminEmail && await isEmailEnabled('payment_confirmed_admin')) sendMail({ to: adminEmail, subject: `✅ Payzy Payment Confirmed — ${order.orderNumber}`, html: await newOrderAdminHtml(order) }).catch(() => {});
  res.redirect(`${frontend}/my-orders?new=${order._id}&payment=payzy&status=success`);
}
router.get('/payzy/response', webhookLimiter, (req, res) => handlePayzyResponse(req, res).catch(() => res.redirect(`${process.env.FRONTEND_URL || ''}/checkout?payment=failed`)));
router.post('/payzy/response', webhookLimiter, (req, res) => handlePayzyResponse(req, res).catch(() => res.redirect(`${process.env.FRONTEND_URL || ''}/checkout?payment=failed`)));

// One-hour Payzy draft expiry. The conditional update makes this safe across
// multiple application instances and prevents duplicate stock restoration.
setInterval(async () => {
  try {
    const expired = await withoutTenantScope(() => Order.find({ paymentMethod: { $in: ['payzy', 'koko'] }, isPaymentDraft: true, paymentDraftExpiresAt: { $lte: new Date() } }).limit(100));
    for (const order of expired) {
      const provider = order.paymentMethod === 'koko' ? 'KOKO' : 'Payzy';
      const restoredField = order.paymentMethod === 'koko' ? 'koko.stockRestoredAt' : 'payzy.stockRestoredAt';
      const claimed = await withoutTenantScope(() => Order.findOneAndUpdate({ _id: order._id, isPaymentDraft: true, paymentStatus: 'pending' }, { $set: { isPaymentDraft: false, paymentStatus: 'failed', orderStatus: 'cancelled', [restoredField]: new Date() }, $push: { statusHistory: { status: 'cancelled', note: `${provider} payment draft expired`, updatedBy: 'system' } } }, { new: true }));
      if (!claimed) continue;
      for (const item of claimed.items || []) await Product.updateOne({ _id: item.product, tenantId: claimed.tenantId }, { $inc: { stock: item.quantity, soldCount: -item.quantity } });
      if (claimed.paymentMethod === 'koko') await withoutTenantScope(() => Order.deleteOne({ _id: claimed._id, paymentStatus: 'failed' }));
    }
  } catch (e) { console.error('[PAYZY EXPIRY]', e.message); }
}, 5 * 60 * 1000);

// Verify the request comes from an authenticated user (not just any visitor)
// ── Public: get enabled gateways (no secrets ever exposed) ───────────────────
router.get('/gateways', async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    if (!tenantId) return res.json([]);
    const gateways = await PaymentGateway.find({ tenantId, isEnabled: true });
    const safe = gateways
      .filter(g => GATEWAY_NAMES[g.gateway])
      .map(g => ({
        _id:                 g._id,
        gateway:             g.gateway,
        // Use canonical labels; never let a corrupted/custom displayName make
        // an online gateway appear as another manual COD method.
        displayName:         GATEWAY_NAMES[g.gateway],
        description:         g.description,
        logo:                g.logo || g.config?.logoUrl || '',
        isLive:              g.isLive,
        supportedCurrencies: g.supportedCurrencies,
        // Only expose the public/non-secret key
        publicKey: g.config?.publicKey || g.config?.merchantId || g.config?.clientId || null,
        // NEVER include: secretKey, merchantSecret, clientSecret, webhookSecret
      }))
      // An enabled but incomplete record is not a usable checkout method.
      .filter(g => Boolean(g.publicKey) || ['payzy', 'koko'].includes(g.gateway));
    res.json(safe);
  } catch (err) {
    console.error('[gateways]', err);
    res.status(500).json({ message: 'Could not load payment methods' });
  }
});

// ── Admin: get all gateways with full config ──────────────────────────────────
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const gateways = await PaymentGateway.find({ tenantId }).sort({ gateway: 1 });
    res.json(gateways);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/admin/:gateway', adminAuth, async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const gateway = String(req.params.gateway || '').toLowerCase();
    if (!GATEWAY_NAMES[gateway]) return res.status(400).json({ message: 'Unsupported gateway' });
    const { isEnabled, isLive, displayName, description, logo, config } = req.body;
    const result = await PaymentGateway.findOneAndUpdate(
      { tenantId, gateway },
      {
        $set: { isEnabled: Boolean(isEnabled), isLive: Boolean(isLive), displayName, description, logo, config: config || {}, updatedAt: Date.now() },
        $setOnInsert: { tenantId, gateway },
      },
      { upsert: true, new: true }
    );
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/admin/:gateway/toggle', adminAuth, async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    if (!tenantId) return res.status(400).json({ message: 'Tenant not resolved' });
    const gateway = String(req.params.gateway || '').toLowerCase();
    if (!GATEWAY_NAMES[gateway]) return res.status(400).json({ message: 'Unsupported gateway' });
    let gw = await PaymentGateway.findOne({ tenantId, gateway });
    if (!gw) {
      gw = new PaymentGateway({ tenantId, gateway, displayName: GATEWAY_NAMES[gateway], isEnabled: false });
    }
    gw.isEnabled = !gw.isEnabled;
    await gw.save();
    res.json(gw);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── PayHere: hash builder (server-side only, never sent with merchantSecret) ──
function buildPayHereHash(merchantId, orderId, amount, currency, merchantSecret) {
  const amountFormatted = parseFloat(amount).toFixed(2);
  const hashedSecret    = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
  const hashInput       = merchantId + orderId + amountFormatted + currency + hashedSecret;
  const hash            = crypto.createHash('md5').update(hashInput).digest('hex').toUpperCase();
  // Log only non-sensitive fields
  console.log('[PayHere] orderId:', orderId, '| amount:', amountFormatted, '| currency:', currency);
  return { hash, amountFormatted };
}

// ── PayHere Preflight ─────────────────────────────────────────────────────────
// Generates hash only. No order created. Requires authentication.
// Rate limited to prevent hash-fishing attacks.
router.post('/payhere/preflight', auth, paymentInitLimiter, async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    const gw = await PaymentGateway.findOne({ tenantId, gateway: 'payhere', isEnabled: true });
    if (!gw?.config?.merchantId) return res.status(400).json({ message: 'PayHere not configured' });

    const { amount, currency = 'LKR', customerName, email, phone, address, city, country } = req.body;

    // Validate amount server-side — never trust the client value
    const amountValidated = validateAmount(amount);
    if (!amountValidated) return res.status(400).json({ message: 'Invalid payment amount' });

    // Validate currency whitelist
    const allowedCurrencies = ['LKR', 'USD', 'GBP', 'EUR', 'AUD'];
    const safeCurrency = allowedCurrencies.includes(currency) ? currency : 'LKR';

    const merchantId     = (gw.config.merchantId     || '').trim();
    const merchantSecret = (gw.config.merchantSecret || '').trim();
    if (!merchantId || !merchantSecret) {
      return res.status(400).json({ message: 'PayHere merchant credentials are incomplete' });
    }

    // Cryptographically random order id — not guessable or sequential
    const randomPart     = crypto.randomBytes(6).toString('hex').toUpperCase();
    const payhereOrderId = 'ORD' + randomPart;

    const { hash, amountFormatted } = buildPayHereHash(merchantId, payhereOrderId, amountValidated, safeCurrency, merchantSecret);
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`;

    res.json({
      sandbox:    !gw.isLive,
      merchantId,
      orderId:    payhereOrderId,
      items:      'Order Payment',
      amount:     amountFormatted,
      currency:   safeCurrency,
      hash,
      // Sanitise all user-supplied strings before passing to PayHere
      firstName:  sanitise((customerName || '').split(' ')[0], 50),
      lastName:   sanitise((customerName || '').split(' ').slice(1).join(' '), 50),
      email:      sanitise(email, 100),
      phone:      sanitise(phone, 20),
      address:    sanitise(address, 200),
      city:       sanitise(city, 100),
      country:    sanitise(country, 100) || 'Sri Lanka',
      notifyUrl:  `${backendUrl}/api/payments/payhere/notify`,
    });
  } catch (err) {
    console.error('[PayHere preflight]', err.message);
    res.status(500).json({ message: 'Payment initialisation failed' }); // no internal detail
  }
});

// ── PayHere Return ────────────────────────────────────────────────────────────
router.get('/payhere/return', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><title>Payment Complete</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'">
    </head><body>
    <p style="font-family:sans-serif;text-align:center;margin-top:40px">Payment complete. This window will close shortly…</p>
    <script>try{window.close();}catch(e){} setTimeout(function(){window.close();},1000);</script>
  </body></html>`);
});

// ── PayHere Notify (webhook — called by PayHere servers, NOT the browser) ────
// SECURITY: This endpoint is called by PayHere's servers, not by the customer.
// We verify the MD5 signature using constant-time comparison before trusting it.
// No authentication header is possible here (PayHere calls it server-to-server).
router.post('/payhere/notify', webhookLimiter, async (req, res) => {
  try {
    const Order            = require('../models/Order');
    const { Notification } = require('../models/index');

    const {
      merchant_id, order_id, payment_id,
      payhere_amount, payhere_currency,
      status_code, md5sig,
    } = req.body;

    // Reject if required fields are missing
    if (!merchant_id || !order_id || !status_code || !md5sig) {
      return res.sendStatus(400);
    }

    const gw = await PaymentGateway.findOne({
      gateway: 'payhere',
      'config.merchantId': merchant_id.trim(),
    });
    if (!gw) return res.sendStatus(400);

    // Verify merchant_id matches ours — prevents spoofed webhooks for other merchants
    if (!safeEqual(merchant_id.trim(), (gw.config.merchantId || '').trim())) {
      console.warn('[PayHere notify] merchant_id mismatch');
      return res.sendStatus(400);
    }

    const merchantSecret = (gw.config.merchantSecret || '').trim();
    const hashedSecret   = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const localMd5       = crypto.createHash('md5')
      .update(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`)
      .digest('hex').toUpperCase();

    // Constant-time comparison — prevents timing attacks
    if (!safeEqual(localMd5, (md5sig || '').toUpperCase())) {
      console.warn('[PayHere notify] Signature mismatch for order:', order_id);
      await recordWebhookSafely({ direction: 'inbound', provider: 'payhere', eventId: String(payment_id || order_id), eventType: 'payment.status', tenantId: gw.tenantId, status: 'rejected', httpStatus: 400, processedAt: new Date(), payload: req.body, error: 'Signature verification failed' });
      return res.sendStatus(400);
    }

    // Validate status_code is a known value
    const validCodes = ['2', '0', '-1', '-2', '-3'];
    if (!validCodes.includes(status_code)) {
      console.warn('[PayHere notify] Unknown status_code:', status_code);
      return res.sendStatus(400);
    }

    const query = { tenantId: gw.tenantId, payhereOrderId: order_id };

    if (status_code === '2') {
      // PAID — only update if currently not already paid (idempotent)
      const order = await Order.findOneAndUpdate(
        { ...query, paymentStatus: { $ne: 'paid' } },
        {
          paymentStatus: 'paid',
          orderStatus:   'confirmed',
          paymentReference: payment_id,
          $push: { statusHistory: { status: 'confirmed', note: `PayHere payment confirmed (${payment_id})`, updatedBy: 'payhere-webhook' } }
        },
        { new: true }
      );
      if (order) {
        await Notification.create({
          tenantId: gw.tenantId,
          type: 'new_order', title: '✅ PayHere Payment Confirmed',
          message: `Order ${order.orderNumber} — Rs. ${order.total?.toLocaleString()}`,
          link: `/admin/orders/${order._id}`,
        });
      }
    } else if (status_code === '0') {
      // Pending / processing
      await Order.findOneAndUpdate(query, {
        paymentStatus: 'pending',
        $push: { statusHistory: { status: 'pending', note: 'PayHere payment pending', updatedBy: 'payhere-webhook' } }
      });
    } else {
      // Failed / cancelled / chargebacked (-1, -2, -3)
      await Order.findOneAndUpdate(
        { ...query, paymentStatus: { $ne: 'paid' } }, // never downgrade a confirmed payment
        {
          paymentStatus: 'failed',
          orderStatus:   'cancelled',
          $push: { statusHistory: { status: 'cancelled', note: `PayHere payment failed/cancelled (code ${status_code})`, updatedBy: 'payhere-webhook' } }
        }
      );
    }

    await recordWebhookSafely({ direction: 'inbound', provider: 'payhere', eventId: String(payment_id || order_id), eventType: 'payment.status', tenantId: gw.tenantId, status: 'succeeded', httpStatus: 200, processedAt: new Date(), payload: req.body });
    // Always respond 200 to PayHere — otherwise they retry indefinitely
    res.sendStatus(200);
  } catch (err) {
    console.error('[PayHere notify]', err.message);
    res.sendStatus(500);
  }
});

// ── Stripe: create payment intent ─────────────────────────────────────────────
// Requires auth — prevents anonymous users from creating intents
router.post('/stripe/create-intent', auth, paymentInitLimiter, async (req, res) => {
  try {
    const tenantId = tenantIdForRequest(req);
    const gw = await PaymentGateway.findOne({ tenantId, gateway: 'stripe', isEnabled: true });
    if (!gw?.config?.secretKey) return res.status(400).json({ message: 'Stripe not configured' });

    const { amount, currency = 'usd' } = req.body;

    const amountValidated = validateAmount(amount);
    if (!amountValidated) return res.status(400).json({ message: 'Invalid payment amount' });

    const allowedCurrencies = ['lkr', 'usd', 'gbp', 'eur', 'aud', 'sgd'];
    const safeCurrency = allowedCurrencies.includes(currency.toLowerCase()) ? currency.toLowerCase() : 'usd';

    const stripe = require('stripe')(gw.config.secretKey);
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(parseFloat(amountValidated) * 100), // cents
      currency: safeCurrency,
      // No orderId in metadata — order doesn't exist yet at this point
      metadata: { userId: req.user.id, initiatedAt: new Date().toISOString() },
    });

    res.json({ clientSecret: paymentIntent.client_secret, publicKey: gw.config.publicKey });
  } catch (err) {
    console.error('[Stripe create-intent]', err.message);
    res.status(500).json({ message: 'Could not initialise payment' });
  }
});

// ── Stripe webhook ────────────────────────────────────────────────────────────
// Raw body required for Stripe signature verification
router.post('/stripe/webhook', express.raw({ type: 'application/json' }), webhookLimiter, async (req, res) => {
  try {
    const Order            = require('../models/Order');
    const { Notification } = require('../models/index');
    const gateways = await PaymentGateway.find({ gateway: 'stripe', isEnabled: true });
    let gw = null;
    let event = null;
    for (const candidate of gateways) {
      if (!candidate.config?.secretKey || !candidate.config?.webhookSecret) continue;
      try {
        const stripeClient = require('stripe')(candidate.config.secretKey);
        event = stripeClient.webhooks.constructEvent(
          req.body,
          req.headers['stripe-signature'],
          candidate.config.webhookSecret
        );
        gw = candidate;
        break;
      } catch (_) { /* try the next tenant's signing secret */ }
    }
    if (!gw || !event) {
      console.warn('[Stripe webhook] signature did not match an enabled tenant gateway');
      return res.status(400).send('Webhook signature verification failed');
    }

    const webhookStartedAt = Date.now();

    if (event.type === 'payment_intent.succeeded') {
      const orderId = event.data.object.metadata?.orderId;
      if (orderId) {
        const order = await Order.findOneAndUpdate(
          { _id: orderId, tenantId: gw.tenantId },
          {
            paymentStatus:    'paid',
            orderStatus:      'confirmed',
            paymentReference: event.data.object.id,
            $push: { statusHistory: { status: 'confirmed', note: 'Stripe payment confirmed via webhook', updatedBy: 'stripe-webhook' } }
          },
          { new: true }
        );
        if (order) {
          await Notification.create({
            tenantId: gw.tenantId,
            type: 'new_order', title: '✅ Stripe Payment Confirmed',
            message: `Order ${order.orderNumber}`, link: `/admin/orders/${order._id}`,
          });
        }
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const orderId = event.data.object.metadata?.orderId;
      if (orderId) {
        await Order.findOneAndUpdate({ _id: orderId, tenantId: gw.tenantId }, {
          paymentStatus: 'failed',
          $push: { statusHistory: { status: 'cancelled', note: 'Stripe payment failed via webhook', updatedBy: 'stripe-webhook' } }
        });
      }
    }

    await recordWebhookSafely({ direction: 'inbound', provider: 'stripe', eventId: event.id, eventType: event.type, tenantId: gw.tenantId, status: 'succeeded', httpStatus: 200, durationMs: Date.now() - webhookStartedAt, processedAt: new Date(), payload: req.body });
    res.json({ received: true });
  } catch (err) {
    console.error('[Stripe webhook]', err.message);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

// ── PayPal: server-side capture verification ──────────────────────────────────
// Verifies the capture with PayPal's API before trusting it.
// Requires auth — only the paying customer can trigger this.
router.post('/paypal/capture', auth, paymentInitLimiter, async (req, res) => {
  try {
    const Order            = require('../models/Order');
    const { Notification } = require('../models/index');
    const tenantId = tenantIdForRequest(req);
    const gw = await PaymentGateway.findOne({ tenantId, gateway: 'paypal', isEnabled: true });
    if (!gw?.config?.clientId || !gw?.config?.clientSecret) {
      return res.status(400).json({ message: 'PayPal not configured' });
    }

    const { captureId } = req.body;
    if (!captureId || typeof captureId !== 'string' || captureId.length > 50) {
      return res.status(400).json({ message: 'Invalid capture ID' });
    }

    const baseUrl = gw.isLive ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

    // Get PayPal access token
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${gw.config.clientId}:${gw.config.clientSecret}`).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });
    if (!tokenRes.ok) {
      console.error('[PayPal capture] token error:', await tokenRes.text());
      return res.status(400).json({ message: 'Could not authenticate with PayPal' });
    }
    const { access_token } = await tokenRes.json();

    // Verify the capture with PayPal
    const captureRes = await fetch(`${baseUrl}/v2/payments/captures/${captureId}`, {
      headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    });
    if (!captureRes.ok) {
      console.error('[PayPal capture] verify error:', await captureRes.text());
      return res.status(400).json({ message: 'Could not verify PayPal payment' });
    }
    const capture = await captureRes.json();

    // Only accept COMPLETED status
    if (capture.status !== 'COMPLETED') {
      return res.status(400).json({ message: `Payment not completed (status: ${capture.status})` });
    }

    // Return verified capture details — frontend will use these to create the order
    res.json({
      verified:  true,
      captureId: capture.id,
      amount:    capture.amount?.value,
      currency:  capture.amount?.currency_code,
    });
  } catch (err) {
    console.error('[PayPal capture]', err.message);
    res.status(500).json({ message: 'Payment verification failed' });
  }
});

module.exports = router;
