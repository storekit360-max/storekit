'use strict';

function toPayload(order, config, credentials) {
  const ship = order.shipping?.street ? order.shipping : order.billing || {};
  return { accountId: credentials.accountId, reference: order.orderNumber, recipient: {
    name: [ship.firstName, ship.lastName].filter(Boolean).join(' '), phone: ship.phone, address: ship.street, city: ship.city,
  }, amount: order.paymentMethod === 'cod' ? Number(order.total || 0) : 0, weight: Number(config.defaultPackageWeight || 1), items: order.items?.map(i => ({ name: i.name, quantity: i.quantity })) || [] };
}
function externalId(response) { return response?.data?.waybill || response?.data?.trackingNumber || response?.waybill || response?.trackingNumber || ''; }
function status(response) { return response?.data?.status || response?.status || ''; }
module.exports = { toPayload, externalId, status };
