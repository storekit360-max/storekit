'use strict';

const axios = require('axios');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const { v2: cloudinary } = require('cloudinary');
const PlatformIntegration = require('../models/PlatformIntegration');
const registry = require('../config/integrationRegistry');
const { decryptPlatformSecret, encryptPlatformSecret } = require('../utils/platformSecretCrypto');
const { searchGoogleAds } = require('./googleAdsClient');

const resolvedCache = new Map();
const RESOLVED_CACHE_MS = 30000;

function cleanConfig(provider, config) {
  const allowed = new Set(provider.configFields);
  return Object.fromEntries(Object.entries(config || {}).filter(([key]) => allowed.has(key)).map(([key, value]) => [key, typeof value === 'string' ? value.trim().slice(0, 1000) : value]));
}

function publicIntegration(provider, document) {
  const envConfigured = provider.secretFields.filter(field => Boolean(process.env[provider.env[field]]) && !document?.configuredSecretFields?.includes(field));
  return {
    provider: provider.key, label: provider.label, category: provider.category, testMode: provider.testMode,
    enabled: document?.enabled || false, config: { ...Object.fromEntries(provider.configFields.map(field => [field, process.env[provider.env[field]] || ''])), ...(document?.config || {}) },
    secretFields: provider.secretFields.map(field => ({ key: field, configured: document?.configuredSecretFields?.includes(field) || Boolean(process.env[provider.env[field]]), source: document?.configuredSecretFields?.includes(field) ? 'database' : envConfigured.includes(field) ? 'environment' : 'missing' })),
    lastTest: document?.lastTest || { status: 'never' }, updatedAt: document?.updatedAt || null,
  };
}

async function listIntegrations() {
  const documents = await PlatformIntegration.find().lean();
  const map = new Map(documents.map(document => [document.provider, document]));
  return registry.providers.map(provider => publicIntegration(provider, map.get(provider.key)));
}

async function saveIntegration(providerKey, body, actorId) {
  const provider = registry.byKey.get(providerKey);
  if (!provider) throw new Error('Unsupported integration provider');
  const existing = await PlatformIntegration.findOne({ provider: providerKey }).select('+encryptedSecrets');
  const encryptedSecrets = { ...(existing?.encryptedSecrets || {}) };
  const configured = new Set(existing?.configuredSecretFields || []);
  for (const field of provider.secretFields) {
    const value = body.secrets?.[field];
    if (value === undefined || value === '') continue;
    if (value === null) { delete encryptedSecrets[field]; configured.delete(field); }
    else { encryptedSecrets[field] = encryptPlatformSecret(String(value)); configured.add(field); }
  }
  const update = { provider: providerKey, enabled: body.enabled === true, config: cleanConfig(provider, body.config), encryptedSecrets, configuredSecretFields: Array.from(configured), updatedBy: actorId };
  const document = await PlatformIntegration.findOneAndUpdate({ provider: providerKey }, { $set: update }, { upsert: true, new: true, runValidators: true }).lean();
  resolvedCache.delete(providerKey);
  return publicIntegration(provider, document);
}

async function resolvedIntegration(providerKey) {
  const provider = registry.byKey.get(providerKey);
  if (!provider) throw new Error('Unsupported integration provider');
  const cached = resolvedCache.get(providerKey);
  if (cached?.expiresAt > Date.now()) return cached.value;
  const document = await PlatformIntegration.findOne({ provider: providerKey }).select('+encryptedSecrets').lean();
  const config = { ...Object.fromEntries(provider.configFields.map(field => [field, process.env[provider.env[field]] || ''])), ...(document?.config || {}) };
  const secrets = {};
  for (const field of provider.secretFields) secrets[field] = document?.encryptedSecrets?.[field] ? decryptPlatformSecret(document.encryptedSecrets[field]) : (process.env[provider.env[field]] || '');
  const value = { provider, document, enabled: document ? document.enabled : true, config, secrets };
  resolvedCache.set(providerKey, { value, expiresAt: Date.now() + RESOLVED_CACHE_MS });
  return value;
}

async function testProvider(providerKey) {
  const resolved = await resolvedIntegration(providerKey);
  const { provider, config, secrets } = resolved;
  const missing = provider.secretFields.filter(field => !secrets[field]);
  if (missing.length) throw new Error(`Missing required secret fields: ${missing.join(', ')}`);
  if (provider.key === 'stripe') await new Stripe(secrets.secretKey).balance.retrieve();
  else if (provider.key === 'cloudinary') { cloudinary.config({ cloud_name: config.cloudName, api_key: secrets.apiKey, api_secret: secrets.apiSecret }); await cloudinary.api.ping(); }
  else if (provider.key === 'resend') await axios.get('https://api.resend.com/domains', { headers: { Authorization: `Bearer ${secrets.apiKey}` }, timeout: 10000 });
  else if (provider.key === 'smtp') await nodemailer.createTransport({ host: config.host, port: Number(config.port || 587), secure: config.secure === true || String(config.secure) === 'true', auth: { user: config.username, pass: secrets.password }, connectionTimeout: 10000 }).verify();
  else if (provider.key === 'meta-capi') await axios.get(`https://graph.facebook.com/${config.graphVersion || 'v20.0'}/me`, { params: { access_token: secrets.accessToken }, timeout: 10000 });
  else if (provider.key === 'meta-ads') {
    const accountId = String(config.adAccountId || '').replace(/^act_/, '');
    const version = String(config.graphVersion || '');
    if (!/^\d{3,30}$/.test(accountId) || !/^v\d{1,2}\.\d{1,2}$/.test(version)) throw new Error('A numeric Meta ad account ID and explicit Graph API version are required');
    await axios.get(`https://graph.facebook.com/${version}/act_${accountId}`, { params: { fields: 'id,name,currency' }, headers: { Authorization: `Bearer ${secrets.accessToken}` }, timeout: 10000, maxRedirects: 0 });
  }
  else if (provider.key === 'google-ads') await searchGoogleAds({ config, secrets, query: 'SELECT customer.id FROM customer LIMIT 1' });
  else if (provider.key === 'openrouter') await axios.get('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${secrets.apiKey}` }, timeout: 10000 });
  else if (provider.key === 'gemini') await axios.get('https://generativelanguage.googleapis.com/v1beta/models', { params: { key: secrets.apiKey }, timeout: 10000 });
  else if (provider.key === 'anthropic') await axios.get('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': secrets.apiKey, 'anthropic-version': '2023-06-01' }, params: { limit: 1 }, timeout: 10000, maxRedirects: 0 });
  else if (provider.key === 'pexels') await axios.get('https://api.pexels.com/v1/search', { params: { query: 'store', per_page: 1 }, headers: { Authorization: secrets.apiKey }, timeout: 10000 });
  else if (provider.key === 'google-oauth') {
    if (!config.clientId || !secrets.clientSecret) throw new Error('Google OAuth client ID and secret are required');
    return { status: 'configuration_only', message: 'Credentials are present. End-to-end OAuth is verified by completing an authorized sign-in.', mode: 'configuration' };
  }
  else if (provider.key === 'slack') await axios.post(secrets.webhookUrl, { text: 'StoreKit integration health check succeeded.' }, { timeout: 10000, maxRedirects: 0 });
  else if (provider.key === 'twilio') await axios.get(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}.json`, { auth: { username: config.accountSid, password: secrets.authToken }, timeout: 10000 });
  else if (provider.key === 'notification-webhook') {
    if (!/^https:\/\//i.test(config.endpoint) || !secrets.signingSecret) throw new Error('An HTTPS endpoint and signing secret are required');
    return { status: 'configuration_only', message: 'HTTPS endpoint and signing secret are configured. Delivery is verified from Notification Center logs.', mode: 'configuration' };
  }
  else if (provider.key === 'push-gateway') {
    if (!/^https:\/\//i.test(config.endpoint) || !secrets.apiKey) throw new Error('An HTTPS push gateway endpoint and API key are required');
    return { status: 'configuration_only', message: 'Push gateway endpoint and API key are configured. Delivery is verified from Notification Center logs.', mode: 'configuration' };
  }
  return { status: 'healthy', message: `${provider.label} accepted the configured credentials`, mode: 'remote' };
}

function providerErrorMessage(error) {
  const raw = String(error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || 'Provider connection failed');
  return raw
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[REDACTED]')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/([?&](?:key|api_key|access_token|token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/("?(?:x-api-key|apiKey|api_key|accessToken|access_token|authToken|password|clientSecret|client_secret|refreshToken|refresh_token|developerToken|developer_token)"?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]')
    .slice(0, 500);
}

module.exports = { cleanConfig, listIntegrations, providerErrorMessage, publicIntegration, resolvedIntegration, saveIntegration, testProvider };
