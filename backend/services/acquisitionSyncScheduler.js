'use strict';

const PlatformIntegration = require('../models/PlatformIntegration');
const { syncGoogleAdsSpend, syncMetaAdsSpend } = require('./acquisitionSyncService');
const { runTrackedJob } = require('./operationsService');

const INTERVAL_MS = 60 * 60 * 1000;
const CLAIM_MS = 6 * 60 * 60 * 1000;
let timer = null;
let lastTickAt = null;

async function claimAndRun(provider, jobName, sync) {
  const now = new Date();
  const integration = await PlatformIntegration.findOneAndUpdate({
    provider, enabled: true, updatedBy: { $ne: null },
    $or: [{ 'lastSync.nextEligibleAt': null }, { 'lastSync.nextEligibleAt': { $exists: false } }, { 'lastSync.nextEligibleAt': { $lte: now } }],
  }, { $set: { 'lastSync.status': 'running', 'lastSync.startedAt': now, 'lastSync.nextEligibleAt': new Date(now.getTime() + CLAIM_MS), 'lastSync.message': 'Scheduled synchronization claimed' } }, { new: true });
  if (!integration) return { provider, skipped: true, message: `${provider} acquisition sync is disabled, unattributable, or not yet due` };
  try {
    return await runTrackedJob(jobName, () => sync({ actorId: integration.updatedBy, days: 7 }), { provider, trigger: 'scheduler' });
  } catch (error) {
    await PlatformIntegration.updateOne({ _id: integration._id, 'lastSync.status': 'running' }, { $set: { 'lastSync.status': 'failed', 'lastSync.completedAt': new Date(), 'lastSync.nextEligibleAt': new Date(Date.now() + INTERVAL_MS), 'lastSync.message': 'Scheduled synchronization failed; review the tracked job error' } }).catch(() => {});
    throw error;
  }
}

async function runAcquisitionSyncSchedulerOnce() {
  lastTickAt = new Date();
  const providers = [];
  for (const item of [
    ['meta-ads', 'acquisition-meta-ads-sync', syncMetaAdsSpend],
    ['google-ads', 'acquisition-google-ads-sync', syncGoogleAdsSpend],
  ]) {
    try { providers.push(await claimAndRun(...item)); }
    catch (error) { providers.push({ provider: item[0], failed: true, message: 'Scheduled synchronization failed; review the tracked job error' }); }
  }
  return { providers };
}

function startAcquisitionSyncScheduler() {
  if (timer || process.env.DISABLE_SCHEDULERS === 'true') return timer;
  timer = setInterval(() => runAcquisitionSyncSchedulerOnce().catch(error => console.error('[ACQUISITION_SYNC_FAILED]', error.message)), INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => runAcquisitionSyncSchedulerOnce().catch(error => console.error('[ACQUISITION_SYNC_START_FAILED]', error.message)), 45000).unref?.();
  return timer;
}

function stopAcquisitionSyncScheduler() { if (timer) clearInterval(timer); timer = null; }
function getAcquisitionSyncSchedulerHealth() { return { running: Boolean(timer), intervalMs: INTERVAL_MS, claimMs: CLAIM_MS, lastTickAt }; }

module.exports = { CLAIM_MS, INTERVAL_MS, getAcquisitionSyncSchedulerHealth, runAcquisitionSyncSchedulerOnce, startAcquisitionSyncScheduler, stopAcquisitionSyncScheduler };
