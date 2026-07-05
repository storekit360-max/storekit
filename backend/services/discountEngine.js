/**
 * DiscountEngine — StoreKit's single source of truth for all pricing.
 *
 * Rules enforced here (and ONLY here):
 *  1. Product price  → always Math.min(price, salePrice) — lowest wins.
 *  2. Order subtotal → sum of (best item price × qty).
 *  3. Pricing order:
 *       a. Product Discount  (salePrice applied per item — step 1)
 *       b. Customer Benefit  → coupon OR customer-tier discount (best one wins)
 *       c. Gift Card Balance → applied AFTER coupon, against the remaining total
 *                              (subtotal − coupon + deliveryFee)
 *  4. Coupon and gift card CAN stack. Coupon is a discount; gift card is a
 *     payment method that covers whatever is left after the coupon.
 *  5. Gift-card cap  → deduction capped at remaining total so it never goes < 0.
 *  6. Final total    → Math.max(0, subtotal − couponDiscount + deliveryFee − giftCardDeduction).
 *
 * COUPON SECURITY NOTES:
 *  - validateCoupon is the SINGLE place coupon eligibility is checked. It is
 *    called both at /validate (pre-checkout) and again at order creation —
 *    never trust an earlier validation result.
 *  - Guest checkouts are tracked via `usedByEmails` (normalized lowercase
 *    billing email) since they have no userId. This closes the gap where a
 *    guest could reuse a single-use or new-user-only coupon indefinitely.
 *  - `userLimit` (max uses per user/email) is now enforced.
 *  - applyBenefit() uses an ATOMIC findOneAndUpdate that re-checks
 *    usageLimit/userLimit/usedBy/usedByEmails inside the update filter, to
 *    prevent a race condition where two concurrent orders both pass
 *    validateCoupon() before either increments usedCount.
 *
 * Usage (backend):
 *   const { DiscountEngine } = require('../services/discountEngine');
 *
 *   const lineItems = rawItems.map(i => DiscountEngine.buildLineItem(product, qty));
 *   const { fee, serviceName } = await DiscountEngine.resolveDeliveryFee(deliveryCode, city, subtotal, settings);
 *   const benefit = await DiscountEngine.resolveBenefit({ couponCode, giftCardCode, subtotal, userId, email });
 *   const totals = DiscountEngine.computeTotals({ subtotal, deliveryFee, benefit });
 *
 *   // AFTER order.create() succeeds:
 *   const applied = await DiscountEngine.applyBenefit(benefit, order._id, userId, email);
 *   if (!applied.ok) { /* roll back order — see orders.js *\/ }
 */

const mongoose = require('mongoose');
const { Coupon, GiftCard, Settings, DeliveryService } = require('../models/index');

// ─────────────────────────────────────────────────────────────────────────────
// 1. ITEM-LEVEL PRICING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the effective unit price for a product — lowest of price / salePrice.
 * Never call `product.salePrice || product.price` directly; always use this.
 * @param {{ price: number, salePrice?: number }} product
 * @returns {number}
 */
function effectivePrice(product) {
  if (product.salePrice != null && product.salePrice > 0 && product.salePrice < product.price) {
    return product.salePrice;
  }
  return product.price;
}

/**
 * Build a canonical order line item from a DB product + requested quantity.
 * @param {object} product  – Mongoose product document
 * @param {number} quantity
 * @returns {{ product, name, image, category, brand, price, originalPrice, quantity, subtotal, hasDiscount }}
 */
function buildLineItem(product, quantity) {
  const price    = effectivePrice(product);
  const subtotal = Math.round(price * quantity * 100) / 100;
  return {
    product:       product._id,
    name:          product.name,
    image:         product.thumbnail,
    category:      product.category,
    subCategory:   product.subCategory,
    brand:         product.brand,
    price,
    originalPrice: product.price,          // kept for display / analytics
    costPrice:     product.costPrice != null ? product.costPrice : null,
    hasDiscount:   price < product.price,
    quantity,
    subtotal,
  };
}

/**
 * Sum line-item subtotals into an order subtotal.
 * @param {Array<{ subtotal: number }>} lineItems
 * @returns {number}
 */
function computeSubtotal(lineItems) {
  return lineItems.reduce((s, i) => s + i.subtotal, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DELIVERY FEE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve delivery fee.  Mirrors the single logic that was previously duplicated
 * between Checkout.js (frontend) and orders.js (backend).
 *
 * @param {string|null} deliveryCode   – selected delivery service code, or null/''
 * @param {string}      city           – billing city (for zone-rate lookup)
 * @param {number}      subtotal       – order subtotal (for free-shipping threshold)
 * @param {object}      settings       – store settings map { standardDelivery, freeDeliveryThreshold }
 * @returns {Promise<{ fee: number, serviceName: string }>}
 */
async function resolveDeliveryFee(deliveryCode, city = '', subtotal = 0, settings = {}) {
  if (deliveryCode) {
    const svc = await DeliveryService.findOne({ code: deliveryCode, isEnabled: true });
    if (svc) {
      const cityLower = city.toLowerCase();
      let rate = null;
      if (cityLower && svc.zoneRates?.length > 0) {
        rate = svc.zoneRates.find(zr =>
          zr.zones?.some(z => z.toLowerCase() === cityLower || cityLower.includes(z.toLowerCase()))
        );
      }
      if (!rate && svc.rates?.length > 0) rate = svc.rates[0];
      if (rate) {
        const fee = (rate.freeAbove && subtotal >= rate.freeAbove) ? 0 : rate.price;
        return { fee, serviceName: svc.name };
      }
    }
  }

  // Fall back to store-wide standard delivery settings
  let stdSettings = settings;
  if (!stdSettings.standardDelivery) {
    const rows = await Settings.find({ key: { $in: ['standardDelivery', 'freeDeliveryThreshold'] } }).lean();
    stdSettings = {};
    rows.forEach(r => { stdSettings[r.key] = r.value; });
  }
  const freeThreshold = Number(stdSettings.freeDeliveryThreshold) || 5000;
  const fee = subtotal >= freeThreshold ? 0 : (Number(stdSettings.standardDelivery) || 600);
  return { fee, serviceName: 'Standard Delivery' };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COUPON VALIDATION (pure — no DB side-effects)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize an email for comparison/storage.
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Escape a string for safe use inside a RegExp.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate a coupon code and compute the discount amount for a given subtotal.
 * Returns { error } if the coupon is invalid/ineligible instead of throwing,
 * so the caller can decide whether to surface an error or silently skip.
 *
 * SECURITY: this function is the single source of truth for coupon eligibility.
 * It MUST be called again at order-creation time (server-side), never trusting
 * a result computed earlier during /validate — the cart, user state, and the
 * coupon's own usage counters can all change between the two calls.
 *
 * @param {string}   code
 * @param {number}   subtotal
 * @param {object}   opts       – { userId?, email?, categoryIds?, productIds?, brands? }
 * @returns {Promise<{ coupon, discount: number } | { error: string }>}
 */
async function validateCoupon(code, subtotal, opts = {}) {
  const { userId, email, categoryIds = [], productIds = [], brands = [], lineItems = [] } = opts;
  const normEmail = normalizeEmail(email);

  if (!code || typeof code !== 'string') return { error: 'Coupon code is required' };

  const coupon = await Coupon.findOne({
    code: code.toUpperCase().trim(),
    isActive: true,
    validFrom: { $lte: new Date() },
    validUntil: { $gte: new Date() },
  });

  if (!coupon) return { error: 'Invalid or expired coupon code' };

  // ── Global usage limit ──────────────────────────────────────────────────
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
    return { error: 'Coupon usage limit reached' };
  }

  // ── Per-user usage limit (logged-in users) ──────────────────────────────
  const userLimit = coupon.userLimit || 1;
  if (userId) {
    const timesUsedByUser = coupon.usedBy.filter(id => id.toString() === userId.toString()).length;
    if (timesUsedByUser >= userLimit) {
      return { error: 'You have already used this coupon' };
    }
  }

  // ── Per-email usage limit (guest checkouts) ─────────────────────────────
  if (normEmail) {
    const timesUsedByEmail = (coupon.usedByEmails || [])
      .filter(e => e === normEmail).length;
    if (timesUsedByEmail >= userLimit) {
      return { error: 'You have already used this coupon' };
    }
  }

  // ── New-user-only restriction ───────────────────────────────────────────
  if (coupon.isNewUserOnly) {
    const Order = require('../models/Order');
    const orConditions = [];
    if (userId) orConditions.push({ customer: userId });
    if (normEmail) orConditions.push({ 'billing.email': { $regex: `^${escapeRegex(normEmail)}$`, $options: 'i' } });

    if (orConditions.length === 0) {
      return { error: 'This coupon is for new customers only. Please sign in or provide your email.' };
    }

    const prevOrders = await Order.countDocuments({ $or: orConditions });
    if (prevOrders > 0) {
      return { error: 'This coupon is for new customers only' };
    }
  }

  // ── Scope restrictions — compute discount ONLY on eligible items ───────────
  const hasCat      = coupon.applicableCategories?.length > 0;
  const hasProd     = coupon.applicableProducts?.length   > 0;
  const hasBrand    = coupon.applicableBrands?.length     > 0;
  const hasExcluded = coupon.excludedProducts?.length     > 0;
  const hasScope    = hasCat || hasProd || hasBrand;

  // SECURITY: when a coupon is scoped (brand/category/product restrictions)
  // we REQUIRE authoritative lineItems built server-side from the DB.
  // If lineItems are missing for a scoped coupon we refuse rather than
  // falling back to a coarse client-supplied check — the fallback path
  // previously allowed a discount on the full subtotal even when no cart
  // items matched the scope (the client-supplied brands array matched the
  // coupon's brand but no individual product was actually eligible).
  if (hasScope && lineItems.length === 0) {
    return { error: 'Unable to verify coupon eligibility — please try again' };
  }

  // When the coupon is scoped, only the matching items' subtotal is discounted.
  // Sitewide coupons (no scope) get the full order subtotal.
  let eligibleSubtotal  = subtotal;
  let eligibleLineItems = lineItems;

  if (hasScope && lineItems.length > 0) {
    const applicableCatIds  = (coupon.applicableCategories || []).map(c => c.toString());
    const applicableProdIds = (coupon.applicableProducts   || []).map(p => p.toString());
    const applicableBrands  = coupon.applicableBrands || [];

    const eligibleItems = lineItems.filter(item => {
      const itemCat    = item.category?.toString();
      const itemSubCat = item.subCategory?.toString();
      const itemProd   = item.product?.toString();
      const itemBrand  = item.brand;

      // ── PRIORITY MATCHING: most specific scope wins ──────────────────────
      // When applicableProducts is set, it is the authoritative list — only
      // those exact products qualify regardless of brand or category.
      // This prevents a coupon configured as "brand=UGREEN, products=[charger,cable]"
      // from discounting ALL UGREEN items because the brand OR matches.
      //
      //   hasProd only         → match by product ID
      //   hasProd + hasBrand   → still match by product ID only (products are more specific)
      //   hasProd + hasCat     → still match by product ID only
      //   hasCat only          → match by category (top-level or sub)
      //   hasCat + hasBrand    → item must match BOTH category AND brand (AND logic)
      //   hasBrand only        → match by brand
      if (hasProd) {
        // Product list is set — it is the sole decider, brand/category ignored
        return !!(itemProd && applicableProdIds.includes(itemProd));
      }

      // No product list: combine category + brand with AND when both are set
      const catMatch   = hasCat && (
        (itemCat    && applicableCatIds.includes(itemCat))    ||
        (itemSubCat && applicableCatIds.includes(itemSubCat))
      );
      const brandMatch = hasBrand && !!(itemBrand && applicableBrands.includes(itemBrand));

      if (hasCat && hasBrand) return catMatch && brandMatch; // AND: must match both
      if (hasCat)             return catMatch;
      return brandMatch;
    });

    if (eligibleItems.length === 0) {
      return { error: 'This coupon is not applicable to your cart items' };
    }

    eligibleSubtotal  = eligibleItems.reduce((s, i) => s + i.subtotal, 0);
    eligibleLineItems = eligibleItems;
  }

  // ── Excluded products — remove blacklisted items from eligible set ──────
  // Even when a product matches brand/category scope it can be explicitly
  // excluded (e.g. premium/already-discounted items the admin doesn't want
  // discounted by a broad brand coupon).
  if (hasExcluded && eligibleLineItems.length > 0) {
    const excludedProdIds = coupon.excludedProducts.map(p => p.toString());
    const afterExclusion  = eligibleLineItems.filter(i => !excludedProdIds.includes(i.product?.toString()));
    if (afterExclusion.length === 0) {
      return { error: 'This coupon is not applicable to your cart items' };
    }
    eligibleLineItems = afterExclusion;
    eligibleSubtotal  = afterExclusion.reduce((s, i) => s + i.subtotal, 0);
  }

  // ── minOrderAmount — check against eligible subtotal for scoped coupons ─
  // Previously checked against full order subtotal which allowed a user with
  // Rs.10,000 of ineligible items + Rs.100 of eligible items to satisfy a
  // "min Rs.5,000" scoped coupon. Now uses the eligible subtotal.
  const effectiveMinOrderAmount = coupon.minOrderAmount || 0;
  if (effectiveMinOrderAmount > 0 && eligibleSubtotal < effectiveMinOrderAmount) {
    return { error: `Minimum eligible order Rs. ${effectiveMinOrderAmount.toLocaleString()} required for this coupon` };
  }

  // ── Filter out already-discounted products (excludeSaleItems) ───────────
  // Filter sale items OUT of the eligible set rather than rejecting the whole
  // coupon — so a mixed cart (some full-price, some on sale) still gets the
  // coupon applied to the full-price items only.
  // Only reject if ALL eligible items are on sale (nothing left to discount).
  if (coupon.excludeSaleItems) {
    const nonSaleItems = eligibleLineItems.filter(i => !i.hasDiscount);
    if (nonSaleItems.length === 0) {
      return { error: 'This coupon cannot be applied to items that are already on sale' };
    }
    eligibleLineItems = nonSaleItems;
    eligibleSubtotal  = nonSaleItems.reduce((s, i) => s + i.subtotal, 0);
  }

  const discount = Math.round(
    coupon.type === 'percentage'
      ? Math.min((eligibleSubtotal * coupon.value) / 100, coupon.maxDiscount || Infinity)
      : Math.min(coupon.value, eligibleSubtotal)  // fixed discount can't exceed eligible subtotal
  );

  // ── Profit protection ────────────────────────────────────────────────────
  let finalDiscount = discount;
  if (coupon.maxDiscountPercentOfProfit > 0 && eligibleLineItems.length > 0) {
    const totalMargin = eligibleLineItems.reduce((sum, i) => {
      if (i.costPrice == null || i.costPrice < 0) return sum;
      const margin = (i.price - i.costPrice) * i.quantity;
      return sum + Math.max(0, margin);
    }, 0);

    const maxAllowed = Math.floor((totalMargin * coupon.maxDiscountPercentOfProfit) / 100);

    if (finalDiscount > maxAllowed) {
      if (maxAllowed <= 0) {
        return { error: 'This coupon cannot be applied to this order' };
      }
      finalDiscount = maxAllowed;
    }
  }

  return { coupon, discount: finalDiscount };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GIFT CARD VALIDATION (pure — no DB side-effects)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate a gift card code.
 * @param {string} code
 * @returns {Promise<{ giftCard, balance: number } | { error: string }>}
 */
async function validateGiftCard(code) {
  if (!code || typeof code !== 'string') return { error: 'Gift card code is required' };

  const giftCard = await GiftCard.findOne({
    code: code.toUpperCase().trim(),
    isActive: true,
    expiresAt: { $gte: new Date() },
  });
  if (!giftCard || giftCard.balance <= 0.01) return { error: 'Invalid or expired gift card' };
  return { giftCard, balance: giftCard.balance };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BENEFIT RESOLVER
//    NEW RULE: Coupon and gift card CAN stack.
//    - Coupon (or customer benefit) → applied first as a discount on subtotal
//    - Gift Card → applied as a payment method against remaining total
//      (subtotal − couponDiscount + deliveryFee)
//    Both can be present simultaneously.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} BenefitResult
 * @property {number}      couponDiscount    – discount from coupon (0 if none)
 * @property {number}      giftCardDeduction – amount paid by gift card (0 if none)
 * @property {object|null} coupon            – coupon doc (if couponDiscount > 0)
 * @property {object|null} giftCard          – gift card doc (if giftCardDeduction > 0)
 * @property {string|null} errorCoupon       – validation error message for coupon, if any
 * @property {string|null} errorGiftCard     – validation error message for gift card, if any
 *
 * Legacy compat:
 * @property {'coupon'|'giftcard'|'both'|'none'} type  – for backward-compat display
 * @property {number}                             discount – total deduction (coupon + gift card portion)
 */

/**
 * Resolve customer benefits: coupon applied first, then gift card covers remaining.
 * Both can be used together (they stack).
 * Neither benefit is applied to DB yet — call applyBenefit() after order creation.
 *
 * @param {{ couponCode?: string, giftCardCode?: string, subtotal: number, deliveryFee?: number, userId?: string, email?: string, categoryIds?: string[], productIds?: string[], brands?: string[], lineItems?: object[] }} opts
 * @returns {Promise<BenefitResult>}
 */
async function resolveBenefit(opts) {
  const {
    couponCode, giftCardCode, subtotal,
    deliveryFee = 0, // optional — if not provided, gift card cap uses subtotal only
    userId, email, categoryIds, productIds, brands, lineItems,
  } = opts;

  let couponResult   = null;
  let giftCardResult = null;
  let errorCoupon    = null;
  let errorGiftCard  = null;

  if (couponCode) {
    const r = await validateCoupon(couponCode, subtotal, { userId, email, categoryIds, productIds, brands, lineItems });
    if (r.error) errorCoupon = r.error;
    else         couponResult = r;
  }

  if (giftCardCode) {
    const r = await validateGiftCard(giftCardCode);
    if (r.error) errorGiftCard = r.error;
    else         giftCardResult = r;
  }

  const couponDiscount = couponResult ? couponResult.discount : 0;

  // Gift card covers what's left after coupon discount + delivery.
  // We don't cap it here with deliveryFee since computeTotals will do the final cap.
  // But we can store the raw balance for reference.
  const giftCardBalance  = giftCardResult ? giftCardResult.balance : 0;

  // Determine type for backward compat
  let type = 'none';
  if (couponDiscount > 0 && giftCardBalance > 0) type = 'both';
  else if (couponDiscount > 0)                    type = 'coupon';
  else if (giftCardBalance > 0)                   type = 'giftcard';

  // Legacy 'discount' field = coupon discount only (gift card is a payment, not a discount)
  return {
    type,
    couponDiscount,
    giftCardBalance,
    // Legacy compat — 'discount' represents only the coupon portion
    discount: couponDiscount,
    coupon:    couponResult   ? couponResult.coupon     : null,
    giftCard:  giftCardResult ? giftCardResult.giftCard : null,
    errorCoupon,
    errorGiftCard,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. FINAL TOTALS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the canonical order totals object.
 *
 * Pricing order:
 *   1. subtotal (already reflects product discounts / sale prices)
 *   2. couponDiscount applied to subtotal
 *   3. deliveryFee added
 *   4. giftCardDeduction applied to remaining total (as payment)
 *   5. final total clamped to >= 0
 *
 * @param {{ subtotal: number, deliveryFee: number, benefit: BenefitResult }} params
 * @returns {{ subtotal, couponDiscount, giftCardDeduction, deliveryFee, total, benefitType }}
 */
function computeTotals({ subtotal, deliveryFee, benefit }) {
  const couponDiscount = Math.min(benefit.couponDiscount || 0, subtotal); // coupon can't exceed subtotal
  const afterCoupon    = subtotal - couponDiscount;
  const afterDelivery  = afterCoupon + deliveryFee;

  // Gift card covers remaining total (subtotal − coupon + delivery)
  const giftCardDeduction = Math.min(benefit.giftCardBalance || 0, afterDelivery);

  const total = Math.max(0, afterDelivery - giftCardDeduction);

  // Legacy 'discount' = coupon only (for order records that store couponDiscount separately)
  return {
    subtotal:          Math.round(subtotal          * 100) / 100,
    couponDiscount:    Math.round(couponDiscount    * 100) / 100,
    giftCardDeduction: Math.round(giftCardDeduction * 100) / 100,
    // Combined for display / legacy fields
    discount:          Math.round((couponDiscount + giftCardDeduction) * 100) / 100,
    deliveryFee:       Math.round(deliveryFee       * 100) / 100,
    total:             Math.round(total             * 100) / 100,
    benefitType:       benefit.type,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. POST-ORDER SIDE EFFECTS
//    Call this AFTER the order document is saved.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply the chosen benefit to the DB (increment usedCount, deduct gift-card balance).
 * Safe to call even when benefit.type === 'none'.
 * NOW supports 'both' — applies coupon AND gift card side effects.
 *
 * FIX: Gift card deactivation (when balance hits zero) is now done atomically
 * inside the same findOneAndUpdate call using an aggregation pipeline update,
 * eliminating the previous two-step race condition where a separate .save()
 * could fail and leave the card active with zero balance.
 *
 * @param {BenefitResult} benefit
 * @param {string}        orderId
 * @param {string}        [userId]
 * @param {string}        [email]
 * @param {number}        [giftCardDeductionAmount] – actual amount to deduct (from computeTotals)
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function applyBenefit(benefit, orderId, userId, email, giftCardDeductionAmount) {
  // ── Coupon side-effect ────────────────────────────────────────────────────
  if ((benefit.type === 'coupon' || benefit.type === 'both') && benefit.coupon) {
    const couponId  = benefit.coupon._id;
    const userLimit = benefit.coupon.userLimit || 1;
    const normEmail = normalizeEmail(email);

    const filter = { _id: couponId };

    if (benefit.coupon.usageLimit) {
      filter.usedCount = { $lt: benefit.coupon.usageLimit };
    }

    const userCountExpr = userId
      ? {
          $lt: [
            { $size: { $ifNull: [{ $filter: {
              input: '$usedBy',
              as: 'u',
              cond: { $eq: ['$$u', new mongoose.Types.ObjectId(userId)] },
            } }, []] } },
            userLimit,
          ],
        }
      : null;

    const emailCountExpr = normEmail
      ? {
          $lt: [
            { $size: { $ifNull: [{ $filter: {
              input: '$usedByEmails',
              as: 'e',
              cond: { $eq: ['$$e', normEmail] },
            } }, []] } },
            userLimit,
          ],
        }
      : null;

    const exprConditions = [userCountExpr, emailCountExpr].filter(Boolean);
    if (exprConditions.length > 0) {
      filter.$expr = exprConditions.length === 1 ? exprConditions[0] : { $and: exprConditions };
    }

    const update = { $inc: { usedCount: 1 } };
    const pushFields = {};
    if (userId) pushFields.usedBy = userId;
    if (normEmail) pushFields.usedByEmails = normEmail;
    if (Object.keys(pushFields).length > 0) update.$push = pushFields;

    const updated = await Coupon.findOneAndUpdate(filter, update, { new: true });

    if (!updated) {
      return { ok: false, reason: 'coupon_conflict' };
    }
  }

  // ── Gift card side-effect ─────────────────────────────────────────────────
  // FIX: Deactivation is now part of the same atomic write via aggregation
  // pipeline update. The previous approach did a separate updated.save() after
  // the findOneAndUpdate which could silently fail, leaving a zero-balance card
  // still marked isActive:true and reusable.
  if ((benefit.type === 'giftcard' || benefit.type === 'both') && benefit.giftCard) {
    const giftCardId = benefit.giftCard._id;
    const amount = giftCardDeductionAmount || 0;

    if (amount > 0) {
      const now = new Date();
      const updated = await GiftCard.findOneAndUpdate(
        { _id: giftCardId, balance: { $gte: amount }, isActive: true },
        [
          {
            $set: {
              // Deduct balance and round to 2 decimals to avoid floating-point
              // dust (e.g. 0.0000000001) keeping the card "active" forever.
              balance: {
                $round: [{ $subtract: ['$balance', amount] }, 2]
              },
              // Atomically deactivate if balance will hit (near) zero after deduction
              isActive: {
                $cond: [
                  { $lte: [{ $round: [{ $subtract: ['$balance', amount] }, 2] }, 0.01] },
                  false,
                  '$isActive'
                ]
              },
              // Append usage history entry in the same write
              usageHistory: {
                $concatArrays: [
                  '$usageHistory',
                  [{
                    orderId: { $literal: orderId },
                    amount:  { $literal: amount },
                    balanceBefore: '$balance',
                    balanceAfter:  { $round: [{ $subtract: ['$balance', amount] }, 2] },
                    date: { $literal: now },
                  }]
                ]
              }
            }
          }
        ],
        { new: true }
      );

      if (!updated) {
        return { ok: false, reason: 'giftcard_conflict' };
      }
    }
  }

  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS — named + namespace
// ─────────────────────────────────────────────────────────────────────────────

const DiscountEngine = {
  effectivePrice,
  buildLineItem,
  computeSubtotal,
  resolveDeliveryFee,
  validateCoupon,
  validateGiftCard,
  resolveBenefit,
  computeTotals,
  applyBenefit,
  normalizeEmail,
};

module.exports = { DiscountEngine, ...DiscountEngine };