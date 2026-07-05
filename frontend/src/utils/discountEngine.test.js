/**
 * discountEngine.test.js — StoreKit
 *
 * ─── PLACEMENT (REQUIRED) ────────────────────────────────────────────────────
 * Save this file to:
 *   frontend/src/utils/discountEngine.test.js
 *
 * ─── HOW TO RUN ──────────────────────────────────────────────────────────────
 *   cd frontend
 *   npx react-scripts test --watchAll=false
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  effectivePrice,
  lineItemTotal,
  computeSubtotal,
  resolveDeliveryFee,
  resolveBestBenefit,
  computeTotals,
  computeCartTotals,
} from './discountEngine';

// ─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const mkCoupon   = (discount) => ({ discount });
const mkGiftCard = (balance)  => ({ balance });
const mkDelivery = (price, freeAbove = 0, zoneRates = []) => ({
  rates: [{ price, freeAbove }],
  zoneRates,
});
const DEFAULT_SETTINGS = { standardDelivery: 600, freeDeliveryThreshold: 5000 };

// ─────────────────────────────────────────────────────────────────────────────
// 1. ITEM-LEVEL PRICING
// ─────────────────────────────────────────────────────────────────────────────

describe('effectivePrice()', () => {
  test('returns price when no salePrice', () => {
    expect(effectivePrice({ price: 1000 })).toBe(1000);
  });
  test('returns price when salePrice is null', () => {
    expect(effectivePrice({ price: 1000, salePrice: null })).toBe(1000);
  });
  test('returns price when salePrice is 0', () => {
    expect(effectivePrice({ price: 1000, salePrice: 0 })).toBe(1000);
  });
  test('returns salePrice when strictly lower than price', () => {
    expect(effectivePrice({ price: 1000, salePrice: 750 })).toBe(750);
  });
  test('returns price when salePrice equals price', () => {
    expect(effectivePrice({ price: 1000, salePrice: 1000 })).toBe(1000);
  });
  test('returns price when salePrice is higher (bad data)', () => {
    expect(effectivePrice({ price: 1000, salePrice: 1200 })).toBe(1000);
  });
  test('extreme sale — salePrice of Rs. 1', () => {
    expect(effectivePrice({ price: 5000, salePrice: 1 })).toBe(1);
  });
});

describe('lineItemTotal()', () => {
  test('price × quantity at full price', () => {
    expect(lineItemTotal({ price: 500, quantity: 3 })).toBe(1500);
  });
  test('uses salePrice when lower', () => {
    expect(lineItemTotal({ price: 1000, salePrice: 800, quantity: 2 })).toBe(1600);
  });
  test('single unit', () => {
    expect(lineItemTotal({ price: 2500, quantity: 1 })).toBe(2500);
  });
  test('large quantity stays accurate', () => {
    expect(lineItemTotal({ price: 99, quantity: 1000 })).toBe(99000);
  });
});

describe('computeSubtotal()', () => {
  test('sums a single item', () => {
    expect(computeSubtotal([{ price: 1500, quantity: 2 }])).toBe(3000);
  });
  test('sums multiple mixed items correctly', () => {
    const items = [
      { price: 1000, quantity: 1 },
      { price: 500, salePrice: 400, quantity: 3 },
      { price: 2000, quantity: 2 },
    ];
    expect(computeSubtotal(items)).toBe(6200);
  });
  test('empty cart returns 0', () => {
    expect(computeSubtotal([])).toBe(0);
  });
  test('mixes discounted and non-discounted items', () => {
    const items = [
      { price: 3000, salePrice: 2000, quantity: 1 },
      { price: 1000, quantity: 2 },
    ];
    expect(computeSubtotal(items)).toBe(4000);
  });
  test('single sale-price item', () => {
    expect(computeSubtotal([{ price: 5000, salePrice: 3500, quantity: 1 }])).toBe(3500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. DELIVERY FEE
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveDeliveryFee()', () => {
  test('standard delivery when no service selected', () => {
    expect(resolveDeliveryFee(null, '', 1000, DEFAULT_SETTINGS)).toBe(600);
  });
  test('free when subtotal meets threshold', () => {
    expect(resolveDeliveryFee(null, '', 5000, DEFAULT_SETTINGS)).toBe(0);
  });
  test('free threshold is inclusive', () => {
    expect(resolveDeliveryFee(null, '', 5000, DEFAULT_SETTINGS)).toBe(0);
  });
  test('one rupee below threshold still charges', () => {
    expect(resolveDeliveryFee(null, '', 4999, DEFAULT_SETTINGS)).toBe(600);
  });
  test('uses rate from a delivery service', () => {
    expect(resolveDeliveryFee(mkDelivery(350), 'colombo', 1000, DEFAULT_SETTINGS)).toBe(350);
  });
  test('service freeAbove threshold — free when met', () => {
    const svc = mkDelivery(350, 3000);
    expect(resolveDeliveryFee(svc, '', 3000, DEFAULT_SETTINGS)).toBe(0);
    expect(resolveDeliveryFee(svc, '', 2999, DEFAULT_SETTINGS)).toBe(350);
  });
  test('zone rate overrides default for matching city', () => {
    const svc = {
      rates: [{ price: 500, freeAbove: 0 }],
      zoneRates: [{ zones: ['Colombo', 'Dehiwala'], price: 200, freeAbove: 0 }],
    };
    expect(resolveDeliveryFee(svc, 'colombo', 1000, DEFAULT_SETTINGS)).toBe(200);
    expect(resolveDeliveryFee(svc, 'kandy',   1000, DEFAULT_SETTINGS)).toBe(500);
  });
  test('partial city match triggers zone rate ("Colombo 7")', () => {
    const svc = {
      rates: [{ price: 600, freeAbove: 0 }],
      zoneRates: [{ zones: ['Colombo'], price: 250, freeAbove: 0 }],
    };
    expect(resolveDeliveryFee(svc, 'colombo 7', 1000, DEFAULT_SETTINGS)).toBe(250);
  });
  test('defaults to Rs. 600 when settings is empty', () => {
    expect(resolveDeliveryFee(null, '', 1000, {})).toBe(600);
  });
  test('defaults to 5000 free threshold when settings is empty', () => {
    expect(resolveDeliveryFee(null, '', 5000, {})).toBe(0);
  });
  test('free delivery service (Rs. 0 rate)', () => {
    expect(resolveDeliveryFee(mkDelivery(0), '', 100, DEFAULT_SETTINGS)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. BEST-BENEFIT SELECTION
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveBestBenefit()', () => {
  test('no benefit when both null', () => {
    expect(resolveBestBenefit(null, null, 5000)).toEqual({ type: 'none', discount: 0 });
  });
  test('coupon used when no gift card', () => {
    const r = resolveBestBenefit(mkCoupon(500), null, 5000);
    expect(r.type).toBe('coupon');
    expect(r.discount).toBe(500);
  });
  test('gift card used when no coupon', () => {
    const r = resolveBestBenefit(null, mkGiftCard(800), 5000);
    expect(r.type).toBe('giftcard');
    expect(r.discount).toBe(800);
  });
  test('coupon wins when saving is larger', () => {
    const r = resolveBestBenefit(mkCoupon(1000), mkGiftCard(700), 5000);
    expect(r.type).toBe('coupon');
    expect(r.discount).toBe(1000);
  });
  test('gift card wins when saving is larger', () => {
    const r = resolveBestBenefit(mkCoupon(300), mkGiftCard(800), 5000);
    expect(r.type).toBe('giftcard');
    expect(r.discount).toBe(800);
  });
  test('coupon wins on equal savings (tie-break rule)', () => {
    const r = resolveBestBenefit(mkCoupon(500), mkGiftCard(500), 5000);
    expect(r.type).toBe('coupon');
  });
  test('gift card discount capped at subtotal', () => {
    const r = resolveBestBenefit(null, mkGiftCard(3000), 2000);
    expect(r.type).toBe('giftcard');
    expect(r.discount).toBe(2000);
  });
  test('capped gift card can still lose to coupon', () => {
    const r = resolveBestBenefit(mkCoupon(2500), mkGiftCard(3000), 2000);
    expect(r.type).toBe('coupon');
    expect(r.discount).toBe(2500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. FINAL TOTALS
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTotals()', () => {
  test('no-discount baseline', () => {
    const t = computeTotals({ subtotal: 3000, deliveryFee: 600, couponData: null, giftCardData: null });
    expect(t).toMatchObject({ subtotal: 3000, discount: 0, deliveryFee: 600, total: 3600, benefitType: 'none' });
  });
  test('coupon reduces total', () => {
    const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(500), giftCardData: null });
    expect(t.discount).toBe(500);
    expect(t.total).toBe(4500);
    expect(t.benefitType).toBe('coupon');
  });
  test('gift card reduces total', () => {
    const t = computeTotals({ subtotal: 3000, deliveryFee: 600, couponData: null, giftCardData: mkGiftCard(1000) });
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(2600);
    expect(t.benefitType).toBe('giftcard');
  });
  test('total never goes below zero', () => {
    const t = computeTotals({ subtotal: 1000, deliveryFee: 0, couponData: mkCoupon(5000), giftCardData: null });
    expect(t.total).toBe(0);
    expect(t.discount).toBe(1000);
  });
  test('discount capped at subtotal + deliveryFee', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 300, couponData: mkCoupon(9999), giftCardData: null });
    expect(t.discount).toBe(2300);
    expect(t.total).toBe(0);
  });
  test('gift card fully covers order', () => {
    const t = computeTotals({ subtotal: 1000, deliveryFee: 0, couponData: null, giftCardData: mkGiftCard(5000) });
    expect(t.total).toBe(0);
    expect(t.discount).toBe(1000);
    expect(t.benefitType).toBe('giftcard');
  });
  test('gift card of 0 is no benefit', () => {
    const t = computeTotals({ subtotal: 3000, deliveryFee: 0, couponData: null, giftCardData: mkGiftCard(0) });
    expect(t.benefitType).toBe('none');
    expect(t.discount).toBe(0);
  });
  test('coupon of 0 is no benefit', () => {
    const t = computeTotals({ subtotal: 3000, deliveryFee: 0, couponData: mkCoupon(0), giftCardData: null });
    expect(t.benefitType).toBe('none');
  });
  test('rounds to 2 decimal places', () => {
    const t = computeTotals({ subtotal: 1000.005, deliveryFee: 0, couponData: null, giftCardData: null });
    expect(t.subtotal).toBe(1000.01);
  });
  test('best benefit wins — gift card > coupon', () => {
    const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(200), giftCardData: mkGiftCard(800) });
    expect(t.benefitType).toBe('giftcard');
    expect(t.discount).toBe(800);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. computeCartTotals() WRAPPER
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCartTotals()', () => {
  const items = [{ price: 2000, quantity: 2 }, { price: 500, quantity: 1 }]; // 4500

  test('standard delivery below threshold', () => {
    const t = computeCartTotals(items, null, '', DEFAULT_SETTINGS, null, null);
    expect(t.subtotal).toBe(4500);
    expect(t.deliveryFee).toBe(600);
    expect(t.total).toBe(5100);
  });
  test('free delivery when subtotal meets threshold', () => {
    const t = computeCartTotals([{ price: 5000, quantity: 1 }], null, '', DEFAULT_SETTINGS, null, null);
    expect(t.deliveryFee).toBe(0);
    expect(t.total).toBe(5000);
  });
  test('applies coupon', () => {
    const t = computeCartTotals(items, null, '', DEFAULT_SETTINGS, mkCoupon(500), null);
    expect(t.discount).toBe(500);
    expect(t.total).toBe(4600);
  });
  test('applies gift card', () => {
    const t = computeCartTotals(items, null, '', DEFAULT_SETTINGS, null, mkGiftCard(700));
    expect(t.discount).toBe(700);
    expect(t.total).toBe(4400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. COUPON DISCOUNT RULES
// ─────────────────────────────────────────────────────────────────────────────

describe('Coupon discount rules', () => {
  test('10% off Rs. 3000 = Rs. 300 discount', () => {
    const discount = Math.round((3000 * 10) / 100);
    const t = computeTotals({ subtotal: 3000, deliveryFee: 0, couponData: mkCoupon(discount), giftCardData: null });
    expect(t.discount).toBe(300);
    expect(t.total).toBe(2700);
  });
  test('30% off Rs. 5000 capped at Rs. 1000 max', () => {
    const capped = Math.min(Math.round((5000 * 30) / 100), 1000);
    const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(capped), giftCardData: null });
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(4000);
  });
  test('fixed coupon Rs. 500 off Rs. 2000 + Rs. 300 delivery', () => {
    const t = computeTotals({ subtotal: 2000, deliveryFee: 300, couponData: mkCoupon(500), giftCardData: null });
    expect(t.discount).toBe(500);
    expect(t.total).toBe(1800);
  });
  test('null couponData = no discount applied', () => {
    const t = computeTotals({ subtotal: 3000, deliveryFee: 600, couponData: null, giftCardData: null });
    expect(t.discount).toBe(0);
    expect(t.total).toBe(3600);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SEASONAL PROMOTION COUPONS
// ─────────────────────────────────────────────────────────────────────────────

describe('Seasonal promotions', () => {
  test('XMAS25 — 25% off Rs. 4000 = Rs. 1000', () => {
    const t = computeTotals({ subtotal: 4000, deliveryFee: 0, couponData: mkCoupon(1000), giftCardData: null });
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(3000);
    expect(t.benefitType).toBe('coupon');
  });
  test('BLACK50 — 50% off Rs. 10000 = Rs. 5000', () => {
    const t = computeTotals({ subtotal: 10000, deliveryFee: 0, couponData: mkCoupon(5000), giftCardData: null });
    expect(t.discount).toBe(5000);
    expect(t.total).toBe(5000);
  });
  test('BLACK50 on Rs. 15000 capped at Rs. 5000 max', () => {
    const capped = Math.min(Math.round((15000 * 50) / 100), 5000);
    const t = computeTotals({ subtotal: 15000, deliveryFee: 0, couponData: mkCoupon(capped), giftCardData: null });
    expect(t.discount).toBe(5000);
    expect(t.total).toBe(10000);
  });
  test('EID20 — seasonal coupon loses to larger gift card', () => {
    const couponDiscount = Math.round((3000 * 20) / 100); // 600
    const t = computeTotals({
      subtotal: 3000, deliveryFee: 0,
      couponData: mkCoupon(couponDiscount),
      giftCardData: mkGiftCard(900),
    });
    expect(t.benefitType).toBe('giftcard');
    expect(t.discount).toBe(900);
  });
  test('NEWYEAR20 — 20% off Rs. 5000 cart with free delivery', () => {
    const sub         = 5000;
    const deliveryFee = resolveDeliveryFee(null, '', sub, DEFAULT_SETTINGS); // 0
    const discount    = Math.round((sub * 20) / 100);                        // 1000
    const t = computeTotals({ subtotal: sub, deliveryFee, couponData: mkCoupon(discount), giftCardData: null });
    expect(t.deliveryFee).toBe(0);
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(4000);
  });
  test('LOVE15 — 15% off Rs. 2000 with standard delivery', () => {
    const sub         = 2000;
    const deliveryFee = resolveDeliveryFee(null, '', sub, DEFAULT_SETTINGS); // 600
    const discount    = Math.round((sub * 15) / 100);                        // 300
    const t = computeTotals({ subtotal: sub, deliveryFee, couponData: mkCoupon(discount), giftCardData: null });
    expect(t.discount).toBe(300);
    expect(t.total).toBe(2300); // 2000 - 300 + 600
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. FULL CHECKOUT SCENARIOS (A – J)
// ─────────────────────────────────────────────────────────────────────────────

describe('Full checkout scenarios', () => {
  test('A — plain cart, standard delivery, no discount', () => {
    const items = [{ price: 1500, quantity: 2 }, { price: 800, quantity: 1 }];
    const t = computeCartTotals(items, null, 'Kandy', DEFAULT_SETTINGS, null, null);
    expect(t.subtotal).toBe(3800);
    expect(t.deliveryFee).toBe(600);
    expect(t.discount).toBe(0);
    expect(t.total).toBe(4400);
  });

  test('B — sale items in cart with 15% coupon', () => {
    const items = [
      { price: 3000, salePrice: 2000, quantity: 1 },
      { price: 1000, quantity: 2 },
    ];
    const sub      = computeSubtotal(items); // 4000
    const discount = Math.round((sub * 15) / 100); // 600
    const t = computeTotals({ subtotal: sub, deliveryFee: 600, couponData: mkCoupon(discount), giftCardData: null });
    expect(t.subtotal).toBe(4000);
    expect(t.discount).toBe(600);
    expect(t.total).toBe(4000); // 4000 - 600 + 600
  });

  test('C — gift card covers entire order (Rs. 0 due)', () => {
    const t = computeCartTotals([{ price: 2000, quantity: 1 }], null, '', DEFAULT_SETTINGS, null, mkGiftCard(5000));
    expect(t.total).toBe(0);
    expect(t.benefitType).toBe('giftcard');
  });

  test('D — cart Rs. 8000: free delivery + 10% coupon', () => {
    const sub         = 8000;
    const deliveryFee = resolveDeliveryFee(null, '', sub, DEFAULT_SETTINGS); // 0
    const discount    = Math.round((sub * 10) / 100);                        // 800
    const t = computeTotals({ subtotal: sub, deliveryFee, couponData: mkCoupon(discount), giftCardData: null });
    expect(t.deliveryFee).toBe(0);
    expect(t.discount).toBe(800);
    expect(t.total).toBe(7200);
  });

  test('E — Colombo zone free delivery (freeAbove 4000) + Rs. 400 fixed coupon', () => {
    const svc = {
      rates: [{ price: 800, freeAbove: 0 }],
      zoneRates: [{ zones: ['Colombo'], price: 300, freeAbove: 4000 }],
    };
    const sub         = computeSubtotal([{ price: 2000, quantity: 2 }]); // 4000
    const deliveryFee = resolveDeliveryFee(svc, 'colombo', sub, DEFAULT_SETTINGS); // 0
    expect(deliveryFee).toBe(0);
    const t = computeTotals({ subtotal: sub, deliveryFee, couponData: mkCoupon(400), giftCardData: null });
    expect(t.total).toBe(3600);
  });

  test('F — coupon Rs. 1200 beats gift card Rs. 800', () => {
    const t = computeTotals({ subtotal: 6000, deliveryFee: 0, couponData: mkCoupon(1200), giftCardData: mkGiftCard(800) });
    expect(t.benefitType).toBe('coupon');
    expect(t.discount).toBe(1200);
    expect(t.total).toBe(4800);
  });

  test('F² — gift card Rs. 900 beats coupon Rs. 400', () => {
    const t = computeTotals({ subtotal: 6000, deliveryFee: 0, couponData: mkCoupon(400), giftCardData: mkGiftCard(900) });
    expect(t.benefitType).toBe('giftcard');
    expect(t.discount).toBe(900);
    expect(t.total).toBe(5100);
  });

  test('G — empty cart still computes delivery fee', () => {
    const t = computeCartTotals([], null, '', DEFAULT_SETTINGS, null, null);
    expect(t.subtotal).toBe(0);
    expect(t.deliveryFee).toBe(600);
    expect(t.total).toBe(600);
  });

  test('H — oversized gift card covers subtotal + delivery', () => {
    const t = computeTotals({ subtotal: 1000, deliveryFee: 600, couponData: null, giftCardData: mkGiftCard(99999) });
    expect(t.discount).toBe(1600); // capped at 1000 + 600
    expect(t.total).toBe(0);
  });

  test('I — BLACK50 Rs. 15000 cart, cap Rs. 5000', () => {
    const capped = Math.min(Math.round((15000 * 50) / 100), 5000);
    const t = computeTotals({ subtotal: 15000, deliveryFee: 0, couponData: mkCoupon(capped), giftCardData: null });
    expect(t.discount).toBe(5000);
    expect(t.total).toBe(10000);
  });

  test('J — COD multi-item order, standard delivery', () => {
    const items = [{ price: 450, quantity: 3 }, { price: 1200, quantity: 1 }];
    const t = computeCartTotals(items, null, 'Galle', DEFAULT_SETTINGS, null, null);
    expect(t.subtotal).toBe(2550);
    expect(t.deliveryFee).toBe(600);
    expect(t.total).toBe(3150);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. EDGE CASES
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('zero-price product', () => {
    expect(effectivePrice({ price: 0 })).toBe(0);
    expect(lineItemTotal({ price: 0, quantity: 5 })).toBe(0);
  });
  test('decimal subtotal rounds to 2 dp', () => {
    const t = computeTotals({ subtotal: 999.999, deliveryFee: 0, couponData: null, giftCardData: null });
    expect(t.subtotal).toBe(1000);
  });
  test('exactly at free delivery boundary', () => {
    expect(resolveDeliveryFee(null, '', 5000, DEFAULT_SETTINGS)).toBe(0);
    expect(resolveDeliveryFee(null, '', 4999, DEFAULT_SETTINGS)).toBe(600);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. DISCOUNT RULES — excludeSaleItems & profit protection
// ─────────────────────────────────────────────────────────────────────────────

describe('Discount rules — excludeSaleItems', () => {
// These tests validate the ENGINE behaviour for the flag.
// The actual enforcement lives in validateCoupon() on the backend;
// on the frontend the UI shows a warning. The tests below verify the
// computeTotals/resolveBestBenefit layer is not affected when the
// coupon has already been rejected (couponData is null).

test('no coupon applied when couponData is null (excludeSaleItems rejected server-side)', () => {
  const t = computeTotals({ subtotal: 3000, deliveryFee: 0, couponData: null, giftCardData: null });
  expect(t.benefitType).toBe('none');
  expect(t.discount).toBe(0);
});

test('coupon applies normally when cart has no sale items', () => {
  // Items without salePrice — coupon should work fine
  const t = computeTotals({ subtotal: 3000, deliveryFee: 0, couponData: mkCoupon(300), giftCardData: null });
  expect(t.benefitType).toBe('coupon');
  expect(t.discount).toBe(300);
  expect(t.total).toBe(2700);
});

test('gift card still works even if coupon was blocked by excludeSaleItems', () => {
  // Simulate: coupon rejected server-side → couponData null, giftCardData present
  const t = computeTotals({ subtotal: 2000, deliveryFee: 600, couponData: null, giftCardData: mkGiftCard(500) });
  expect(t.benefitType).toBe('giftcard');
  expect(t.discount).toBe(500);
  expect(t.total).toBe(2100);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. DISCOUNT PRIORITY RULES
// ─────────────────────────────────────────────────────────────────────────────

describe('Discount priority — best saving always wins', () => {
test('larger coupon beats smaller gift card', () => {
  const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(800), giftCardData: mkGiftCard(400) });
  expect(t.benefitType).toBe('coupon');
  expect(t.discount).toBe(800);
});

test('larger gift card beats smaller coupon', () => {
  const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(400), giftCardData: mkGiftCard(800) });
  expect(t.benefitType).toBe('giftcard');
  expect(t.discount).toBe(800);
});

test('coupon wins on tie (deterministic tie-break)', () => {
  const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(600), giftCardData: mkGiftCard(600) });
  expect(t.benefitType).toBe('coupon');
  expect(t.discount).toBe(600);
});

test('only best benefit applies — discount never adds both together', () => {
  const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(400), giftCardData: mkGiftCard(700) });
  // Must NOT be 1100 (400 + 700)
  expect(t.discount).toBe(700);
  expect(t.discount).not.toBe(1100);
});

test('no benefit when both coupon and gift card are zero', () => {
  const t = computeTotals({ subtotal: 3000, deliveryFee: 0, couponData: mkCoupon(0), giftCardData: mkGiftCard(0) });
  expect(t.benefitType).toBe('none');
  expect(t.discount).toBe(0);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. GIFT CARD AS PAYMENT (covers delivery)
// ─────────────────────────────────────────────────────────────────────────────

describe('Gift card as payment — covers delivery fee', () => {
test('gift card covers subtotal + delivery — total is 0', () => {
  const t = computeTotals({ subtotal: 2000, deliveryFee: 600, couponData: null, giftCardData: mkGiftCard(5000) });
  expect(t.total).toBe(0);
  expect(t.discount).toBe(2600); // 2000 + 600
  expect(t.benefitType).toBe('giftcard');
});

test('partial gift card reduces total, delivery still owed if not fully covered', () => {
  const t = computeTotals({ subtotal: 2000, deliveryFee: 600, couponData: null, giftCardData: mkGiftCard(800) });
  // 800 gift card covers 800 of the 2600 total
  expect(t.discount).toBe(800);
  expect(t.total).toBe(1800); // 2000 - 800 + 600
});

test('gift card of exactly subtotal + delivery zeroes the order', () => {
  const t = computeTotals({ subtotal: 1500, deliveryFee: 300, couponData: null, giftCardData: mkGiftCard(1800) });
  expect(t.total).toBe(0);
  expect(t.discount).toBe(1800);
});

test('gift card of 1 rupee more than total — discount capped, total is 0', () => {
  const t = computeTotals({ subtotal: 1000, deliveryFee: 200, couponData: null, giftCardData: mkGiftCard(1201) });
  expect(t.total).toBe(0);
  expect(t.discount).toBe(1200); // capped at subtotal + delivery
});

test('zero-balance gift card = no benefit', () => {
  const t = computeTotals({ subtotal: 1000, deliveryFee: 600, couponData: null, giftCardData: mkGiftCard(0) });
  expect(t.benefitType).toBe('none');
  expect(t.total).toBe(1600);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. MAXIMUM DISCOUNT CAP
// ─────────────────────────────────────────────────────────────────────────────

describe('Maximum discount cap (subtotal + delivery floor)', () => {
test('coupon larger than order total is capped — total is 0, not negative', () => {
  const t = computeTotals({ subtotal: 500, deliveryFee: 0, couponData: mkCoupon(9999), giftCardData: null });
  expect(t.total).toBe(0);
  expect(t.discount).toBe(500);
});

test('coupon exactly equal to subtotal + delivery — total is 0', () => {
  const t = computeTotals({ subtotal: 1000, deliveryFee: 400, couponData: mkCoupon(1400), giftCardData: null });
  expect(t.total).toBe(0);
  expect(t.discount).toBe(1400);
});

test('coupon one rupee over total — still 0, not -1', () => {
  const t = computeTotals({ subtotal: 1000, deliveryFee: 0, couponData: mkCoupon(1001), giftCardData: null });
  expect(t.total).toBe(0);
  expect(t.discount).toBe(1000);
});

test('30% percentage coupon capped at maxDiscount Rs. 1000 on Rs. 5000 cart', () => {
  const cappedDiscount = Math.min(Math.round((5000 * 30) / 100), 1000);
  const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(cappedDiscount), giftCardData: null });
  expect(t.discount).toBe(1000); // 1500 capped to 1000
  expect(t.total).toBe(4000);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. MINIMUM PROFIT MARGIN PROTECTION (frontend simulation)
// ─────────────────────────────────────────────────────────────────────────────

describe('Profit margin protection (simulated pre-computed discount)', () => {
// The actual margin calculation runs server-side in validateCoupon().
// These tests verify the engine correctly applies the already-computed
// (profit-capped) discount value that the server returns.

test('server returns profit-capped discount — engine applies it correctly', () => {
  // Product: price 1000, costPrice 600 → margin 400
  // Coupon: 50% off = 500, but profit cap 50% of margin = 200
  // Server returns discount=200 (already capped)
  const t = computeTotals({ subtotal: 1000, deliveryFee: 0, couponData: mkCoupon(200), giftCardData: null });
  expect(t.discount).toBe(200);
  expect(t.total).toBe(800);
  expect(t.benefitType).toBe('coupon');
});

test('profit protection reduces 40% coupon to margin-safe amount', () => {
  // Subtotal 2000, margin 800, profit cap 50% = max discount 400
  // 40% of 2000 = 800 but capped at 400 by profit protection
  const serverReturnedDiscount = 400;
  const t = computeTotals({ subtotal: 2000, deliveryFee: 600, couponData: mkCoupon(serverReturnedDiscount), giftCardData: null });
  expect(t.discount).toBe(400);
  expect(t.total).toBe(2200); // 2000 - 400 + 600
});

test('when margin is zero, server returns no coupon (couponData null)', () => {
  // Zero margin products → validateCoupon returns error → couponData stays null
  const t = computeTotals({ subtotal: 1000, deliveryFee: 0, couponData: null, giftCardData: null });
  expect(t.benefitType).toBe('none');
  expect(t.discount).toBe(0);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. HIGHEST PRODUCT DISCOUNT ONLY
// ─────────────────────────────────────────────────────────────────────────────

describe('Only highest product discount applies (effectivePrice)', () => {
test('salePrice wins over regular price — never adds both', () => {
  const item = { price: 2000, salePrice: 1500, quantity: 1 };
  expect(lineItemTotal(item)).toBe(1500); // not 2000 or 3500
});

test('effectivePrice ignores salePrice higher than price (bad data)', () => {
  expect(effectivePrice({ price: 1000, salePrice: 1200 })).toBe(1000);
});

test('effectivePrice ignores zero salePrice (treat as no discount)', () => {
  expect(effectivePrice({ price: 1000, salePrice: 0 })).toBe(1000);
});

test('cart with mixed sale/full-price items uses correct per-item price', () => {
  const items = [
    { price: 3000, salePrice: 2000, quantity: 1 }, // uses 2000
    { price: 1500, quantity: 2 },                   // uses 1500 × 2 = 3000
    { price: 500, salePrice: 450, quantity: 3 },    // uses 450 × 3 = 1350
  ];
  expect(computeSubtotal(items)).toBe(6350); // 2000 + 3000 + 1350
});

test('sale price of Rs. 1 (extreme) is honoured', () => {
  expect(effectivePrice({ price: 5000, salePrice: 1 })).toBe(1);
  expect(lineItemTotal({ price: 5000, salePrice: 1, quantity: 2 })).toBe(2);
});
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. COMBINED ADMIN SETTINGS SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

describe('Combined admin settings scenarios', () => {
test('globalMaxDiscountPct of 10% on Rs. 5000 limits coupon to Rs. 500', () => {
  // Admin sets globalMaxDiscountPct=10. Server applies it before returning discount.
  const maxAllowed = Math.round(5000 * 10 / 100); // 500
  const couponWouldBe = 1500; // e.g. 30% coupon
  const serverReturnedDiscount = Math.min(couponWouldBe, maxAllowed);
  const t = computeTotals({ subtotal: 5000, deliveryFee: 0, couponData: mkCoupon(serverReturnedDiscount), giftCardData: null });
  expect(t.discount).toBe(500);
  expect(t.total).toBe(4500);
});

test('allowCouponOnSaleItems=false — coupon rejected, gift card still works', () => {
  // Server rejects coupon due to sale items → couponData null
  const t = computeTotals({
    subtotal: 3000, deliveryFee: 0,
    couponData: null,            // blocked server-side
    giftCardData: mkGiftCard(600),
  });
  expect(t.benefitType).toBe('giftcard');
  expect(t.discount).toBe(600);
});

test('free delivery + profit-capped coupon + gift card — best benefit wins', () => {
  // Cart: Rs. 6000, free delivery
  // Coupon: 20% = 1200, but profit cap returns 800
  // Gift card: Rs. 700
  // Best: coupon (800) > gift card (700)
  const t = computeTotals({
    subtotal: 6000, deliveryFee: 0,
    couponData: mkCoupon(800),
    giftCardData: mkGiftCard(700),
  });
  expect(t.benefitType).toBe('coupon');
  expect(t.discount).toBe(800);
  expect(t.total).toBe(5200);
});

test('gift card covers delivery when giftCardCoversDelivery is true', () => {
  // Rs. 2000 cart + Rs. 600 delivery, gift card Rs. 3000
  const t = computeCartTotals(
    [{ price: 2000, quantity: 1 }],
    null, '', DEFAULT_SETTINGS,
    null, mkGiftCard(3000)
  );
  expect(t.total).toBe(0);
  expect(t.discount).toBe(2600); // covers subtotal + delivery
});

test('seasonal coupon (BLACK50) + gift card — gift card wins if larger', () => {
  // Seasonal: 50% off Rs. 4000 = Rs. 2000 (BLACK50)
  // Gift card: Rs. 2500 balance
  // Gift card wins
  const t = computeTotals({
    subtotal: 4000, deliveryFee: 0,
    couponData: mkCoupon(2000),
    giftCardData: mkGiftCard(2500),
  });
  expect(t.benefitType).toBe('giftcard');
  expect(t.discount).toBe(2500);
  expect(t.total).toBe(1500);
});

test('NEWYEAR coupon with profit margin protection — engine applies pre-capped value', () => {
  // Cart Rs. 3000, margin Rs. 600 (20% margin), profit cap 50% = max Rs. 300
  // NEWYEAR20 would give 20% = Rs. 600 but capped to Rs. 300
  const t = computeTotals({
    subtotal: 3000, deliveryFee: 600,
    couponData: mkCoupon(300), // already capped server-side
    giftCardData: null,
  });
  expect(t.discount).toBe(300);
  expect(t.total).toBe(3300); // 3000 - 300 + 600
});
});