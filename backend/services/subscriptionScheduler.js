'use strict';
const { runMaintenance } = require('./subscriptionBillingService');
let timer = null;
function startSubscriptionScheduler(){
  if (timer || process.env.DISABLE_SUBSCRIPTION_SCHEDULER === 'true') return;
  timer = setInterval(() => runMaintenance().catch(err => console.error('[subscription-maintenance]', err.message)), 6 * 60 * 60 * 1000);
  timer.unref?.();
}
module.exports = { startSubscriptionScheduler };
