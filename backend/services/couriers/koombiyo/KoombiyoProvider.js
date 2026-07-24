'use strict';
const Base = require('../BaseCourierProvider');
const client = require('./koombiyoClient');
const mapping = require('./koombiyoMapping');
class KoombiyoProvider extends Base {
  async testConnection(credentials) { await client.testConnection(this.config, credentials); return { success: true }; }
  async submitOrder(order, credentials) { const response = await client.createShipment(this.config, credentials, mapping.toPayload(order, this.config, credentials)); const externalId = mapping.externalId(response); if (!externalId) throw new Error('Koombiyo returned no shipment reference'); return { response, externalId, waybill: externalId }; }
  async getTracking(order, credentials) { const response = await client.tracking(this.config, credentials, order.courier?.waybill || order.trackingNumber); return { response, externalStatus: mapping.status(response), events: response?.data?.events || response?.events || [] }; }
  normalizeStatus(status, fallback) { const s = String(status || '').toLowerCase(); if (s.includes('deliver')) return 'delivered'; if (s.includes('out')) return 'out_for_delivery'; if (s.includes('ship') || s.includes('dispatch')) return 'shipped'; if (s.includes('cancel')) return 'cancelled'; return fallback; }
}
module.exports = KoombiyoProvider;
