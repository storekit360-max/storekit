'use strict';

const axios = require('axios');
const { decryptSecret } = require('../utils/secretCrypto');
const { providerRows } = require('./curfoxMapping');

const BASE_URL = process.env.CURFOX_BASE_URL || 'https://v1.api.curfox.com';
const tokenCache = new Map();

function cacheKey(tenantId, config) {
  return `${String(tenantId)}:${String(config?.courierTenant || '').toLowerCase()}:${String(config?.merchantEmail || '').toLowerCase()}`;
}

function safeProviderMessage(err) {
  const status = err?.response?.status;
  const raw = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Curfox request failed';
  const message = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const lower = message.toLowerCase();
  if (err?.code === 'ECONNABORTED') return { status: 504, message: 'Curfox request timed out. Please try again.' };
  if (!err?.response) return { status: 503, message: 'Curfox is currently unavailable.' };
  if (status === 401 || lower.includes('credential')) return { status: 401, message: 'Invalid Curfox merchant credentials.' };
  if (lower.includes('tenant')) return { status: 400, message: 'Invalid Curfox courier tenant header.' };
  if (lower.includes('business')) return { status: 400, message: 'Select a valid Curfox merchant business.' };
  if (lower.includes('undefined array key') && lower.includes('waybill')) return { status: 422, message: 'Royal Express may require a provider-issued manual waybill for this courier tenant. Enable manual waybills and enter one.' };
  if (lower.includes('duplicate') && lower.includes('waybill')) return { status: 409, message: `Curfox rejected a duplicate waybill: ${message}` };
  if (lower.includes('rate card') || lower.includes('ratecard')) return { status: 422, message: 'Royal Express/Curfox has no merchant rate card for this origin and destination city combination. Ask the courier to configure this combination.' };
  if (lower.includes('city') || lower.includes('state') || lower.includes('phone') || status === 422) return { status: 422, message: `Curfox validation failed: ${message}` };
  return { status: status >= 400 && status < 600 ? status : 502, message: `Curfox error: ${message}` };
}

async function login(tenantId, config, force = false) {
  const key = cacheKey(tenantId, config);
  const cached = tokenCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  try {
    const password = decryptSecret(config.encryptedPassword);
    const response = await axios.post(`${BASE_URL}/api/public/merchant/login`, { email: config.merchantEmail, password }, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-tenant': config.courierTenant }, timeout: 12000,
    });
    const token = response.data?.token || response.data?.data?.token || response.data?.access_token;
    if (!token) throw new Error('Curfox login did not return a bearer token');
    tokenCache.set(key, { token, expiresAt: Date.now() + 20 * 60 * 1000 });
    return token;
  } catch (err) { throw Object.assign(new Error(safeProviderMessage(err).message), { providerError: safeProviderMessage(err) }); }
}

async function request(tenantId, config, method, pathname, options = {}, retried = false) {
  try {
    const token = await login(tenantId, config);
    return await axios({ method, url: `${BASE_URL}${pathname}`, params: options.params, data: options.data, timeout: 15000,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-tenant': config.courierTenant } });
  } catch (err) {
    if (!retried && err?.response?.status === 401) { tokenCache.delete(cacheKey(tenantId, config)); await login(tenantId, config, true); return request(tenantId, config, method, pathname, options, true); }
    const detail = err.providerError || safeProviderMessage(err);
    throw Object.assign(new Error(detail.message), { providerError: detail });
  }
}

async function listBusinesses(tenantId, config) { return providerRows((await request(tenantId, config, 'get', '/api/public/merchant/business', { params: { noPagination: 1 } })).data); }
async function listCities(tenantId, config, filters = {}) { return providerRows((await request(tenantId, config, 'get', '/api/public/merchant/city', { params: { ...filters, noPagination: 1 } })).data); }
async function listStates(tenantId, config) { return providerRows((await request(tenantId, config, 'get', '/api/public/merchant/state', { params: { noPagination: 1 } })).data); }
async function createOrder(tenantId, config, payload) { return (await request(tenantId, config, 'post', '/api/public/merchant/order/single', { data: payload })).data; }
async function tracking(tenantId, config, waybill) { return (await request(tenantId, config, 'get', '/api/public/merchant/order/tracking-info', { params: { waybill_number: waybill } })).data; }
function clearTenantToken(tenantId) { const prefix=`${String(tenantId)}:`;for(const key of tokenCache.keys())if(key.startsWith(prefix))tokenCache.delete(key); }

module.exports = { login, listBusinesses, listCities, listStates, createOrder, tracking, clearTenantToken, safeProviderMessage, _tokenCache: tokenCache };
