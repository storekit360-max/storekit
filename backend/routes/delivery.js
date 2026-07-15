const express = require('express');
const router = express.Router();
const { DeliveryService, Settings } = require('../models/index');
const { adminAuth } = require('../middleware/auth');

function requireTenant(req, res) {
  const tenantId = req.user?.tenantId || req.tenantId;
  if (!tenantId) res.status(400).json({ message: 'Tenant context is required' });
  return tenantId;
}

const SAFE_FIELDS = 'name code isEnabled codAllowed sortOrder logo description trackingUrl estimatedDays rates zoneRates shippingRules freeShippingThreshold deliveryNote coverageAreas areas';

// Public - Get enabled delivery services (with delivery settings)
router.get('/', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res); if (!tenantId) return;
    const services = await DeliveryService.find({ tenantId, isEnabled: true })
      .select(SAFE_FIELDS)
      .sort({ sortOrder: 1, name: 1 });

    // Also return global delivery settings
    const settingDocs = await Settings.find({ tenantId, key: { $in: [
      'freeDeliveryThreshold','standardDelivery','deliveryETA',
      'deliveryZones','deliveryNote','deliveryEnabled'
    ]}});
    const globalSettings = {};
    settingDocs.forEach(s => { globalSettings[s.key] = s.value; });

    res.json({ services, globalSettings });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public - Calculate delivery cost (zone-aware)
router.post('/calculate', async (req, res) => {
  try {
    const tenantId = requireTenant(req, res); if (!tenantId) return;
    const { serviceCode, orderAmount, city, zone } = req.body;

    if (serviceCode) {
      const service = await DeliveryService.findOne({ tenantId, code: serviceCode, isEnabled: true });
      if (!service) return res.status(404).json({ message: 'Service not found' });

      // Find zone-specific rate if zone provided
      let rate = null;
      if ((city || zone) && service.zoneRates?.length > 0) {
        const search = (city || zone || '').toLowerCase();
        rate = service.zoneRates.find(zr =>
          zr.zones.some(z => z.toLowerCase() === search || search.includes(z.toLowerCase()))
        );
      }
      // Fall back to base rates
      if (!rate) rate = service.rates?.[0];

      const cost = rate
        ? (rate.freeAbove && orderAmount >= rate.freeAbove ? 0 : rate.price)
        : 0;

      return res.json({
        cost,
        estimatedDays: rate?.estimatedDays || service.estimatedDays,
        isFree: cost === 0,
        freeAbove: rate?.freeAbove || 0,
        serviceName: service.name,
      });
    }

    // Fallback: use global settings
    const settingDocs = await Settings.find({ tenantId, key: { $in: ['freeDeliveryThreshold','standardDelivery','deliveryETA'] }});
    const gs = {};
    settingDocs.forEach(s => { gs[s.key] = s.value; });

    const threshold = gs.freeDeliveryThreshold || 5000;
    const cost = orderAmount >= threshold ? 0 : (gs.standardDelivery || 600);
    res.json({ cost, isFree: cost === 0, freeAbove: threshold, estimatedDays: gs.deliveryETA || '3-5 business days' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Get all services
router.get('/admin/all', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenant(req, res); if (!tenantId) return;
    const services = await DeliveryService.find({ tenantId }).select(SAFE_FIELDS).sort({ sortOrder: 1, name: 1 });
    res.json(services);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Create/update service (full update with zones + rules)
router.put('/admin/:code', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenant(req, res); if (!tenantId) return;
    const body = { ...req.body };
    delete body.tenantId; delete body.apiKey; delete body.apiSecret;
    const result = await DeliveryService.findOneAndUpdate(
      { tenantId, code: req.params.code },
      { $set: { ...body, code: req.params.code, updatedAt: new Date() } },
      { upsert: true, new: true, runValidators: true }
    );
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Toggle service
router.put('/admin/:code/toggle', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenant(req, res); if (!tenantId) return;
    const svc = await DeliveryService.findOne({ tenantId, code: req.params.code });
    if (!svc) return res.status(404).json({ message: 'Service not found' });
    svc.isEnabled = !svc.isEnabled;
    await svc.save();
    res.json(svc);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Delete service
router.delete('/admin/:code', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenant(req, res); if (!tenantId) return;
    await DeliveryService.findOneAndDelete({ tenantId, code: req.params.code });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Admin - Reorder services
router.put('/admin/reorder/batch', adminAuth, async (req, res) => {
  try {
    const tenantId = requireTenant(req, res); if (!tenantId) return;
    const { order } = req.body; // array of { code, sortOrder }
    for (const item of order) {
      await DeliveryService.findOneAndUpdate({ tenantId, code: item.code }, { sortOrder: item.sortOrder });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
