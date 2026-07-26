'use strict';

const axios = require('axios');

function config() {
  return {
    token: process.env.VERCEL_TOKEN || '',
    project: process.env.VERCEL_PROJECT_ID || process.env.VERCEL_PROJECT || '',
    team: process.env.VERCEL_TEAM_ID || '',
  };
}

async function addDomain(domain) {
  const settings = config();
  if (!settings.token || !settings.project) {
    return { ok: false, configured: false, message: 'Vercel domain automation is not configured (set VERCEL_TOKEN and VERCEL_PROJECT_ID)' };
  }
  const params = settings.team ? { teamId: settings.team } : undefined;
  try {
    await axios.post(`https://api.vercel.com/v10/projects/${encodeURIComponent(settings.project)}/domains`, { name: domain }, {
      params,
      headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    return { ok: true, domain };
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    // Vercel returns a conflict when the domain is already attached. That is
    // safe for tenant creation and should be treated as success.
    if (status === 409 || /already assigned|already exists|domain is already/i.test(message)) return { ok: true, domain, alreadyConnected: true };
    return { ok: false, configured: true, domain, message: `Vercel could not connect ${domain}: ${message}` };
  }
}

async function connectTenantDomains(domain) {
  const base = String(domain || '').trim().toLowerCase().replace(/^www\./, '');
  if (!base) return { connected: [], warnings: [] };
  const results = await Promise.all([addDomain(base), addDomain(`www.${base}`)]);
  return {
    connected: results.filter(result => result.ok).map(result => result.domain),
    warnings: results.filter(result => !result.ok).map(result => result.message),
  };
}

module.exports = { connectTenantDomains };
