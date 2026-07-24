'use strict';

class BaseCourierProvider {
  constructor(config) { this.config = config; }
  async testConnection() { throw new Error('Provider connection test is not implemented'); }
  async submitOrder() { throw new Error('Provider order submission is not implemented'); }
  async getTracking() { throw new Error('Provider tracking is not implemented'); }
  normalizeStatus(status, fallback) { return fallback; }
}

module.exports = BaseCourierProvider;
