# StoreKit SaaS Multi-Tenant Ecommerce

StoreKit is a multi-tenant ecommerce SaaS project for selling ecommerce stores to customers under their own domains.

## Local run

### Backend

```bash
cd backend
cp .env.example .env
npm install
npm run seed
npm run dev
```

Backend default: `http://localhost:5001`

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm start
```

Frontend default: `http://localhost:3000`

## Default logins

### Super Admin

URL:

```txt
http://localhost:3000/superadmin/login
```

Credentials:

```txt
Email: superadmin@storekit.local
Password: SuperAdmin@123456
```

### Demo Store Admin

URL:

```txt
http://localhost:3000/login
```

Credentials:

```txt
Email: admin@storekit.local
Password: Admin@123456
```

After login, open:

```txt
http://localhost:3000/admin
```

## SaaS flow

1. Login as Super Admin.
2. Create or edit plans.
3. Enable/disable features in each plan.
4. Create tenant/customer store.
5. Assign plan to tenant.
6. Add customer domain, for example `sport.lk`.
7. Customer points domain to Vercel.
8. StoreKit detects the tenant using the request domain and loads the matching store.

## Deployment

### Railway backend

Set backend environment variables:

```env
MONGODB_URI=your_mongodb_atlas_connection
JWT_SECRET=change_this_secret
EXTRA_ORIGINS=https://your-vercel-domain.vercel.app,https://customer-domain.lk
```

Deploy backend folder to Railway.

### Vercel frontend

Set frontend environment variable:

```env
REACT_APP_API_URL=https://your-railway-backend.up.railway.app/api
```

Deploy frontend folder to Vercel.

For each customer domain, add the domain in Vercel and add it in StoreKit Super Admin domain mapping.
