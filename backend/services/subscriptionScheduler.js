'use strict';

let interval = null;

function startSubscriptionScheduler() {
  if (interval) return;
  const everyMs = Number(process.env.SUBSCRIPTION_SCHEDULER_MS || 6 * 60 * 60 * 1000);
  const { runBillingMaintenance } = require('./subscriptionBillingService');
  const tick = async () => {
    try {
      const results = await runBillingMaintenance();
      console.log(`[billing] maintenance completed for ${results.length} tenant(s)`);
    } catch (err) {
      console.warn('[billing] maintenance failed:', err.message);
    }
  };
  setTimeout(tick, 30 * 1000);
  interval = setInterval(tick, everyMs);
  if (interval.unref) interval.unref();
}

module.exports = { startSubscriptionScheduler };
