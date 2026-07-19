'use strict';

/**
 * subscriptionScheduler.js
 *
 * Runs subscriptionService.tick() once at startup (catches up anything missed
 * while the server was down) and then every hour. Same no-cron-dependency
 * polling pattern as services/backupScheduler.js and services/tokenRefreshScheduler.js.
 *
 * Call startSubscriptionScheduler() once from server.js after MongoDB connects.
 */

const { tick } = require('./subscriptionService');
const { runTrackedJob } = require('./operationsService');

let _timer = null;

async function run() {
  try {
    await runTrackedJob('subscription-billing', tick);
  } catch (err) {
    console.error('[SubscriptionScheduler] Tick error:', err.message);
  }
}

function startSubscriptionScheduler() {
  if (_timer) return;
  run(); // catch up immediately on boot
  _timer = setInterval(run, 60 * 60 * 1000); // every hour
  console.log('✅ Subscription/billing scheduler started');
}

function stopSubscriptionScheduler() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

function getSubscriptionSchedulerHealth() {
  return { running: Boolean(_timer), intervalMs: 60 * 60 * 1000, scheduler: 'in_process_polling' };
}

module.exports = { getSubscriptionSchedulerHealth, startSubscriptionScheduler, stopSubscriptionScheduler };
