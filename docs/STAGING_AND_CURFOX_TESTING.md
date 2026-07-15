# Isolated staging and Curfox testing

## Local setup

Copy `backend/.env.staging.example` to `backend/.env.staging` and replace the placeholder secrets. The real `.env.staging` is ignored by Git. `APP_ENV=staging` makes the backend refuse to start unless the MongoDB database name contains `staging`, `stage`, `test`, or `local`.

With a local MongoDB binary:

```bash
mongod --dbpath /path/to/a/local/data-directory
cd backend
npm run seed:staging
npm run staging
```

In another terminal:

```bash
cd frontend
npm run start:staging
```

The frontend runs on port 3001 and points explicitly to the staging backend on port 5002.

With Docker instead of local `mongod`:

```bash
docker run --name shopzen-staging-mongo -p 27017:27017 -v shopzen-staging-data:/data/db -d mongo:7
```

Email, payment, Meta, WhatsApp, marketing sending, and unrelated integrations are disabled by default in the example. Do not copy production credentials into staging.

## Safe migration/backfill

`npm run migrate:tenant-data` is report-only. It calculates normalized product fields, identifies legacy duplicates, reports tenant-less records, defaults missing order delivery services, and detects consecutive duplicate history rows. It does not delete, merge, or assign orphan data.

After reviewing the report and taking a database backup, run `npm run migrate:tenant-data -- --apply`. Unique eligibility is enabled only for name/SKU combinations that are already unique within their tenant. Resolve reported legacy duplicates in Admin → Products → Duplicates; then rerun the migration.

## Dry-run acceptance test

Keep `CURFOX_DRY_RUN=true`.

1. Configure Curfox under Admin → Settings → Delivery and use **Test Connection & Load Businesses**.
2. Enable Curfox and place a customer order selecting Royal Express / Curfox.
3. Change Pending → Confirmed, then Confirmed → Processing.
4. Verify canonical destination city/state and weight on the order.
5. Click **Send Order to Curfox** once. A yellow `DRYRUN-...` reference appears; no create-order request is sent to Curfox.
6. Mark the local order Shipped. Dry-run tracking remains disabled.

## One controlled live test

A live test creates real Royal Express data. Use only the isolated staging database and an authorized courier account.

1. Set `CURFOX_DRY_RUN=false` in `backend/.env.staging` and restart the staging backend.
2. Create a new staging order and submit it once after Confirmed/Processing.
3. Verify the generated waybill in Royal Express.
4. After physical collection, mark the local order Shipped and verify manual/automatic tracking synchronization.
5. Restore `CURFOX_DRY_RUN=true` and restart the backend.

Never use a production seed from staging and never point staging at a production-looking database name.
