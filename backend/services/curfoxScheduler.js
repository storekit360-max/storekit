'use strict';

const mongoose = require('mongoose');
const CourierIntegration = require('../models/CourierIntegration');
const Order = require('../models/Order');
const { runWithTenant, withoutTenantScope } = require('../middleware/tenantContext');
const { refreshOne } = require('../routes/curfox');
const { sendMail, orderStatusUpdateHtml, isEmailEnabled } = require('../utils/mailer');

let running = false;

async function runCurfoxTrackingSync() {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const configs = await withoutTenantScope(() => CourierIntegration.find({ provider: 'curfox', enabled: true })
      .select('+encryptedPassword.ciphertext +encryptedPassword.iv +encryptedPassword.tag +encryptedPassword.version').lean());
    for (const config of configs) {
      const id = config.tenantId;
      try {
        await runWithTenant(id, async () => {
          const orders = await Order.find({ tenantId: id, deliveryService: 'curfox', orderStatus: { $in: ['shipped','out_for_delivery'] },
            'courier.provider': 'curfox', 'courier.submissionState': 'submitted', 'courier.dryRun': { $ne: true }, 'courier.waybill': { $ne: '' } })
            .sort({ 'courier.lastSynchronizedAt': 1, updatedAt: 1 }).limit(50);
          for (const order of orders) {
            try {
              const before = order.orderStatus;
              const updated = await refreshOne(id, order, config);
              if (before !== 'delivered' && updated?.orderStatus === 'delivered' && updated.billing?.email) {
                if (await isEmailEnabled('order_status_customer')) await sendMail({ to: updated.billing.email,
                  subject: `Order Update — ${updated.orderNumber}`, html: await orderStatusUpdateHtml(updated, 'delivered', 'Delivered by Royal Express') });
              }
            } catch (err) {
              console.error(`[CURFOX SYNC] tenant=${String(id).slice(-6)} order=${String(order._id).slice(-6)} error=${err.message}`);
            }
          }
        });
      } catch (err) { console.error(`[CURFOX SYNC] tenant=${String(id).slice(-6)} error=${err.message}`); }
    }
  } finally { running = false; }
}

function startCurfoxScheduler() {
  const interval = Math.max(60_000, Number(process.env.CURFOX_SYNC_INTERVAL_MS) || 10 * 60_000);
  setInterval(runCurfoxTrackingSync, interval).unref();
  setTimeout(runCurfoxTrackingSync, 30_000).unref();
  console.log(`✅ Curfox tracking scheduler enabled (${Math.round(interval / 60000)} min)`);
}

module.exports = { startCurfoxScheduler, runCurfoxTrackingSync };
