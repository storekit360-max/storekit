'use strict';

const definitions = [
  { key: 'platform.health.read', description: 'Read API and dependency health metadata.' },
  { key: 'tenants.read', description: 'Read bounded tenant directory records.' },
  { key: 'analytics.read', description: 'Read platform analytics aggregates.' },
  { key: 'webhooks.read', description: 'Read webhook delivery status and metadata.' },
  { key: 'deployments.read', description: 'Read bounded deployment lifecycle records.' },
  { key: 'deployments.write', description: 'Record validated CI/CD deployment lifecycle events.' },
];
const keys = definitions.map(item => item.key);
module.exports = { definitions, keys };
