'use strict';

const spec = Object.freeze({
  openapi: '3.0.3',
  info: { title: 'StoreKit Platform API', version: '1.1.0' },
  servers: [{ url: '/api/platform/v1' }],
  components: {
    securitySchemes: { bearerApiKey: { type: 'http', scheme: 'bearer', description: 'One-time StoreKit platform API key' } },
    schemas: {
      ApiError: { type: 'object', properties: { message: { type: 'string' }, correlationId: { type: 'string' } } },
      DeploymentEvent: { type: 'object', required: ['provider','externalId','environment','status'], properties: { provider: { type: 'string', maxLength: 40 }, externalId: { type: 'string', maxLength: 160 }, environment: { type: 'string', maxLength: 40 }, service: { type: 'string', maxLength: 100 }, status: { type: 'string', enum: ['queued','building','deploying','ready','failed','cancelled','rolled_back'] }, version: { type: 'string', maxLength: 100 }, commitSha: { type: 'string', pattern: '^[a-fA-F0-9]{7,64}$' }, branch: { type: 'string', maxLength: 160 }, deploymentUrl: { type: 'string', format: 'uri' }, occurredAt: { type: 'string', format: 'date-time' }, message: { type: 'string', maxLength: 500 } } },
    },
  },
  security: [{ bearerApiKey: [] }],
  paths: {
    '/health': { get: { operationId: 'getHealth', summary: 'API health', responses: { 200: { description: 'Healthy' } } } },
    '/tenants': { get: { operationId: 'listTenants', summary: 'Cursor-paginated tenant directory', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }, { name: 'after', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Tenant page' } } } },
    '/analytics/overview': { get: { operationId: 'getAnalyticsOverview', summary: 'Platform analytics overview', responses: { 200: { description: 'Currency-separated subscription analytics' } } } },
    '/deployments': { get: { operationId: 'listDeployments', summary: 'Recent deployment lifecycle records', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } }], responses: { 200: { description: 'Deployment records' } } } },
    '/deployments/events': { post: { operationId: 'recordDeploymentEvent', summary: 'Idempotently record a CI/CD deployment lifecycle event', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DeploymentEvent' } } } }, responses: { 202: { description: 'Deployment event accepted' }, 409: { description: 'Invalid or concurrent lifecycle transition' } } } },
  },
});

module.exports = spec;
