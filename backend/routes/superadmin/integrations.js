'use strict';

const express = require('express');
const PlatformIntegration = require('../../models/PlatformIntegration');
const registry = require('../../config/integrationRegistry');
const { listIntegrations, providerErrorMessage, saveIntegration, testProvider } = require('../../services/platformIntegrationService');
const { requirePlatformPermission } = require('../../services/platformAuthorizationService');
const { requireRecentStepUp } = require('../../middleware/stepUp');

const router = express.Router();

router.get('/', requirePlatformPermission('infrastructure.view'), async (_req, res, next) => {
  try { res.json({ integrations: await listIntegrations(), categories: Array.from(new Set(registry.providers.map(provider => provider.category))) }); }
  catch (error) { next(error); }
});

router.put('/:provider', requirePlatformPermission('infrastructure.manage'), requireRecentStepUp(), async (req, res, next) => {
  try {
    const before = (await listIntegrations()).find(item => item.provider === req.params.provider) || null;
    const integration = await saveIntegration(req.params.provider, req.body || {}, req.user._id);
    req.audit.set({ action: 'integration.update', resource: 'integration', resourceId: req.params.provider, changes: { oldValue: before, newValue: integration, changedFields: ['enabled', 'config', 'secretFields'] } });
    res.json(integration);
  } catch (error) { res.status(400).json({ message: error.message }); }
});

router.post('/:provider/test', requirePlatformPermission('infrastructure.manage'), async (req, res) => {
  const started = Date.now();
  try {
    if (!registry.byKey.has(req.params.provider)) return res.status(404).json({ message: 'Unsupported integration provider' });
    const result = await testProvider(req.params.provider);
    const lastTest = { status: result.status, testedAt: new Date(), durationMs: Date.now() - started, message: result.message, testedBy: req.user._id };
    await PlatformIntegration.findOneAndUpdate({ provider: req.params.provider }, { $set: { lastTest } }, { upsert: true, runValidators: true });
    req.audit.set({ action: 'integration.test', resource: 'integration', resourceId: req.params.provider, metadata: { status: result.status, durationMs: lastTest.durationMs, mode: result.mode } });
    res.json({ ...result, testedAt: lastTest.testedAt, durationMs: lastTest.durationMs });
  } catch (error) {
    const message = providerErrorMessage(error);
    const lastTest = { status: 'failed', testedAt: new Date(), durationMs: Date.now() - started, message, testedBy: req.user._id };
    await PlatformIntegration.findOneAndUpdate({ provider: req.params.provider }, { $set: { lastTest } }, { upsert: true, runValidators: true }).catch(() => {});
    req.audit.set({ action: 'integration.test', resource: 'integration', resourceId: req.params.provider, metadata: { status: 'failed', durationMs: lastTest.durationMs } });
    res.status(502).json({ message: 'Provider connection test failed', detail: message, testedAt: lastTest.testedAt, durationMs: lastTest.durationMs });
  }
});

module.exports = router;
