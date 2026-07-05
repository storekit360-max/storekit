/**
 * discountEngine.js  — Frontend mirror of backend/services/discountEngine.js
 *
 * All cart, checkout, and order-summary pricing in the UI must go through
 * these helpers so the numbers shown always match what the backend will compute.
 *
 * Pricing order (matches backend exactly):
 *  1. Product Discount  → effectivePrice (lowest of price / salePrice per item)
 *  2. Order Subtotal    → sum of (effectivePrice × qty)
 *  3. Coupon / Customer Benefit → applied as a discount on subtotal
 *  4. Delivery Fee      → added after coupon discount
 *  5. Gift Card Balance → payment method applied to remaining total
 *                         (subtotal − couponDiscount + deliveryFee)
 *  6. Final Total       → Math.max(0, remaining − giftCardDeduction)
 *
 * KEY CHANGE: Coupon + Gift Card CAN stack.
 *   - Coupon reduces the order subtotal (it's a discount)
 *   - Gift Card then pays whatever is left (it's a payment method)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. ITEM-LEVEL PRICING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Effective unit price — lowest of price / salePrice.
 * Use this everywhere instead of `item.salePrice || item.price`.
 * @param {{ price: number, salePrice?: number }} item
 * @returns {number}
 */
export function effectivePrice(item) {
    if (item.salePrice != null && item.salePrice > 0 && item.salePrice < item.price) {
      return item.salePrice;
    }
    return item.price;
  }
  
  /**
   * Line-item total (unit price × qty).
   * @param {{ price: number, salePrice?: number, quantity: number }} item
   * @returns {number}
   */
  export function lineItemTotal(item) {
    return effectivePrice(item) * item.quantity;
  }
  
  /**
   * Order subtotal — sum of all line item totals.
   * @param {Array<{ price: number, salePrice?: number, quantity: number }>} items
   * @returns {number}
   */
  export function computeSubtotal(items) {
    return items.reduce((sum, i) => sum + lineItemTotal(i), 0);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // 2. DELIVERY FEE  (client-side estimate — always confirmed server-side)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Resolve the delivery fee for a selected service + city + subtotal.
   * Mirrors the logic in DiscountEngine.resolveDeliveryFee on the backend.
   *
   * @param {object|null} deliveryService  – service object from /delivery API
   * @param {string}      city             – billing city
   * @param {number}      subtotal         – order subtotal
   * @param {object}      settings         – store settings { standardDelivery, freeDeliveryThreshold }
   * @returns {number}
   */
  export function resolveDeliveryFee(deliveryService, city = '', subtotal = 0, settings = {}) {
    if (deliveryService) {
      const cityLower = city.toLowerCase();
      let rate = null;
      if (cityLower && deliveryService.zoneRates?.length > 0) {
        rate = deliveryService.zoneRates.find(zr =>
          zr.zones?.some(z =>
            z.toLowerCase() === cityLower || cityLower.includes(z.toLowerCase())
          )
        );
      }
      if (!rate && deliveryService.rates?.length > 0) rate = deliveryService.rates[0];
      if (rate) {
        return (rate.freeAbove && subtotal >= rate.freeAbove) ? 0 : rate.price;
      }
    }
    // Fall back to store-wide settings
    const freeThreshold = Number(settings?.freeDeliveryThreshold) || 5000;
    return subtotal >= freeThreshold ? 0 : (Number(settings?.standardDelivery) || 600);
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // 3. BENEFIT RESOLUTION  (coupon AND gift card can stack)
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Determine which benefits are active given the validated coupon/gift-card data.
   * Both can be active simultaneously — coupon is a discount, gift card is a payment.
   *
   * @param {object|null} couponData    – { discount: number } from /coupons/validate
   * @param {object|null} giftCardData  – { balance: number } from /gift-cards/validate
   * @param {number}      subtotal
   * @param {number}      deliveryFee   – needed to compute remaining total for gift card cap
   * @returns {{ couponDiscount: number, giftCardDeduction: number, type: string }}
   */
  export function resolveBenefit(couponData, giftCardData, subtotal, deliveryFee = 0) {
    const couponDiscount = couponData?.discount ?? 0;
  
    // Remaining total after coupon + delivery — gift card caps at this
    const afterCoupon    = Math.max(0, subtotal - couponDiscount);
    const remainingTotal = afterCoupon + deliveryFee;
    const giftCardDeduction = giftCardData
      ? Math.min(giftCardData.balance, remainingTotal)
      : 0;
  
    let type = 'none';
    if (couponDiscount > 0 && giftCardDeduction > 0) type = 'both';
    else if (couponDiscount > 0)                      type = 'coupon';
    else if (giftCardDeduction > 0)                   type = 'giftcard';
  
    return { couponDiscount, giftCardDeduction, type };
  }
  
  /**
   * @deprecated Use resolveBenefit() + computeTotals() instead.
   * Kept for backward compat — returns the larger of coupon/giftCard as a single winner.
   * NOTE: This no longer reflects the real pricing logic (stacking). Update call sites.
   */
  export function resolveBestBenefit(couponData, giftCardData, subtotal) {
    const couponDiscount   = couponData?.discount ?? 0;
    const giftCardDiscount = giftCardData ? Math.min(giftCardData.balance, subtotal) : 0;
    if (couponDiscount === 0 && giftCardDiscount === 0) return { type: 'none', discount: 0 };
    if (couponDiscount >= giftCardDiscount) return { type: 'coupon', discount: couponDiscount };
    return { type: 'giftcard', discount: giftCardDiscount };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // 4. FINAL TOTALS
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Compute the canonical totals object for display in Cart, Checkout, and
   * order summaries.  Always use this — never inline the arithmetic.
   *
   * Pricing order:
   *   subtotal → couponDiscount → + deliveryFee → - giftCardDeduction → total
   *
   * @param {{ subtotal: number, deliveryFee: number, couponData: object|null, giftCardData: object|null }} params
   * @returns {{ subtotal, couponDiscount, giftCardDeduction, benefitType, deliveryFee, total }}
   */
  export function computeTotals({ subtotal, deliveryFee, couponData, giftCardData }) {
    const { couponDiscount, giftCardDeduction, type } = resolveBenefit(
      couponData, giftCardData, subtotal, deliveryFee
    );
  
    const afterCoupon = subtotal - couponDiscount;
    const afterDelivery = afterCoupon + deliveryFee;
    const total = Math.max(0, afterDelivery - giftCardDeduction);
  
    return {
      subtotal:          Math.round(subtotal          * 100) / 100,
      couponDiscount:    Math.round(couponDiscount    * 100) / 100,
      giftCardDeduction: Math.round(giftCardDeduction * 100) / 100,
      // Legacy field — total deduction for display
      discount:          Math.round((couponDiscount + giftCardDeduction) * 100) / 100,
      benefitType:       type,
      deliveryFee:       Math.round(deliveryFee       * 100) / 100,
      total:             Math.round(total             * 100) / 100,
    };
  }
  
  /**
   * Convenience: build totals directly from cart items + context.
   * Useful in CartContext and Cart.js where you don't yet have coupon/gift-card data.
   *
   * @param {Array}   items
   * @param {object}  deliveryService  null = use store defaults
   * @param {string}  city
   * @param {object}  settings
   * @param {object|null} couponData
   * @param {object|null} giftCardData
   */
  export function computeCartTotals(items, deliveryService, city, settings, couponData = null, giftCardData = null) {
    const subtotal    = computeSubtotal(items);
    const deliveryFee = resolveDeliveryFee(deliveryService, city, subtotal, settings);
    return computeTotals({ subtotal, deliveryFee, couponData, giftCardData });
  }