/**
 * routes/seasonal.js  — MODIFIED (add automation hooks)
 *
 * Only two changes from the original:
 *   POST /admin       → fires 'offer_active' if campaign is active
 *   PUT  /admin/:id/toggle → fires 'offer_active' after activation
 *
 * All other logic is identical to the original file.
 */
const express = require('express');
const router  = express.Router();
const { SeasonalCampaign, Coupon } = require('../models/index');
const { adminAuth } = require('../middleware/auth');
const { dispatchForTrigger } = require('../services/publisherService');

// ── Shared coupon auto-create helper ─────────────────────────────────────────
async function maybeCreateCoupon(data) {
  if (!data.couponAutoCreate || !data.couponCode || !(data.couponValue > 0)) return;
  try {
    await Coupon.findOneAndUpdate(
      { code: data.couponCode.toUpperCase() },
      {
        code:           data.couponCode.toUpperCase(),
        description:    data.couponDescription || data.name,
        type:           data.couponType || 'percentage',
        value:          data.couponValue,
        minOrderAmount: data.couponMinOrder || 0,
        validFrom:      data.startDate || new Date(),
        validUntil:     data.endDate   || new Date(Date.now() + 30 * 86400000),
        isActive:       true,
      },
      { upsert: true, new: true }
    );
  } catch (err) { console.warn('Coupon auto-create warning:', err.message); }
}

// Public — active campaign
router.get('/active', async (req, res) => {
  try {
    const now = new Date();
    const campaign = await SeasonalCampaign.findOne({
      isActive: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate:   { $exists: false } }, { endDate:   null }, { endDate:   { $gte: now } }] },
      ],
    }).sort({ createdAt: -1 });
    res.json(campaign || null);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public — by slug
router.get('/page/:slug', async (req, res) => {
  try {
    const now = new Date();
    const campaign = await SeasonalCampaign.findOne({
      pageSlug: req.params.slug,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate:   { $exists: false } }, { endDate:   null }, { endDate:   { $gte: now } }] },
      ],
    });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    res.json(campaign);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — deactivate all (MUST be before /:id routes)
router.put('/admin/deactivate-all', adminAuth, async (req, res) => {
  try {
    await SeasonalCampaign.updateMany({}, { isActive: false });
    res.json({ message: 'All campaigns deactivated' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — get all
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const campaigns = await SeasonalCampaign.find().sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — create  ← HOOK ADDED
router.post('/admin', adminAuth, async (req, res) => {
  try {
    await maybeCreateCoupon(req.body);
    const campaign = await SeasonalCampaign.create(req.body);
    res.status(201).json(campaign);

    if (campaign.isActive) {
      dispatchForTrigger('offer_active', campaign, 'offer');
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — toggle activate  ← HOOK ADDED
router.put('/admin/:id/toggle', adminAuth, async (req, res) => {
  try {
    await SeasonalCampaign.updateMany({}, { isActive: false });
    const campaign = await SeasonalCampaign.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true });
    res.json(campaign);

    // Always fire on activation
    if (campaign) dispatchForTrigger('offer_active', campaign, 'offer');
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — update
router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    await maybeCreateCoupon(req.body);
    const campaign = await SeasonalCampaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(campaign);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin — delete
router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await SeasonalCampaign.findByIdAndDelete(req.params.id);
    res.json({ message: 'Campaign deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;