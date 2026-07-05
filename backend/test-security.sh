#!/bin/bash
BASE="http://localhost:5001"
echo "=== 1. Checking security headers ==="
curl -sI $BASE/api/health | grep -E "x-frame|x-content|content-security|strict-transport"

echo ""
echo "=== 2. Testing MongoDB injection ==="
curl -s -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":{"$gt":""},"password":{"$gt":""}}' | python3 -m json.tool

echo ""
echo "=== 3. Testing rate limit (login) ==="
for i in {1..11}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}')
  echo "  Attempt $i: HTTP $CODE"
done

echo ""
echo "=== Done — check server console for [SECURITY] warnings ==="