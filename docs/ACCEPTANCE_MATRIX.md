# Acceptance matrix

The automated unit suite covers normalization, city/state resolution, weight fallback/override, status monotonicity, history compaction, encryption/redaction, tenant-keyed token caching, and staging safety. Database/API acceptance cases must run against the isolated staging database:

- Same-tenant duplicate name/SKU returns 409; cross-tenant values remain allowed.
- The Duplicates filter and Featured/On Sale patch operate only with the authenticated tenant ID.
- Marketing analytics aggregate only tenant-scoped, consented customer events.
- Blank Curfox password updates preserve encrypted credentials; responses expose only `hasCredentials`.
- Atomic `CourierSubmission(tenantId, orderId, provider)` uniqueness makes concurrent clicks create at most one provider call.
- Pending submission is rejected; Confirmed/Processing manual submission succeeds; changing to Shipped never submits.
- Scheduler selects only Curfox Shipped/Out for Delivery, non-dry-run, non-terminal orders and uses the integration with the same tenant ID.
- Dry-run follows the guide and never calls Curfox order creation or tracking.

Run `npm test` in `backend`, then run the controlled browser acceptance sequence in [STAGING_AND_CURFOX_TESTING.md](STAGING_AND_CURFOX_TESTING.md).
