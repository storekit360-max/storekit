'use strict';

const AdmZip = require('adm-zip');
const openapi = require('../config/platformOpenApi');

const jsClient = `export class StoreKitError extends Error {
  constructor(message, { status = 0, correlationId = '', details = null } = {}) { super(message); this.name = 'StoreKitError'; this.status = status; this.correlationId = correlationId; this.details = details; }
}

export class StoreKitClient {
  constructor({ apiKey, baseUrl, timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new TypeError('apiKey is required');
    if (!baseUrl) throw new TypeError('baseUrl is required');
    if (typeof fetchImpl !== 'function') throw new TypeError('A Fetch API implementation is required');
    this.apiKey = apiKey; this.baseUrl = String(baseUrl).replace(/\\/$/, ''); this.timeoutMs = timeoutMs; this.fetch = fetchImpl;
  }
  async request(path, { method = 'GET', query = {}, body } = {}) {
    const url = new URL(this.baseUrl + path); Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value)); });
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const requestId = globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
    try {
      const response = await this.fetch(url, { method, signal: controller.signal, headers: { Accept: 'application/json', Authorization: \`Bearer \${this.apiKey}\`, 'Content-Type': 'application/json', 'X-Request-ID': requestId }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
      if (!response.ok) throw new StoreKitError(data?.message || \`StoreKit API returned \${response.status}\`, { status: response.status, correlationId: response.headers.get('x-request-id') || data?.correlationId || '', details: data });
      return data;
    } catch (error) { if (error.name === 'AbortError') throw new StoreKitError('StoreKit API request timed out'); throw error; }
    finally { clearTimeout(timer); }
  }
  getHealth() { return this.request('/health'); }
  listTenants({ limit = 50, after = '' } = {}) { return this.request('/tenants', { query: { limit, after } }); }
  getAnalyticsOverview() { return this.request('/analytics/overview'); }
  listDeployments({ limit = 50 } = {}) { return this.request('/deployments', { query: { limit } }); }
  recordDeploymentEvent(event) { return this.request('/deployments/events', { method: 'POST', body: event }); }
}
`;

const pythonClient = `import json
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

class StoreKitError(Exception):
    def __init__(self, message, status=0, correlation_id='', details=None):
        super().__init__(message); self.status=status; self.correlation_id=correlation_id; self.details=details

class StoreKitClient:
    def __init__(self, api_key, base_url, timeout=15):
        if not api_key: raise ValueError('api_key is required')
        if not base_url: raise ValueError('base_url is required')
        self.api_key=api_key; self.base_url=base_url.rstrip('/'); self.timeout=timeout

    def request(self, path, method='GET', query=None, body=None):
        query={k:v for k,v in (query or {}).items() if v is not None and v != ''}
        url=self.base_url+path+('?' + urlencode(query) if query else '')
        payload=None if body is None else json.dumps(body).encode('utf-8')
        request=Request(url, data=payload, method=method, headers={'Accept':'application/json','Authorization':'Bearer '+self.api_key,'Content-Type':'application/json','X-Request-ID':str(uuid.uuid4())})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw=response.read().decode('utf-8'); return json.loads(raw) if raw else None
        except HTTPError as error:
            raw=error.read().decode('utf-8');
            try: details=json.loads(raw) if raw else {}
            except json.JSONDecodeError: details={'message':raw}
            raise StoreKitError(details.get('message') or 'StoreKit API request failed', error.code, error.headers.get('x-request-id','') or details.get('correlationId',''), details) from error
        except URLError as error: raise StoreKitError('StoreKit API connection failed: '+str(error.reason)) from error

    def get_health(self): return self.request('/health')
    def list_tenants(self, limit=50, after=''): return self.request('/tenants', query={'limit':limit,'after':after})
    def get_analytics_overview(self): return self.request('/analytics/overview')
    def list_deployments(self, limit=50): return self.request('/deployments', query={'limit':limit})
    def record_deployment_event(self, event): return self.request('/deployments/events', method='POST', body=event)
`;

function javascriptFiles() {
  return {
    'package.json': JSON.stringify({ name: '@storekit/platform-sdk', version: openapi.info.version, type: 'module', main: './src/index.js', exports: './src/index.js', engines: { node: '>=18' } }, null, 2) + '\n',
    'README.md': `# StoreKit Platform SDK (JavaScript)\n\nRequires Node.js 18+ or a modern browser.\n\n\`\`\`js\nimport { StoreKitClient } from './src/index.js';\nconst client = new StoreKitClient({ apiKey: process.env.STOREKIT_API_KEY, baseUrl: process.env.STOREKIT_API_URL });\nconsole.log(await client.getHealth());\n\`\`\`\n\nUse an API URL ending in \`/api/platform/v1\`. Never commit API keys.\n`,
    'src/index.js': jsClient,
    'openapi.json': JSON.stringify(openapi, null, 2) + '\n',
  };
}

function pythonFiles() {
  return {
    'pyproject.toml': `[project]\nname = "storekit-platform-sdk"\nversion = "${openapi.info.version}"\nrequires-python = ">=3.9"\ndependencies = []\n`,
    'README.md': `# StoreKit Platform SDK (Python)\n\n\`\`\`python\nimport os\nfrom storekit_sdk import StoreKitClient\nclient = StoreKitClient(os.environ["STOREKIT_API_KEY"], os.environ["STOREKIT_API_URL"])\nprint(client.get_health())\n\`\`\`\n\nUse an API URL ending in \`/api/platform/v1\`. Never commit API keys.\n`,
    'storekit_sdk/__init__.py': 'from .client import StoreKitClient, StoreKitError\n\n__all__ = ["StoreKitClient", "StoreKitError"]\n',
    'storekit_sdk/client.py': pythonClient,
    'openapi.json': JSON.stringify(openapi, null, 2) + '\n',
  };
}

function filesFor(language) {
  if (language === 'javascript') return javascriptFiles();
  if (language === 'python') return pythonFiles();
  throw Object.assign(new Error('Supported SDK languages are javascript and python'), { statusCode: 400 });
}

function buildArchive(language) {
  const zip = new AdmZip();
  for (const [name, contents] of Object.entries(filesFor(language))) zip.addFile(name, Buffer.from(contents, 'utf8'));
  return zip.toBuffer();
}

module.exports = { buildArchive, filesFor };
