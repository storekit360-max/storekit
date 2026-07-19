const { Resend } = require('resend');
const nodemailer = require('nodemailer');
const Tenant = require('../models/Tenant');
const { currentTenantId, withoutTenantScope } = require('../middleware/tenantContext');
const { resolvedIntegration } = require('../services/platformIntegrationService');

// ── Resend client ─────────────────────────────────────────────────────────────
const getResendClient = (overrideApiKey = '') => {
  const apiKey = (overrideApiKey || process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(apiKey);
};

const looksUnset = (value) => {
  const v = String(value || '').trim().toLowerCase();
  return !v || v.includes('your_') || v.includes('change_this') || v.includes('example');
};

const hasSmtpConfig = (config = {}) => (
  !looksUnset(config.host || process.env.EMAIL_HOST)
  && !looksUnset(config.username || process.env.EMAIL_USER)
  && !looksUnset(config.password || process.env.EMAIL_PASS)
);

const freeEmailProviders = ['@gmail.', '@yahoo.', '@hotmail.', '@outlook.', '@live.', '@icloud.'];

const isFreeMailAddress = (value) => {
  const v = String(value || '').toLowerCase();
  return freeEmailProviders.some(p => v.includes(p));
};

const extractEmailAddress = (value) => {
  const raw = String(value || '').trim();
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
};

const sanitizeFromName = (value) => (
  String(value || 'StoreKit')
    .replace(/[\r\n<>"]/g, '')
    .trim()
    .slice(0, 80) || 'StoreKit'
);

const formatAddress = (name, email) => `${sanitizeFromName(name)} <${extractEmailAddress(email)}>`;

const createSmtpTransport = (config = {}) => nodemailer.createTransport({
  host: config.host || process.env.EMAIL_HOST,
  port: Number(config.port || process.env.EMAIL_PORT || 587),
  secure: config.secure === true || String(config.secure ?? process.env.EMAIL_PORT ?? '') === '465',
  auth: {
    user: config.username || process.env.EMAIL_USER,
    pass: config.password || process.env.EMAIL_PASS,
  },
});

// ── SMTP connection verification (called once at startup) ─────────────────────
const verifySmtp = async () => {
  try {
    const smtp = await resolvedIntegration('smtp').catch(() => null);
    const smtpConfig = smtp ? { ...smtp.config, ...smtp.secrets } : {};
    if (smtp?.enabled !== false && hasSmtpConfig(smtpConfig)) {
      await createSmtpTransport(smtpConfig).verify();
      console.log('[MAIL] ✅ SMTP verified — emails will work');
      return;
    }

    const resendConfig = await resolvedIntegration('resend').catch(() => null);
    const resend = getResendClient(resendConfig?.secrets?.apiKey);
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'delivered@resend.dev',
      subject: 'SMTP verify test',
      html: '<p>test</p>',
    });
    console.log('[MAIL] ✅ Resend API verified — emails will work');
  } catch (err) {
    console.error('[MAIL] ❌ Email provider verification failed:', err.message);
    console.error('[MAIL] ⚠️  Configure either RESEND_API_KEY or EMAIL_HOST/EMAIL_USER/EMAIL_PASS in Railway env vars.');
  }
};

// ── From address helper ───────────────────────────────────────────────────────
const getFromAddress = async (theme) => {
  // Resend requires a VERIFIED domain to send from custom addresses.
  // Gmail/Yahoo/Hotmail addresses are NEVER allowed as senders in Resend.
  // REACT_APP_RESEND_DOMAIN or EMAIL_FROM should only be set once your domain
  // (e.g. storekit.local) is verified in the Resend dashboard.
  //
  // Until then, always use onboarding@resend.dev — Resend's pre-verified
  // test sender that works with any Resend API key.
  const storeName = theme?.emailFromName || theme?.storeName || 'StoreKit';

  if (theme?.emailFromAddress && !looksUnset(theme.emailFromAddress) && !isFreeMailAddress(theme.emailFromAddress)) {
    return formatAddress(storeName, theme.emailFromAddress);
  }

  // Only use a custom from address if it is NOT a free email provider
  if (process.env.EMAIL_FROM) {
    const addr = process.env.EMAIL_FROM;
    if (!isFreeMailAddress(addr)) return formatAddress(storeName, addr); // custom/business domain — use it
  }

  // Fallback: Resend's safe test sender (always works, no domain verification needed)
  return `${storeName} <onboarding@resend.dev>`;
};

const getSmtpFromAddress = (theme, config = {}) => (
  theme?.emailFromAddress && !looksUnset(theme.emailFromAddress)
    ? formatAddress(theme.emailFromName || theme.storeName, theme.emailFromAddress)
    : (config.fromAddress || process.env.EMAIL_FROM) && !looksUnset(config.fromAddress || process.env.EMAIL_FROM)
      ? formatAddress(theme?.emailFromName || theme?.storeName || 'StoreKit', config.fromAddress || process.env.EMAIL_FROM)
      : formatAddress(theme?.emailFromName || theme?.storeName || 'StoreKit', config.username || process.env.EMAIL_USER)
);

// ── sendMail ──────────────────────────────────────────────────────────────────
const sendMail = async ({ to, subject, html, tenantId, tenant }) => {
  try {
    if (process.env.APP_ENV === 'staging' && process.env.EMAIL_ENABLED !== 'true') {
      console.log('[MAIL] Staging delivery disabled');
      return { skipped: true, reason: 'staging_disabled' };
    }
    const theme = await getTheme({ tenantId, tenant }).catch(() => ({ storeName: 'StoreKit', primary: '#15803d' }));
    const smtp = await resolvedIntegration('smtp').catch(() => null);
    const smtpConfig = smtp ? { ...smtp.config, ...smtp.secrets } : {};

    if (smtp?.enabled !== false && hasSmtpConfig(smtpConfig)) {
      const from = getSmtpFromAddress(theme, smtpConfig);
      const replyTo = theme.emailReplyTo || theme.storeEmail || undefined;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[MAIL] Sending via SMTP | from:${from} → to:${to}`);
      }
      const info = await createSmtpTransport(smtpConfig).sendMail({ from, to, subject, html, replyTo });
      console.log(`[MAIL SENT] To:${to} | ${subject} | id:${info?.messageId}`);
      return info;
    }

    const resendConfig = await resolvedIntegration('resend').catch(() => null);
    const resend = getResendClient(theme.resendApiKey || (resendConfig?.enabled !== false ? resendConfig?.secrets?.apiKey : ''));
    const from = await getFromAddress(theme);
    const replyTo = theme.emailReplyTo || theme.storeEmail || undefined;

    // Dev-mode hint: remind developers which sender is being used
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MAIL] Sending via Resend | from:${from} → to:${to}`);
    }

    const { data, error } = await resend.emails.send({ from, to, subject, html, replyTo });

    if (error) {
      // Resend returns structured errors — surface them clearly
      const msg = error.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      throw new Error(msg);
    }

    console.log(`[MAIL SENT] To:${to} | ${subject} | id:${data?.id}`);
    return data;
  } catch (e) {
    console.error('[MAIL ERROR]', e.message);
    // In production, log full error for Railway/Render log viewers
    if (process.env.NODE_ENV === 'production') {
      console.error('[MAIL ERROR DETAIL]', JSON.stringify(e, Object.getOwnPropertyNames(e)));
    }
    const wrapped = new Error(`Failed to send email to ${to}: ${e.message}`);
    wrapped.originalError = e;
    throw wrapped;
  }
};

// ── Admin email helper ────────────────────────────────────────────────────────
const getAdminEmail = async () => {
  try {
    const tenantId = currentTenantId();
    if (tenantId) {
      const tenant = await withoutTenantScope(() => Tenant.findById(tenantId).populate('owner', 'email').lean());
      const settings = tenant?.settings || {};
      if (settings.orderNotificationEmail) return settings.orderNotificationEmail;
      if (settings.adminEmail) return settings.adminEmail;
      if (tenant?.owner?.email) return tenant.owner.email;
      if (settings.storeEmail) return settings.storeEmail;
    }

    const { Settings } = require('../models/index');
    const row = await Settings.findOne({ key: 'adminEmail' }).lean();
    if (row?.value) return row.value;
    const smtpRow = await Settings.findOne({ key: 'smtpUser' }).lean();
    if (smtpRow?.value) return smtpRow.value;
  } catch {}
  if (process.env.ADMIN_EMAIL) return process.env.ADMIN_EMAIL;
  if (process.env.EMAIL_USER)  return process.env.EMAIL_USER;
  return null;
};

// ── Theme helper ──────────────────────────────────────────────────────────────
let _themeCache = new Map();
const THEME_TTL_MS = 60_000;

const getTheme = async ({ tenantId, tenant } = {}) => {
  const resolvedTenantId = tenant?._id || tenantId || currentTenantId();
  const cacheKey = resolvedTenantId ? `tenant:${resolvedTenantId}` : 'global';
  const now = Date.now();
  const cached = _themeCache.get(cacheKey);
  if (cached && now - cached.at < THEME_TTL_MS) return cached.value;

  try {
    if (tenant || resolvedTenantId) {
      const row = tenant || await withoutTenantScope(() => Tenant.findById(resolvedTenantId).lean());
      if (row) {
        const settings = row.settings || {};
        const theme = row.theme || {};
        const value = {
          primary:          theme.primaryColor || settings.primaryColor || '#15803d',
          storeName:        row.storeName || settings.storeName || 'StoreKit',
          storeEmail:       settings.storeEmail || '',
          emailFromName:    settings.emailFromName || row.storeName || 'StoreKit',
          emailFromAddress: settings.emailFromAddress || '',
          emailReplyTo:     settings.emailReplyTo || settings.storeEmail || '',
          resendApiKey:     settings.resendApiKey || '',
        };
        _themeCache.set(cacheKey, { at: now, value });
        return value;
      }
    }

    const { Settings } = require('../models/index');
    const rows = await Settings.find(
      { key: { $in: ['primaryColor', 'storeName', 'storeEmail', 'emailFromName', 'emailFromAddress', 'emailReplyTo'] } },
      'key value'
    ).lean();
    const map = {};
    rows.forEach(r => { map[r.key] = r.value; });
    const value = {
      primary:          map.primaryColor || '#15803d',
      storeName:        map.storeName || 'StoreKit',
      storeEmail:       map.storeEmail || '',
      emailFromName:    map.emailFromName || map.storeName || 'StoreKit',
      emailFromAddress: map.emailFromAddress || '',
      emailReplyTo:     map.emailReplyTo || map.storeEmail || '',
    };
    _themeCache.set(cacheKey, { at: now, value });
    return value;
  } catch (err) {
    console.warn('[MAIL] Could not load theme from DB, using defaults:', err.message);
    const value = { primary: '#15803d', storeName: 'StoreKit', emailFromName: 'StoreKit' };
    _themeCache.set(cacheKey, { at: now, value });
    return value;
  }
};

const clearThemeCache = () => { _themeCache.clear(); };

// ── Shared layout helpers ─────────────────────────────────────────────────────
const lighten = (hex) => {
  try {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const mix = (c) => Math.min(255, Math.round(c + (255 - c) * 0.35));
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  } catch (_) { return '#22c55e'; }
};

const header = (subtitle, theme) => `
  <div style="background:linear-gradient(135deg,${theme.primary},${lighten(theme.primary)});padding:32px;text-align:center">
    <h1 style="color:white;margin:0;font-size:26px;font-family:sans-serif">${theme.storeName}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;font-family:sans-serif">${subtitle}</p>
  </div>`;

const footer = (theme) => `
  <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e5e7eb">
    <p style="color:#9ca3af;font-size:12px;margin:0;font-family:sans-serif">© ${new Date().getFullYear()} ${theme.storeName} · All rights reserved</p>
  </div>`;

const wrapper = (content, theme) => `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f1f5f9;padding:40px 20px;margin:0">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.09)">
    ${content}
    ${footer(theme)}
  </div></body></html>`;

// ── OTP email ─────────────────────────────────────────────────────────────────
const otpEmailHtml = async (otp, name, options = {}) => {
  const t = await getTheme(options);
  return wrapper(`
    ${header('Password Reset OTP', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${name}</strong>,</p>
      <p style="color:#6b7280;font-size:14px">Your OTP to reset your password:</p>
      <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin:20px 0">
        <span style="font-size:40px;font-weight:800;letter-spacing:12px;color:${t.primary};font-family:monospace">${otp}</span>
      </div>
      <p style="color:#9ca3af;font-size:13px">Expires in <strong>10 minutes</strong>. Do not share with anyone.</p>
    </div>`, t);
};

// ── Order placed confirmation email (customer) ────────────────────────────────
const orderConfirmHtml = async (order) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const itemRows = (order.items || []).map(item => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${item.name} × ${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;text-align:right;font-weight:600">${sym} ${item.subtotal?.toLocaleString()}</td>
    </tr>`).join('');
  const bankBlock = order.paymentMethod === 'bank_transfer' ? `
    <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:16px;margin:20px 0">
      <p style="margin:0 0 8px;font-weight:700;color:#92400e;font-size:14px">⚠️ Action Required — Bank Transfer</p>
      <p style="margin:0;color:#92400e;font-size:13px;line-height:1.6">
        Please transfer <strong>${sym} ${order.total?.toLocaleString()}</strong> to the store bank account and upload your payment slip.<br><br>
        Use <strong>${order.orderNumber}</strong> as the payment reference.
      </p>
    </div>` : '';
  return wrapper(`
    ${header('Order Confirmed! 🎉', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 4px">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px">
        ${order.paymentMethod === 'bank_transfer'
          ? 'Your order has been placed! Complete your bank transfer to confirm it.'
          : 'Your order has been received and is being processed.'}
      </p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <p style="margin:0;font-size:12px;color:#6b7280">Order Number</p>
        <p style="margin:4px 0 0;font-size:22px;font-weight:800;color:${t.primary};font-family:monospace">${order.orderNumber}</p>
      </div>
      ${bankBlock}
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">ITEM</th>
            <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600">AMOUNT</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          ${order.couponDiscount > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#059669">Coupon (${order.couponCode})</td><td style="padding:8px 12px;font-size:13px;color:#059669;text-align:right">−${sym} ${order.couponDiscount?.toLocaleString()}</td></tr>` : ''}
          ${order.giftCardDiscount > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#059669">Gift Card</td><td style="padding:8px 12px;font-size:13px;color:#059669;text-align:right">−${sym} ${order.giftCardDiscount?.toLocaleString()}</td></tr>` : ''}
          <tr><td style="padding:8px 12px;font-size:13px;color:#6b7280">Shipping</td><td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:right">${sym} ${(order.shippingCost || 0).toLocaleString()}</td></tr>
          <tr style="border-top:2px solid #e5e7eb"><td style="padding:12px;font-size:15px;font-weight:700;color:#111">Total</td><td style="padding:12px;font-size:15px;font-weight:700;color:${t.primary};text-align:right">${sym} ${order.total?.toLocaleString()}</td></tr>
        </tfoot>
      </table>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151;line-height:1.6">
        <strong>Shipping to:</strong><br>
        ${order.billing?.firstName} ${order.billing?.lastName}<br>
        ${order.billing?.street}, ${order.billing?.city}<br>
        ${order.billing?.phone}
      </div>
    </div>`, t);
};

// ── New order notification to admin ──────────────────────────────────────────
const newOrderAdminHtml = async (order) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const paymentLabels = {
    bank_transfer: '🏦 Bank Transfer',
    cod: '💵 Cash on Delivery',
    payhere: '💳 PayHere',
    stripe: '💳 Stripe',
    paypal: '💳 PayPal',
  };
  const itemRows = (order.items || []).map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${item.name} × ${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:600;color:#111">${sym} ${item.subtotal?.toLocaleString()}</td>
    </tr>`).join('');
  return wrapper(`
    ${header('🛒 New Order Received!', t)}
    <div style="padding:32px">
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;color:#166534">New Order</p>
        <p style="margin:0;font-size:24px;font-weight:800;color:#15803d;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:18px;font-weight:700;color:#166534">${sym} ${order.total?.toLocaleString()}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Customer</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${order.billing?.firstName} ${order.billing?.lastName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.email}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Phone</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.phone}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">City</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.city}, ${order.billing?.country}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Payment</td><td style="padding:8px 0;font-size:13px;color:#111">${paymentLabels[order.paymentMethod] || order.paymentMethod}</td></tr>
        ${order.notes ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Notes</td><td style="padding:8px 0;font-size:13px;color:#111">${order.notes}</td></tr>` : ''}
      </table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">ITEM</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">SUBTOTAL</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #e5e7eb"><td style="padding:10px 12px;font-size:14px;font-weight:700;color:#111">Total</td><td style="padding:10px 12px;font-size:14px;font-weight:700;color:${t.primary};text-align:right">${sym} ${order.total?.toLocaleString()}</td></tr>
        </tfoot>
      </table>
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/orders/${order._id}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        View Order in Dashboard →
      </a>
    </div>`, t);
};

// ── Slip uploaded notification to admin ───────────────────────────────────────
const slipUploadedAdminHtml = async (order, slipUrl) => {
  const t = await getTheme();
  return wrapper(`
    ${header('📎 Payment Slip Uploaded', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 16px">A customer has uploaded a payment slip for order <strong>${order.orderNumber}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Customer</td><td style="padding:8px 0;font-size:13px;color:#111;font-weight:600">${order.billing?.firstName} ${order.billing?.lastName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.email}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Phone</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.phone}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Order Total</td><td style="padding:8px 0;font-size:13px;font-weight:700;color:${t.primary}">Rs. ${order.total?.toLocaleString()}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Uploaded At</td><td style="padding:8px 0;font-size:13px;color:#111">${new Date().toLocaleString('en-LK')}</td></tr>
      </table>
      ${slipUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(slipUrl) ? `
        <p style="font-size:13px;color:#6b7280;margin-bottom:8px">Payment slip preview:</p>
        <img src="${slipUrl}" alt="Payment Slip" style="width:100%;max-height:300px;object-fit:contain;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:16px" />
      ` : slipUrl ? `
        <p style="font-size:13px;color:#6b7280;margin-bottom:16px">Payment slip: <a href="${slipUrl}" style="color:${t.primary}">View PDF</a></p>
      ` : ''}
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/orders/${order._id}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        Review &amp; Confirm Payment →
      </a>
    </div>`, t);
};

// ── Slip received confirmation to customer ────────────────────────────────────
const slipReceivedCustomerHtml = async (order) => {
  const t = await getTheme();
  return wrapper(`
    ${header('Payment Slip Received ✅', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px">We've received your payment slip for order <strong style="color:${t.primary}">${order.orderNumber}</strong>. Our team will verify your payment shortly and confirm your order.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin:20px 0;text-align:center">
        <p style="margin:0;font-size:13px;color:#166534">⏳ Payment verification usually takes <strong>1–2 business hours</strong>.<br>You'll receive another email once confirmed.</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151">
        <strong>Order:</strong> ${order.orderNumber}<br>
        <strong>Total:</strong> Rs. ${order.total?.toLocaleString()}<br>
        <strong>Payment Method:</strong> Bank Transfer
      </div>
    </div>`, t);
};

// ── Payment confirmed email to customer ──────────────────────────────────────
const paymentConfirmedHtml = async (order) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const itemRows = (order.items || []).map(item => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${item.name} × ${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;text-align:right;font-weight:600">${sym} ${item.subtotal?.toLocaleString()}</td>
    </tr>`).join('');
  return wrapper(`
    ${header('✅ Payment Confirmed!', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Great news! Your payment has been verified and your order is now <strong style="color:#16a34a">confirmed</strong>. We'll begin processing it right away.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#166534">Order Number</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#15803d;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#166534;font-weight:600">✓ Payment Verified &amp; Confirmed</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">ITEM</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600">AMOUNT</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          ${order.couponDiscount > 0 ? `<tr><td style="padding:8px 12px;font-size:13px;color:#059669">Coupon</td><td style="padding:8px 12px;font-size:13px;color:#059669;text-align:right">−${sym} ${order.couponDiscount?.toLocaleString()}</td></tr>` : ''}
          <tr><td style="padding:8px 12px;font-size:13px;color:#6b7280">Shipping</td><td style="padding:8px 12px;font-size:13px;color:#6b7280;text-align:right">${sym} ${(order.shippingCost || 0).toLocaleString()}</td></tr>
          <tr style="border-top:2px solid #e5e7eb"><td style="padding:12px;font-size:15px;font-weight:700;color:#111">Total Paid</td><td style="padding:12px;font-size:15px;font-weight:700;color:#15803d;text-align:right">${sym} ${order.total?.toLocaleString()}</td></tr>
        </tfoot>
      </table>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151;line-height:1.6">
        <strong>Shipping to:</strong><br>
        ${order.billing?.firstName} ${order.billing?.lastName}<br>
        ${order.billing?.street}, ${order.billing?.city}<br>
        ${order.billing?.phone}
      </div>
      <p style="margin-top:20px;color:#9ca3af;font-size:12px;text-align:center">
        You'll receive tracking details once your order is shipped. Thank you for shopping with ${t.storeName}!
      </p>
    </div>`, t);
};

// ── Order cancelled confirmation to customer ─────────────────────────────────
const orderCancelledHtml = async (order) => {
  const t = await getTheme();
  return wrapper(`
    ${header('Order Cancelled', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">
        Your cancellation request for order <strong style="color:${t.primary}">${order.orderNumber}</strong> has been approved. The order has been cancelled.
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#991b1b">Cancelled Order</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#dc2626;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#991b1b">Total: Rs. ${order.total?.toLocaleString()}</p>
      </div>
      ${order.cancelRequest?.reason ? `<div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151;margin-bottom:16px"><strong>Cancellation reason:</strong> ${order.cancelRequest.reason}</div>` : ''}
      <p style="color:#9ca3af;font-size:12px;text-align:center">If you have any questions, please contact our support team. Thank you for shopping with ${t.storeName}!</p>
    </div>`, t);
};

// ── Cancel request received confirmation to customer ─────────────────────────
const cancelRequestReceivedCustomerHtml = async (order) => {
  const t = await getTheme();
  return wrapper(`
    ${header('Cancellation Request Received', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">
        We received your cancellation request for order <strong style="color:${t.primary}">${order.orderNumber}</strong>. Our team will review it and respond shortly.
      </p>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#854d0e;font-weight:600">Under Review</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#854d0e;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#854d0e">Total: Rs. ${order.total?.toLocaleString()}</p>
      </div>
      ${order.cancelRequest?.reason ? `<div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151;margin-bottom:16px"><strong>Your reason:</strong> ${order.cancelRequest.reason}</div>` : ''}
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;font-size:13px;color:#0369a1;margin-bottom:20px">
        ℹ️ You will receive an email once the decision is made. Do not re-order until your cancellation is confirmed.
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for shopping with ${t.storeName}!</p>
    </div>`, t);
};

// ── Cancel request notification to admin ─────────────────────────────────────
const cancelRequestAdminHtml = async (order) => {
  const t = await getTheme();
  return wrapper(`
    ${header('🚫 Cancel Request Received', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 16px">A customer has requested to cancel order <strong>${order.orderNumber}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Customer</td><td style="padding:8px 0;font-size:13px;color:#111;font-weight:600">${order.billing?.firstName} ${order.billing?.lastName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.email}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Order Total</td><td style="padding:8px 0;font-size:13px;font-weight:700;color:${t.primary}">Rs. ${order.total?.toLocaleString()}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Order Status</td><td style="padding:8px 0;font-size:13px;color:#111;text-transform:capitalize">${order.orderStatus}</td></tr>
        ${order.cancelRequest?.reason ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Reason</td><td style="padding:8px 0;font-size:13px;color:#111">${order.cancelRequest.reason}</td></tr>` : ''}
      </table>
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/orders/${order._id}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        Review Cancel Request →
      </a>
    </div>`, t);
};

// ── Cancel request rejected notification to customer ─────────────────────────
const cancelRejectedHtml = async (order) => {
  const t = await getTheme();
  return wrapper(`
    ${header('Cancellation Request Update', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">
        Unfortunately your cancellation request for order <strong style="color:${t.primary}">${order.orderNumber}</strong> could not be approved as the order is already being processed.
      </p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <p style="margin:0;font-size:13px;color:#166534">Your order is on its way! 📦<br>You'll receive tracking details once shipped.</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center">If you have concerns, please contact our support team. Thank you for shopping with ${t.storeName}!</p>
    </div>`, t);
};

// ── Order status update email to customer ─────────────────────────────────────
const orderStatusUpdateHtml = async (order, newStatus, note) => {
  const t = await getTheme();
  const statusLabels = {
    confirmed:'Confirmed ✅', processing:'Processing 🔄', shipped:'Shipped 📦',
    out_for_delivery:'Out for Delivery 🚚', delivered:'Delivered ✅',
    cancelled:'Cancelled ❌', refunded:'Refunded 💰',
  };
  const statusColors = {
    confirmed:'#16a34a', processing:'#d97706', shipped:'#2563eb',
    out_for_delivery:'#7c3aed', delivered:'#16a34a',
    cancelled:'#dc2626', refunded:'#6b7280',
  };
  const color = statusColors[newStatus] || t.primary;
  const label = statusLabels[newStatus] || newStatus;
  return wrapper(`
    ${header(`Order ${label}`, t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Your order status has been updated.</p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px;border:2px solid ${color}20">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Order ${order.orderNumber}</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:${color}">${label}</p>
        ${note ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280">${note}</p>` : ''}
      </div>
      ${order.trackingNumber ? `<div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151;margin-bottom:16px"><strong>Tracking Number:</strong> <span style="font-family:monospace;font-weight:700">${order.trackingNumber}</span>${order.deliveryPartner ? ` via ${order.deliveryPartner}` : ''}</div>` : ''}
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for shopping with ${t.storeName}!</p>
    </div>`, t);
};

// ── Payment confirmed notification to admin ───────────────────────────────────
const paymentConfirmedAdminHtml = async (order) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const paymentLabels = {
    bank_transfer: '🏦 Bank Transfer (Slip Verified)',
    cod: '💵 Cash on Delivery',
    payhere: '💳 PayHere',
    stripe: '💳 Stripe',
    paypal: '💳 PayPal',
  };
  return wrapper(`
    ${header('✅ Payment Confirmed — Admin Copy', t)}
    <div style="padding:32px">
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;color:#166534">Payment Verified</p>
        <p style="margin:0;font-size:24px;font-weight:800;color:#15803d;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:18px;font-weight:700;color:#166534">${sym} ${order.total?.toLocaleString()}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Customer</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${order.billing?.firstName} ${order.billing?.lastName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.email}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Phone</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.phone}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Payment Method</td><td style="padding:8px 0;font-size:13px;color:#111">${paymentLabels[order.paymentMethod] || order.paymentMethod}</td></tr>
        ${order.paymentReference ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Reference</td><td style="padding:8px 0;font-size:13px;font-family:monospace;color:#111">${order.paymentReference}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Confirmed At</td><td style="padding:8px 0;font-size:13px;color:#111">${new Date().toLocaleString('en-LK')}</td></tr>
      </table>
      <p style="font-size:13px;color:#6b7280;margin-bottom:16px">The customer has been notified by email. The order is now confirmed and ready for processing.</p>
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/orders/${order._id}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        View Order in Dashboard →
      </a>
    </div>`, t);
};

// ── Order delivered email to customer (dedicated) ─────────────────────────────
const orderDeliveredCustomerHtml = async (order, note) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const itemRows = (order.items || []).map(item => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${item.name} × ${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;text-align:right;font-weight:600">${sym} ${item.subtotal?.toLocaleString()}</td>
    </tr>`).join('');
  return wrapper(`
    ${header('📦 Order Delivered! 🎉', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${order.billing?.firstName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Your order has been delivered successfully. We hope you love your purchase!</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#166534">Delivered ✅</p>
        <p style="margin:0;font-size:24px;font-weight:800;color:#15803d;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#166534">Delivered on ${new Date().toLocaleDateString('en-LK', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        ${note ? `<p style="margin:8px 0 0;font-size:13px;color:#166534;font-style:italic">${note}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">ITEM</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600">AMOUNT</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #e5e7eb"><td style="padding:12px;font-size:15px;font-weight:700;color:#111">Total Paid</td><td style="padding:12px;font-size:15px;font-weight:700;color:#15803d;text-align:right">${sym} ${order.total?.toLocaleString()}</td></tr>
        </tfoot>
      </table>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px">
        <p style="margin:0;font-size:14px;font-weight:600;color:#854d0e">Enjoyed your order? Leave us a review! ⭐</p>
        <p style="margin:6px 0 0;font-size:13px;color:#92400e">Your feedback helps us serve you better.</p>
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for shopping with ${t.storeName}! 🙏</p>
    </div>`, t);
};

// ── Order status change notification to admin ─────────────────────────────────
const orderStatusAdminHtml = async (order, newStatus, note) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const statusLabels = {
    confirmed: 'Confirmed ✅', processing: 'Processing 🔄', shipped: 'Shipped 📦',
    out_for_delivery: 'Out for Delivery 🚚', delivered: 'Delivered ✅',
    cancelled: 'Cancelled ❌', refunded: 'Refunded 💰',
  };
  const statusColors = {
    confirmed: '#16a34a', processing: '#d97706', shipped: '#2563eb',
    out_for_delivery: '#7c3aed', delivered: '#16a34a',
    cancelled: '#dc2626', refunded: '#6b7280',
  };
  const color = statusColors[newStatus] || t.primary;
  const label = statusLabels[newStatus] || newStatus;
  const paymentLabels = {
    bank_transfer: '🏦 Bank Transfer', cod: '💵 Cash on Delivery',
    payhere: '💳 PayHere', stripe: '💳 Stripe', paypal: '💳 PayPal',
  };
  return wrapper(`
    ${header(`Order Status: ${label}`, t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 16px">An order status has been updated in your store.</p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px;border:2px solid ${color}30">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Order ${order.orderNumber}</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:${color}">${label}</p>
        ${note ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280">${note}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Customer</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${order.billing?.firstName} ${order.billing?.lastName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.email}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Phone</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.phone}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Order Total</td><td style="padding:8px 0;font-size:13px;font-weight:700;color:${t.primary}">${sym} ${order.total?.toLocaleString()}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Payment</td><td style="padding:8px 0;font-size:13px;color:#111">${paymentLabels[order.paymentMethod] || order.paymentMethod}</td></tr>
        ${order.trackingNumber ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Tracking</td><td style="padding:8px 0;font-size:13px;font-family:monospace;font-weight:700;color:#111">${order.trackingNumber}${order.deliveryPartner ? ` via ${order.deliveryPartner}` : ''}</td></tr>` : ''}
      </table>
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/orders/${order._id}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        View Order in Dashboard →
      </a>
    </div>`, t);
};

// ── Auto cancel-decision notification to admin ────────────────────────────────

// ── Return request submitted — customer confirmation ──────────────────────────
const returnRequestCustomerHtml = async ({ customerName, orderNumber, returnId, reason, items, description }) => {
  const t = await getTheme();
  const itemRows = (items || []).map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${item.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:right;text-transform:capitalize">${item.condition || 'opened'}</td>
    </tr>`).join('');
  return wrapper(`
    ${header('Return Request Received \u{1F504}', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">We have received your return request for order <strong style="color:${t.primary}">${orderNumber}</strong>. Our team will review it within 24 hours and get back to you.</p>
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#854d0e;font-weight:600">Return Request ID</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#854d0e;font-family:monospace">#${returnId}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#92400e">Under Review - typically 24 hours</p>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Reason</p>
        <p style="margin:0;font-size:13px;color:#374151;font-weight:600">${reason}</p>
        ${description ? `<p style="margin:6px 0 0;font-size:13px;color:#6b7280">${description}</p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">ITEM</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600">QTY</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">CONDITION</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;font-size:13px;color:#0369a1;margin-bottom:20px">
        <strong>What happens next?</strong> Our team will inspect your request and you will receive an email with our decision. Please do not ship the item until you hear from us.
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for shopping with ${t.storeName}!</p>
    </div>`, t);
};

// ── Return request submitted — admin notification ─────────────────────────────
const returnRequestAdminHtml = async ({ customerName, customerEmail, customerPhone, orderNumber, orderId, returnId, reason, description, items }) => {
  const t = await getTheme();
  const itemRows = (items || []).map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${item.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:center">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#6b7280;text-align:right;text-transform:capitalize">${item.condition || 'opened'}</td>
    </tr>`).join('');
  return wrapper(`
    ${header('New Return Request', t)}
    <div style="padding:32px">
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:16px;margin-bottom:20px;text-align:center">
        <p style="margin:0 0 4px;font-size:12px;color:#854d0e">New Return - Order</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:#854d0e;font-family:monospace">${orderNumber}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Customer</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${customerName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${customerEmail}</td></tr>
        ${customerPhone ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Phone</td><td style="padding:8px 0;font-size:13px;color:#111">${customerPhone}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Return ID</td><td style="padding:8px 0;font-size:13px;font-family:monospace;font-weight:700;color:${t.primary}">#${returnId}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Reason</td><td style="padding:8px 0;font-size:13px;color:#111;font-weight:600">${reason}</td></tr>
        ${description ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Description</td><td style="padding:8px 0;font-size:13px;color:#374151">${description}</td></tr>` : ''}
      </table>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600">ITEM</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#6b7280;font-weight:600">QTY</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#6b7280;font-weight:600">CONDITION</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/returns/${returnId}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        Review Return Request
      </a>
    </div>`, t);
};

// ── Return approved — customer ─────────────────────────────────────────────────
const returnApprovedCustomerHtml = async ({ customerName, orderNumber, returnId, refundAmount, refundMethod, adminNote }) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const methodLabels = { original: 'Original Payment Method', store_credit: 'Store Credit', gift_card: 'Gift Card' };
  return wrapper(`
    ${header('Return Request Approved!', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Great news! Your return request for order <strong style="color:${t.primary}">${orderNumber}</strong> has been <strong style="color:#16a34a">approved</strong>.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#166534;font-weight:600">Return #${returnId}</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#15803d">Approved</p>
        ${refundAmount ? `<p style="margin:8px 0 0;font-size:22px;font-weight:800;color:#15803d">${sym} ${Number(refundAmount).toLocaleString()} Refund</p>` : ''}
      </div>
      ${refundMethod ? `
      <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Refund Via</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#374151">${methodLabels[refundMethod] || refundMethod}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#9ca3af">Refunds typically appear within 5-7 business days depending on your bank.</p>
      </div>` : ''}
      ${adminNote ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#0369a1;font-weight:600;text-transform:uppercase">Note from our team</p>
        <p style="margin:0;font-size:13px;color:#0369a1">${adminNote}</p>
      </div>` : ''}
      <div style="background:#fefce8;border:1px solid #fde047;border-radius:10px;padding:14px;font-size:13px;color:#92400e;margin-bottom:20px">
        <strong>Next step:</strong> Please pack the item securely and ship it back. You will receive pickup/drop-off instructions shortly if applicable.
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for your patience. We appreciate your trust in ${t.storeName}!</p>
    </div>`, t);
};

// ── Return rejected — customer ────────────────────────────────────────────────
const returnRejectedCustomerHtml = async ({ customerName, orderNumber, returnId, adminNote }) => {
  const t = await getTheme();
  return wrapper(`
    ${header('Return Request Update', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">We have reviewed your return request for order <strong style="color:${t.primary}">${orderNumber}</strong> and unfortunately we are unable to approve it at this time.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#991b1b;font-weight:600">Return #${returnId}</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#dc2626">Not Approved</p>
      </div>
      ${adminNote ? `
      <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Reason from our team</p>
        <p style="margin:0;font-size:13px;color:#374151">${adminNote}</p>
      </div>` : ''}
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;font-size:13px;color:#0369a1;margin-bottom:20px">
        If you believe this decision was made in error or need further assistance, please contact our support team with your return ID <strong>#${returnId}</strong>.
      </div>
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for shopping with ${t.storeName}!</p>
    </div>`, t);
};

// ── Item received — customer notification ─────────────────────────────────────
const returnReceivedCustomerHtml = async ({ customerName, orderNumber, returnId, adminNote }) => {
  const t = await getTheme();
  return wrapper(`
    ${header('Return Item Received', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">We have received the returned item(s) for order <strong style="color:${t.primary}">${orderNumber}</strong>. Our team will inspect it and process your refund shortly.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:20px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#166534;font-weight:600">Return #${returnId}</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#15803d">Item Received</p>
        <p style="margin:8px 0 0;font-size:13px;color:#166534">Inspection in progress - refund within 3-5 business days</p>
      </div>
      ${adminNote ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#0369a1;font-weight:600;text-transform:uppercase">Note from our team</p>
        <p style="margin:0;font-size:13px;color:#0369a1">${adminNote}</p>
      </div>` : ''}
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for your patience. We will notify you once the refund is processed!</p>
    </div>`, t);
};

// ── Refund processed — customer ───────────────────────────────────────────────
const returnRefundedCustomerHtml = async ({ customerName, orderNumber, returnId, refundAmount, refundMethod, adminNote }) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const methodLabels = { original: 'Original Payment Method', store_credit: 'Store Credit', gift_card: 'Gift Card' };
  return wrapper(`
    ${header('Refund Processed!', t)}
    <div style="padding:32px">
      <p style="color:#374151">Hi <strong>${customerName}</strong>,</p>
      <p style="color:#6b7280;font-size:14px;margin-bottom:20px">Your refund for order <strong style="color:${t.primary}">${orderNumber}</strong> has been successfully processed.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:24px;text-align:center;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#166534;font-weight:600">Return #${returnId}</p>
        ${refundAmount ? `<p style="margin:0;font-size:32px;font-weight:900;color:#15803d;font-family:monospace">${sym} ${Number(refundAmount).toLocaleString()}</p>` : ''}
        <p style="margin:6px 0 0;font-size:14px;font-weight:700;color:#166534">Refund Processed</p>
      </div>
      ${refundMethod ? `
      <div style="background:#f8fafc;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Refunded Via</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#374151">${methodLabels[refundMethod] || refundMethod}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#9ca3af">Please allow 5-7 business days for the amount to reflect in your account.</p>
      </div>` : ''}
      ${adminNote ? `
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:14px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#0369a1;font-weight:600;text-transform:uppercase">Note from our team</p>
        <p style="margin:0;font-size:13px;color:#0369a1">${adminNote}</p>
      </div>` : ''}
      <p style="color:#9ca3af;font-size:12px;text-align:center">Thank you for shopping with ${t.storeName}! We hope to serve you again soon.</p>
    </div>`, t);
};

// ── Return status update — admin copy ─────────────────────────────────────────
const returnStatusAdminHtml = async ({ customerName, customerEmail, orderNumber, returnId, newStatus, refundAmount, refundMethod, adminNote }) => {
  const t = await getTheme();
  const sym = 'Rs.';
  const statusLabels = {
    pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
    received: 'Item Received', refunded: 'Refunded',
  };
  const statusColors = {
    pending: '#d97706', approved: '#16a34a', rejected: '#dc2626',
    received: '#2563eb', refunded: '#16a34a',
  };
  const methodLabels = { original: 'Original Payment Method', store_credit: 'Store Credit', gift_card: 'Gift Card' };
  const color = statusColors[newStatus] || t.primary;
  return wrapper(`
    ${header('Return Status Updated', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 16px">A return request status has been updated.</p>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px;border:2px solid ${color}30">
        <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Return #${returnId} - Order ${orderNumber}</p>
        <p style="margin:0;font-size:22px;font-weight:800;color:${color}">${statusLabels[newStatus] || newStatus}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Customer</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${customerName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${customerEmail}</td></tr>
        ${refundAmount ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Refund Amount</td><td style="padding:8px 0;font-size:13px;font-weight:700;color:${t.primary}">${sym} ${Number(refundAmount).toLocaleString()}</td></tr>` : ''}
        ${refundMethod ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Refund Method</td><td style="padding:8px 0;font-size:13px;color:#111">${methodLabels[refundMethod] || refundMethod}</td></tr>` : ''}
        ${adminNote ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Admin Note</td><td style="padding:8px 0;font-size:13px;color:#374151">${adminNote}</td></tr>` : ''}
      </table>
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/returns/${returnId}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        View Return in Dashboard
      </a>
    </div>`, t);
};

const cancelAutoDecisionAdminHtml = async (order, decision) => {
  const t = await getTheme();
  const isApproved = decision === 'approved';
  return wrapper(`
    ${header(isApproved ? '🤖 Auto-Cancellation Approved' : '🤖 Auto-Cancellation Rejected', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 12px">The system has automatically <strong>${isApproved ? 'approved' : 'rejected'}</strong> a cancellation request.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;width:40%">Order</td><td style="padding:8px 0;font-size:13px;font-weight:700;color:${t.primary};font-family:monospace">${order.orderNumber}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Customer</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#111">${order.billing?.firstName} ${order.billing?.lastName}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Email</td><td style="padding:8px 0;font-size:13px;color:#111">${order.billing?.email}</td></tr>
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Order Total</td><td style="padding:8px 0;font-size:13px;font-weight:700;color:${t.primary}">Rs. ${order.total?.toLocaleString()}</td></tr>
        ${order.cancelRequest?.reason ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Reason</td><td style="padding:8px 0;font-size:13px;color:#111">${order.cancelRequest.reason}</td></tr>` : ''}
        <tr><td style="padding:8px 0;color:#6b7280;font-size:13px">Decision</td><td style="padding:8px 0;font-size:13px;font-weight:700;color:${isApproved ? '#dc2626' : '#16a34a'}">${isApproved ? '✅ Auto-Approved & Cancelled' : '❌ Auto-Rejected'}</td></tr>
      </table>
      <a href="${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/orders/${order._id}"
         style="display:inline-block;background:linear-gradient(135deg,${t.primary},${lighten(t.primary)});color:white;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">
        View Order →
      </a>
    </div>`, t);
};

// ── Cancel approved notification to admin (manual) ────────────────────────────
const cancelApprovedAdminHtml = async (order) => {
  const t = await getTheme();
  return wrapper(`
    ${header('✅ Cancellation Approved', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 12px">You approved the cancellation request for order <strong style="color:${t.primary}">${order.orderNumber}</strong>. The customer has been notified.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#991b1b">Cancelled Order</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#dc2626;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#991b1b">Total: Rs. ${order.total?.toLocaleString()} · Stock restored</p>
      </div>
      ${order.cancelRequest?.reason ? `<div style="background:#f8fafc;border-radius:10px;padding:14px;font-size:13px;color:#374151;margin-bottom:16px"><strong>Customer reason:</strong> ${order.cancelRequest.reason}</div>` : ''}
    </div>`, t);
};

// ── Cancel rejected notification to admin (manual) ────────────────────────────
const cancelRejectedAdminHtml = async (order) => {
  const t = await getTheme();
  return wrapper(`
    ${header('❌ Cancellation Rejected', t)}
    <div style="padding:32px">
      <p style="color:#374151;margin:0 0 12px">You rejected the cancellation request for order <strong style="color:${t.primary}">${order.orderNumber}</strong>. The customer has been notified and the order will continue.</p>
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:16px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:12px;color:#166534">Order Continuing</p>
        <p style="margin:0;font-size:20px;font-weight:800;color:#16a34a;font-family:monospace">${order.orderNumber}</p>
        <p style="margin:8px 0 0;font-size:13px;color:#166534">Status: ${order.orderStatus}</p>
      </div>
    </div>`, t);
};

// ── Run verify on startup (non-blocking) ──────────────────────────────────────
setTimeout(() => verifySmtp(), 3000);

// ── Email notification guard ──────────────────────────────────────────────────
// Checks if a specific email notification type is enabled in Settings.
// Keys stored in DB: emailNotif_<key> with value true/false (string or bool).
// Returns true by default if the key is missing (safe for existing installs).
const isEmailEnabled = async (key) => {
  try {
    const tenantId = currentTenantId();
    if (tenantId) {
      const tenant = await withoutTenantScope(() => Tenant.findById(tenantId).select('settings').lean());
      const value = tenant?.settings?.[`emailNotif_${key}`];
      if (value !== undefined && value !== null) {
        if (typeof value === "boolean") return value;
        if (typeof value === "string") return value !== "false" && value !== "0";
        return Boolean(value);
      }
    }

    const { Settings } = require("./../models/index");
    const row = await Settings.findOne({ key: `emailNotif_${key}` }).lean();
    if (!row) return true; // default enabled
    const v = row.value;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return v !== "false" && v !== "0";
    return Boolean(v);
  } catch { return true; }
};

module.exports = {
  sendMail,
  getAdminEmail,
  clearThemeCache,
  otpEmailHtml,
  orderConfirmHtml,
  newOrderAdminHtml,
  slipUploadedAdminHtml,
  slipReceivedCustomerHtml,
  paymentConfirmedHtml,
  paymentConfirmedAdminHtml,
  orderDeliveredCustomerHtml,
  orderStatusAdminHtml,
  orderCancelledHtml,
  cancelRequestReceivedCustomerHtml,
  cancelRequestAdminHtml,
  cancelRejectedHtml,
  cancelApprovedAdminHtml,
  cancelRejectedAdminHtml,
  cancelAutoDecisionAdminHtml,
  orderStatusUpdateHtml,
  // Return & Refund emails
  returnRequestCustomerHtml,
  returnRequestAdminHtml,
  returnApprovedCustomerHtml,
  returnRejectedCustomerHtml,
  returnReceivedCustomerHtml,
  returnRefundedCustomerHtml,
  returnStatusAdminHtml,
  isEmailEnabled,
};
