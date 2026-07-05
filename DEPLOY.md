# StoreKit — Multi-Tenant Deployment & Domain Mapping Guide

## Architecture

```
Customer / Googlebot visits computers.lk
  │
  ▼
Vercel Edge Middleware (frontend/middleware.js)
  ├── Calls Railway: GET /api/superadmin/resolve-domain?domain=computers.lk
  ├── Bots: proxy to Railway with X-Tenant-Domain header
  └── Users: serve static SPA shell from Vercel CDN (zero Railway cost)
  │
  ▼ (bots + sitemap/robots only)
Railway Backend (Node.js)
  ├── Reads X-Tenant-Domain header
  ├── Resolves tenant from MongoDB
  ├── Scopes all DB queries to that tenantId
  └── Injects per-tenant meta tags, JSON-LD, sitemap into HTML
  │
  ▼
MongoDB Atlas (tenant config, products, SEO settings)
```

---

## Part 1: First-Time Deployment

### Step 1: MongoDB Atlas

1. [mongodb.com/atlas](https://mongodb.com/atlas) → Create free cluster
2. Database Access → Add user → username + password
3. Network Access → Add IP → `0.0.0.0/0`
4. Connect → Drivers → copy `mongodb+srv://...` string
5. Replace `<password>` in the connection string

### Step 2: Railway (Backend)

1. [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Root Directory: `backend`
3. Add environment variables:

```
NODE_ENV=production
PORT=5001
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/storekit
JWT_SECRET=<openssl rand -hex 32>
INTERNAL_SECRET=<openssl rand -hex 32>   # CRITICAL — must match Vercel
BACKEND_URL=https://your-app.up.railway.app
FRONTEND_URL=https://your-app.vercel.app
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SHOP_NAME=StoreKit
```

4. Deploy → copy the Railway URL

### Step 3: Vercel (Frontend)

1. [vercel.com](https://vercel.com) → New Project → import GitHub repo
2. Root Directory: `frontend`
3. Build Command: `npm run build`
4. Output Directory: `build`
5. Add environment variables:

```
RAILWAY_BACKEND_URL=https://your-app.up.railway.app
INTERNAL_SECRET=<same value as backend INTERNAL_SECRET>   # MUST MATCH
```

6. Deploy → copy the Vercel URL

### Step 4: Update vercel.json

Edit `frontend/vercel.json` — replace the Railway URL placeholder:

```json
"destination": "https://your-app.up.railway.app/api/:path*"
```

Commit and redeploy Vercel.

### Step 5: Update Backend FRONTEND_URL

In Railway Variables, update:
```
FRONTEND_URL=https://your-app.vercel.app
```

### Step 6: Seed superadmin

```bash
cd backend && npm install
node seed.js
```

### Step 7: Verify

```bash
# Health
curl https://your-app.up.railway.app/api/health

# Resolve-domain (returns 401 without secret — that is correct)
curl https://your-app.up.railway.app/api/superadmin/resolve-domain?domain=test.lk

# Resolve-domain with secret
curl "https://your-app.up.railway.app/api/superadmin/resolve-domain?domain=test.lk" \
     -H "x-internal-secret: your_internal_secret"
```

---

## Part 2: Create a Tenant and Map a Domain

### Step 1: Create a Plan

1. Go to `https://your-app.vercel.app/superadmin/login`
2. SuperAdmin Dashboard → Plans tab → Add Plan
3. Name: `Starter`, Price: `0`, enable features → Create Plan

### Step 2: Create a Tenant

1. Tenants tab → Create Tenant
2. Fill in:
   - **Store Name**: `Computers LK`
   - **Slug**: `computers-lk`
   - **Domain**: `computers.lk` (no https://, no www)
   - **Plan**: select Starter
   - **Admin Email**: `admin@computers.lk`
   - **Admin Password**: secure password
3. Click Create Tenant

### Step 3: Map Domain on Vercel

1. Vercel Dashboard → your project → Settings → Domains
2. Add Domain → type `computers.lk` → Add
3. Vercel shows DNS records:
   - **Root domain** (`computers.lk`): add `A` record → `76.76.21.21`
   - **www** (`www.computers.lk`): add `CNAME` record → `cname.vercel-dns.com`
4. Add these at your domain registrar (GoDaddy, Namecheap, etc.)
5. Wait 5–60 min for DNS propagation

### Step 4: Verify

```bash
# DNS propagated?
dig computers.lk A
# Should show 76.76.21.21

# Tenant resolved?
curl "https://your-backend.up.railway.app/api/superadmin/resolve-domain?domain=computers.lk" \
     -H "x-internal-secret: your_secret"
# Expected: {"found":true,"domain":"computers.lk","storeName":"Computers LK",...}

# Googlebot gets per-tenant HTML?
curl -A "Googlebot/2.1" https://computers.lk/ | grep -E "<title>|og:title"
# Expected: <title>Computers LK — Online Store</title>

# Sitemap is per-tenant?
curl https://computers.lk/sitemap.xml | grep loc
# Expected: URLs containing computers.lk
```

### Step 5: Submit to Google Search Console

1. [search.google.com/search-console](https://search.google.com/search-console)
2. Add property → URL prefix → `https://computers.lk`
3. Verify ownership (HTML tag → add in Admin → SEO → Head Tags)
4. Sitemaps → Submit → `https://computers.lk/sitemap.xml`
5. Request indexing for `https://computers.lk/`

---

## Part 3: Local Development

```bash
# Backend
cd backend
cp .env.example .env  # fill in values
npm install && npm run dev   # port 5001

# Frontend
cd frontend
# Create .env.local:
echo "REACT_APP_API_URL=http://localhost:5001/api" > .env.local
npm install && npm start      # port 3000
```

Local multi-tenant testing:
```bash
# /etc/hosts
echo "127.0.0.1  computers.lk.local" | sudo tee -a /etc/hosts

# Create tenant with domain "computers.lk.local" in superadmin dashboard
# Visit http://computers.lk.local:3000
```

---

## Part 4: Troubleshooting

### CORS errors

Symptom: `Access to XMLHttpRequest blocked by CORS policy`

1. Verify the tenant record has the correct domain (no https://, no www, no slash)
2. CORS cache refreshes every 5 min. Wait or restart Railway to force refresh.
3. Check Railway logs: `[CORS] Refreshed: N tenant origin(s)` should appear on startup.

### resolve-domain returns `{ found: false }`

1. Domain in DB is case-sensitive — must be lowercase
2. Tenant status must be `active`
3. Domain `active` field must be `true` in the domains array
4. INTERNAL_SECRET in Vercel must exactly match Railway INTERNAL_SECRET

### SSR not working (Googlebot sees generic meta tags)

1. Verify `RAILWAY_BACKEND_URL` is set in Vercel environment variables
2. Verify `INTERNAL_SECRET` matches in both Vercel and Railway
3. Verify `middleware.js` is in `frontend/` root (not in `src/`)
4. Test: `curl -A "Googlebot/2.1" https://computers.lk/` — should show tenant title

### Tenant admin can't log in

SuperAdmin Dashboard → Tenants → find tenant → Reset Admin Password

---

## Part 5: Environment Variables Reference

### Railway (Backend)

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | YES | MongoDB Atlas connection string |
| `JWT_SECRET` | YES | Min 32 chars random |
| `INTERNAL_SECRET` | YES | Must match Vercel INTERNAL_SECRET |
| `BACKEND_URL` | YES | Railway URL, no trailing slash |
| `FRONTEND_URL` | YES | Main Vercel URL |
| `CLOUDINARY_CLOUD_NAME` | YES | |
| `CLOUDINARY_API_KEY` | YES | |
| `CLOUDINARY_API_SECRET` | YES | |
| `NODE_ENV` | YES | `production` |

### Vercel (Frontend + Edge Middleware)

| Variable | Required | Notes |
|---|---|---|
| `RAILWAY_BACKEND_URL` | YES | Railway URL for edge middleware |
| `INTERNAL_SECRET` | YES | Must match backend INTERNAL_SECRET |
| `REACT_APP_API_URL` | dev only | `http://localhost:5001/api` |
