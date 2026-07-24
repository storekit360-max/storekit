'use strict';

const axios = require('axios');

// Koombiyo endpoint and payload names are intentionally isolated here until the
// merchant API contract is confirmed. They are configurable, never guessed in
// route code, and failures are surfaced to the admin.
function baseUrl(environment) {
  const value = environment === 'sandbox' ? process.env.KOOMBIYO_SANDBOX_URL : process.env.KOOMBIYO_PRODUCTION_URL;
  if (!value) throw new Error(`Koombiyo ${environment} API URL is not configured`);
  return value.replace(/\/$/, '');
}
function headers(credentials) { return { Authorization: `Bearer ${credentials.apiKey}`, 'Content-Type': 'application/json' }; }
async function request(config, credentials, method, path, data) {
  return axios({ baseURL: baseUrl(config.environment), method, url: path, data, headers: headers(credentials), timeout: 15000 });
}
module.exports = {
  async testConnection(config, credentials) { return request(config, credentials, 'get', process.env.KOOMBIYO_TEST_PATH || '/'); },
  async createShipment(config, credentials, payload) { return request(config, credentials, 'post', process.env.KOOMBIYO_CREATE_PATH || '/shipments', payload); },
  async tracking(config, credentials, waybill) { return request(config, credentials, 'get', `${process.env.KOOMBIYO_TRACKING_PATH || '/shipments'}/${encodeURIComponent(waybill)}`); },
};
