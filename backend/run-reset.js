const http = require('http');

function request(path, method = 'GET', body = null, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5001,
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'X-Confirm-Reset': 'RESET-SALES-DATA',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Server returned: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY5ZDFkNzg2M2QzZTkwOTk5NmI4NTIwOSIsImlhdCI6MTc4MjU2NzQwNywiZXhwIjoxNzg1MTU5NDA3fQ.1jFC0aZkIeOy2-pheym7Z-Ct2HdhpxPekOjVCN8c48E';

  console.log('📦 Fetching products...');
  const prodData = await request('/api/products/admin/all?limit=200', 'GET', null, token);
  const products = prodData.products || [];
  console.log(`Found ${products.length} products — all will be set to stock: 5`);

  const stockOverrides = {};
  products.forEach(p => { stockOverrides[p._id] = 5; });

  console.log('🔄 Running reset...');
  const data = await request('/api/admin/reset/execute', 'POST', { stockOverrides }, token);

  if (data.success) {
    console.log('✅ RESET COMPLETE — store ready for go-live');
    console.table(data.results);
  } else {
    console.error('❌ Failed:', data.message);
  }
})();