'use strict';

const axios = require('axios');
const AcquisitionCost = require('../models/AcquisitionCost');
const PlatformIntegration = require('../models/PlatformIntegration');
const { providerErrorMessage, resolvedIntegration } = require('./platformIntegrationService');
const { searchGoogleAds, validateGoogleAdsConfig } = require('./googleAdsClient');

const MAX_PAGES = 20;
const PAGE_LIMIT = 500;

function boundedDays(value) { return Math.min(Math.max(Number.parseInt(value, 10) || 7, 1), 90); }
function dateKey(value) { return new Date(value).toISOString().slice(0, 10); }

function validateMetaAdsConfig(config = {}) {
  const accountId = String(config.adAccountId || '').trim().replace(/^act_/, '');
  const graphVersion = String(config.graphVersion || '').trim();
  if (!/^\d{3,30}$/.test(accountId)) throw Object.assign(new Error('Meta Ads requires a numeric ad account ID'), { statusCode: 400 });
  if (!/^v\d{1,2}\.\d{1,2}$/.test(graphVersion)) throw Object.assign(new Error('Meta Ads requires an explicit Graph API version such as vXX.X'), { statusCode: 400 });
  return { accountId, graphVersion };
}

function normalizeInsight(row, { accountId, currency, actorId }) {
  const incurredAt = new Date(`${String(row?.date_start || '')}T00:00:00.000Z`);
  const amount = Number(row?.spend);
  const campaignId = String(row?.campaign_id || '').trim();
  if (Number.isNaN(incurredAt.getTime()) || !Number.isFinite(amount) || amount <= 0 || !/^\d{1,40}$/.test(campaignId)) return null;
  return {
    incurredAt,
    source: 'Meta Ads',
    campaign: String(row.campaign_name || `Campaign ${campaignId}`).trim().slice(0, 160),
    amount: Math.round((amount + Number.EPSILON) * 100) / 100,
    currency,
    notes: `Synchronized daily campaign spend from Meta ad account ${accountId}.`,
    externalReference: `meta-ads:${accountId}:${campaignId}:${dateKey(incurredAt)}`,
    createdBy: actorId,
  };
}

async function fetchMetaAdsInsights({ accountId, graphVersion, accessToken, from, to }) {
  const baseUrl = `https://graph.facebook.com/${graphVersion}/act_${accountId}`;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const accountResponse = await axios.get(baseUrl, { params: { fields: 'id,name,currency' }, headers, timeout: 15000, maxRedirects: 0 });
  const currency = String(accountResponse.data?.currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Meta Ads account did not return a valid three-letter currency');
  const rows = []; let after = '';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await axios.get(`${baseUrl}/insights`, { params: {
      fields: 'spend,date_start,date_stop,campaign_id,campaign_name', level: 'campaign', time_increment: 1,
      time_range: JSON.stringify({ since: dateKey(from), until: dateKey(to) }), limit: PAGE_LIMIT, ...(after ? { after } : {}),
    }, headers, timeout: 20000, maxRedirects: 0 });
    rows.push(...(Array.isArray(response.data?.data) ? response.data.data : []));
    const next = String(response.data?.paging?.cursors?.after || '');
    if (!response.data?.paging?.next || !next) break;
    if (next.length > 500) throw new Error('Meta Ads pagination cursor exceeded the safe limit');
    after = next;
    if (page === MAX_PAGES - 1) throw new Error('Meta Ads result exceeded the 10,000-row synchronization limit');
  }
  return { currency, rows };
}

async function updateSyncState(provider, status, fields = {}) {
  await PlatformIntegration.updateOne({ provider }, { $set: { 'lastSync.status': status, ...Object.fromEntries(Object.entries(fields).map(([key, value]) => [`lastSync.${key}`, value])) } });
}

async function syncMetaAdsSpend({ actorId, days = 7 } = {}) {
  if (!actorId) throw Object.assign(new Error('An attributable platform operator is required for acquisition synchronization'), { statusCode: 409 });
  const resolved = await resolvedIntegration('meta-ads');
  if (!resolved.enabled) throw Object.assign(new Error('Meta Ads integration is disabled'), { statusCode: 409 });
  if (!resolved.secrets.accessToken) throw Object.assign(new Error('Meta Ads access token is not configured'), { statusCode: 409 });
  const config = validateMetaAdsConfig(resolved.config);
  const bounded = boundedDays(days); const to = new Date(); const from = new Date(to.getTime() - (bounded - 1) * 86400000);
  await updateSyncState('meta-ads', 'running', { startedAt: new Date(), completedAt: null, message: '', stats: {} });
  try {
    const result = await fetchMetaAdsInsights({ ...config, accessToken: resolved.secrets.accessToken, from, to });
    const normalized = result.rows.map(row => normalizeInsight(row, { accountId: config.accountId, currency: result.currency, actorId })).filter(Boolean);
    const records = Array.from(new Map(normalized.map(record => [record.externalReference, record])).values());
    const operations = records.map(record => ({ updateOne: {
      filter: { externalReference: record.externalReference },
      update: { $set: { incurredAt: record.incurredAt, source: record.source, campaign: record.campaign, amount: record.amount, currency: record.currency, notes: record.notes }, $setOnInsert: { externalReference: record.externalReference, createdBy: record.createdBy } },
      upsert: true,
    } }));
    const write = operations.length ? await AcquisitionCost.bulkWrite(operations, { ordered: false }) : null;
    const stats = { providerRows: result.rows.length, eligibleRows: records.length, duplicateRows: normalized.length - records.length, upserted: Number(write?.upsertedCount || 0), matched: Number(write?.matchedCount || 0), modified: Number(write?.modifiedCount || 0), currency: result.currency, from: dateKey(from), to: dateKey(to) };
    await updateSyncState('meta-ads', 'succeeded', { completedAt: new Date(), nextEligibleAt: new Date(Date.now() + 6 * 60 * 60 * 1000), message: `${records.length} daily campaign spend rows reconciled`, stats });
    return { processed: records.length, failed: result.rows.length - records.length, ...stats };
  } catch (error) {
    await updateSyncState('meta-ads', 'failed', { completedAt: new Date(), nextEligibleAt: new Date(Date.now() + 60 * 60 * 1000), message: providerErrorMessage(error), stats: {} }).catch(() => {});
    throw error;
  }
}

function normalizeGoogleAdsInsight(row, { customerId, actorId }) {
  const incurredAt = new Date(`${String(row?.segments?.date || '')}T00:00:00.000Z`);
  const micros = Number(row?.metrics?.costMicros);
  const campaignId = String(row?.campaign?.id || '').trim();
  const currency = String(row?.customer?.currencyCode || '').trim().toUpperCase();
  if (Number.isNaN(incurredAt.getTime()) || !Number.isSafeInteger(micros) || micros <= 0 || !/^\d{1,40}$/.test(campaignId) || !/^[A-Z]{3}$/.test(currency)) return null;
  return {
    incurredAt,
    source: 'Google Ads',
    campaign: String(row?.campaign?.name || `Campaign ${campaignId}`).trim().slice(0, 160),
    amount: Math.round((micros / 1000000 + Number.EPSILON) * 100) / 100,
    currency,
    notes: `Synchronized daily campaign spend from Google Ads customer ${customerId}.`,
    externalReference: `google-ads:${customerId}:${campaignId}:${dateKey(incurredAt)}`,
    createdBy: actorId,
  };
}

async function fetchGoogleAdsInsights({ config, secrets, from, to }) {
  const query = `SELECT customer.currency_code, campaign.id, campaign.name, segments.date, metrics.cost_micros FROM campaign WHERE segments.date BETWEEN '${dateKey(from)}' AND '${dateKey(to)}' AND metrics.cost_micros > 0`;
  return searchGoogleAds({ config, secrets, query });
}

async function syncGoogleAdsSpend({ actorId, days = 7 } = {}) {
  if (!actorId) throw Object.assign(new Error('An attributable platform operator is required for acquisition synchronization'), { statusCode: 409 });
  const resolved = await resolvedIntegration('google-ads');
  if (!resolved.enabled) throw Object.assign(new Error('Google Ads integration is disabled'), { statusCode: 409 });
  const config = validateGoogleAdsConfig(resolved.config);
  for (const field of ['clientSecret', 'refreshToken', 'developerToken']) if (!resolved.secrets[field]) throw Object.assign(new Error(`Google Ads ${field} is not configured`), { statusCode: 409 });
  const bounded = boundedDays(days); const to = new Date(); const from = new Date(to.getTime() - (bounded - 1) * 86400000);
  await updateSyncState('google-ads', 'running', { startedAt: new Date(), completedAt: null, message: '', stats: {} });
  try {
    const result = await fetchGoogleAdsInsights({ config, secrets: resolved.secrets, from, to });
    const normalized = result.results.map(row => normalizeGoogleAdsInsight(row, { customerId: config.customerId, actorId })).filter(Boolean);
    const records = Array.from(new Map(normalized.map(record => [record.externalReference, record])).values());
    const operations = records.map(record => ({ updateOne: {
      filter: { externalReference: record.externalReference },
      update: { $set: { incurredAt: record.incurredAt, source: record.source, campaign: record.campaign, amount: record.amount, currency: record.currency, notes: record.notes }, $setOnInsert: { externalReference: record.externalReference, createdBy: record.createdBy } },
      upsert: true,
    } }));
    const write = operations.length ? await AcquisitionCost.bulkWrite(operations, { ordered: false }) : null;
    const currencies = Array.from(new Set(records.map(record => record.currency)));
    const stats = { providerRows: result.results.length, eligibleRows: records.length, duplicateRows: normalized.length - records.length, upserted: Number(write?.upsertedCount || 0), matched: Number(write?.matchedCount || 0), modified: Number(write?.modifiedCount || 0), currencies, from: dateKey(from), to: dateKey(to) };
    await updateSyncState('google-ads', 'succeeded', { completedAt: new Date(), nextEligibleAt: new Date(Date.now() + 6 * 60 * 60 * 1000), message: `${records.length} daily campaign spend rows reconciled`, stats });
    return { processed: records.length, failed: result.results.length - records.length, ...stats };
  } catch (error) {
    await updateSyncState('google-ads', 'failed', { completedAt: new Date(), nextEligibleAt: new Date(Date.now() + 60 * 60 * 1000), message: providerErrorMessage(error), stats: {} }).catch(() => {});
    throw error;
  }
}

async function acquisitionSyncStatus() {
  const integration = await PlatformIntegration.findOne({ provider: 'meta-ads' }).select('enabled configuredSecretFields config lastTest lastSync updatedBy').lean();
  const accountId = String(integration?.config?.adAccountId || process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
  const configured = Boolean(integration?.configuredSecretFields?.includes('accessToken') || process.env.META_ADS_ACCESS_TOKEN);
  return {
    provider: 'meta-ads', configured,
    enabled: integration ? Boolean(integration.enabled) : Boolean(configured && accountId && process.env.META_ADS_GRAPH_VERSION), config: { adAccountId: accountId ? `…${accountId.slice(-4)}` : '', graphVersion: integration?.config?.graphVersion || process.env.META_ADS_GRAPH_VERSION || '' },
    lastTest: integration?.lastTest || { status: 'never' }, lastSync: integration?.lastSync || { status: 'never' }, schedulerAttributable: Boolean(integration?.updatedBy),
  };
}

async function googleAdsSyncStatus() {
  const integration = await PlatformIntegration.findOne({ provider: 'google-ads' }).select('enabled configuredSecretFields config lastTest lastSync updatedBy').lean();
  const customerId = String(integration?.config?.customerId || process.env.GOOGLE_ADS_CUSTOMER_ID || '').replaceAll('-', '');
  const required = ['clientSecret', 'refreshToken', 'developerToken'];
  const configured = required.every(field => integration?.configuredSecretFields?.includes(field) || process.env[{ clientSecret: 'GOOGLE_ADS_CLIENT_SECRET', refreshToken: 'GOOGLE_ADS_REFRESH_TOKEN', developerToken: 'GOOGLE_ADS_DEVELOPER_TOKEN' }[field]]);
  return {
    provider: 'google-ads', configured,
    enabled: integration ? Boolean(integration.enabled) : Boolean(configured && customerId && process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_API_VERSION),
    config: { customerId: customerId ? `…${customerId.slice(-4)}` : '', apiVersion: integration?.config?.apiVersion || process.env.GOOGLE_ADS_API_VERSION || '', managerAccount: Boolean(integration?.config?.loginCustomerId || process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) },
    lastTest: integration?.lastTest || { status: 'never' }, lastSync: integration?.lastSync || { status: 'never' }, schedulerAttributable: Boolean(integration?.updatedBy),
  };
}

module.exports = { MAX_PAGES, PAGE_LIMIT, acquisitionSyncStatus, boundedDays, fetchGoogleAdsInsights, fetchMetaAdsInsights, googleAdsSyncStatus, normalizeGoogleAdsInsight, normalizeInsight, syncGoogleAdsSpend, syncMetaAdsSpend, validateGoogleAdsConfig, validateMetaAdsConfig };
