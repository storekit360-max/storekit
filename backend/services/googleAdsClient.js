'use strict';

const axios = require('axios');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_HOST = 'https://googleads.googleapis.com';
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

function digits(value) { return String(value || '').trim().replaceAll('-', ''); }

function validateGoogleAdsConfig(config = {}) {
  const clientId = String(config.clientId || '').trim();
  const customerId = digits(config.customerId);
  const loginCustomerId = digits(config.loginCustomerId);
  const apiVersion = String(config.apiVersion || '').trim();
  if (!clientId || clientId.length > 300) throw Object.assign(new Error('Google Ads OAuth client ID is required'), { statusCode: 400 });
  if (!/^\d{3,20}$/.test(customerId)) throw Object.assign(new Error('Google Ads requires a numeric customer ID'), { statusCode: 400 });
  if (loginCustomerId && !/^\d{3,20}$/.test(loginCustomerId)) throw Object.assign(new Error('Google Ads login customer ID must be numeric'), { statusCode: 400 });
  if (!/^v\d{1,2}$/.test(apiVersion)) throw Object.assign(new Error('Google Ads requires an explicit API version such as v22'), { statusCode: 400 });
  return { clientId, customerId, loginCustomerId, apiVersion };
}

async function exchangeRefreshToken({ clientId, clientSecret, refreshToken }) {
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' });
  const response = await axios.post(TOKEN_URL, body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000, maxRedirects: 0, maxContentLength: 1024 * 1024 });
  const accessToken = String(response.data?.access_token || '');
  if (!accessToken) throw new Error('Google OAuth token exchange returned no access token');
  return accessToken;
}

async function searchGoogleAds({ config, secrets, query }) {
  const validated = validateGoogleAdsConfig(config);
  if (!secrets?.clientSecret || !secrets?.refreshToken || !secrets?.developerToken) throw Object.assign(new Error('Google Ads client secret, refresh token and developer token are required'), { statusCode: 409 });
  const accessToken = await exchangeRefreshToken({ clientId: validated.clientId, clientSecret: secrets.clientSecret, refreshToken: secrets.refreshToken });
  const headers = { Authorization: `Bearer ${accessToken}`, 'developer-token': secrets.developerToken, ...(validated.loginCustomerId ? { 'login-customer-id': validated.loginCustomerId } : {}) };
  const url = `${API_HOST}/${validated.apiVersion}/customers/${validated.customerId}/googleAds:searchStream`;
  const response = await axios.post(url, { query: String(query).slice(0, 4000) }, { headers, timeout: 30000, maxRedirects: 0, maxContentLength: MAX_RESPONSE_BYTES, maxBodyLength: 16 * 1024 });
  const batches = Array.isArray(response.data) ? response.data : [];
  return { config: validated, results: batches.flatMap(batch => Array.isArray(batch?.results) ? batch.results : []) };
}

module.exports = { API_HOST, MAX_RESPONSE_BYTES, TOKEN_URL, exchangeRefreshToken, searchGoogleAds, validateGoogleAdsConfig };
