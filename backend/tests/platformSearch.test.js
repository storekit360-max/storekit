'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Tenant = require('../models/Tenant');
const Plan = require('../models/Plan');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const RuntimeFeatureFlag = require('../models/RuntimeFeatureFlag');
const AuditEvent = require('../models/AuditEvent');

function queryResult(rows) {
  const chain = { select: () => chain, sort: () => chain, limit: () => chain, maxTimeMS: () => chain, populate: () => chain, lean: async () => rows };
  return chain;
}

test('global search executes only collections authorized by dynamic RBAC', async () => {
  const originals = new Map([[Tenant,Tenant.find],[Plan,Plan.find],[User,User.find],[SupportTicket,SupportTicket.find],[RuntimeFeatureFlag,RuntimeFeatureFlag.find],[AuditEvent,AuditEvent.find]]);
  let tenantFilter; Tenant.find = filter => { tenantFilter = filter; return queryResult([{ _id: '507f1f77bcf86cd799439011', storeName: 'North Star', slug: 'north-star', status: 'active' }]); };
  for (const model of [Plan,User,SupportTicket,RuntimeFeatureFlag,AuditEvent]) model.find = () => { throw new Error('Unauthorized collection queried'); };
  try {
    delete require.cache[require.resolve('../routes/superadmin/search')];
    const router = require('../routes/superadmin/search');
    const handler = router.stack.find(layer => layer.route?.path === '/').route.stack[0].handle;
    const response = { headers: {}, set(key,value){this.headers[key]=value;}, json(value){this.body=value;return this;}, status(code){this.statusCode=code;return this;} };
    await handler({ query: { q: 'North.*' }, platformPermissions: new Set(['tenant.view']) }, response, error => { throw error; });
    assert.equal(response.body.total, 1); assert.equal(response.body.groups[0].type, 'Tenants'); assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(tenantFilter.$or[0].storeName.test('North.*'), true);
    assert.equal(tenantFilter.$or[0].storeName.test('NorthZZ'), false);
  } finally { for (const [model, find] of originals) model.find = find; }
});

test('global search and command UI are bounded, keyboard accessible, and deep linked', () => {
  const route = fs.readFileSync(path.join(__dirname, '../routes/superadmin/search.js'), 'utf8');
  const palette = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/superadmin/CommandPalette.js'), 'utf8');
  const dashboard = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/superadmin/SuperAdminDashboard.js'), 'utf8');
  assert.match(route, /query\.length > 80/); assert.match(route, /platformPermissions\?\.has/); assert.match(route, /\.limit\(8\)/); assert.match(route, /maxTimeMS\(1500\)/); assert.match(route, /Cache-Control.*no-store/);
  assert.match(palette, /role="dialog"/); assert.match(palette, /role="combobox"/); assert.match(palette, /ArrowDown/); assert.match(palette, /AbortController/);
  assert.match(dashboard, /metaKey \|\| event\.ctrlKey/); assert.match(dashboard, /URLSearchParams/); assert.match(dashboard, /Open global search/);
});
