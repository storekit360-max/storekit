# StoreKit Super Admin Implementation Log

## Increment 1 — Control-center foundation

Status: implemented and backend-tested on 2026-07-18.

### Summary

Established the shared request, audit, and authorization foundations required by all enterprise Super Admin modules. Existing Super Admin access remains backward compatible while explicit platform roles are introduced.

### Files added

- `backend/config/platformPermissions.js`
- `backend/models/AuditEvent.js`
- `backend/models/PlatformPermission.js`
- `backend/models/PlatformRole.js`
- `backend/middleware/requestContext.js`
- `backend/middleware/platformAudit.js`
- `backend/services/platformAuthorizationService.js`
- `backend/tests/platformFoundation.test.js`
- `backend/tests/platformPermissions.test.js`
- `docs/SUPER_ADMIN_PHASE_1_AUDIT.md`
- `docs/SUPER_ADMIN_IMPLEMENTATION_LOG.md`

### Files modified

- `backend/server.js`
- `backend/models/User.js`
- `backend/routes/superadmin.js`

### Database changes

- New `auditevents`, `platformpermissions`, and `platformroles` collections are created by Mongoose when first used.
- `User.platformRoleIds` is additive and optional; existing users require no immediate data migration.
- No existing field or collection was removed.

### API changes

- All responses receive `X-Request-ID`.
- Mutating `/api/superadmin/*` calls create persistent redacted audit events.
- Added `GET /api/superadmin/permissions`.
- Added `GET /api/superadmin/roles`.
- Added `POST /api/superadmin/roles`.
- Added `PUT /api/superadmin/roles/:id`.

### Permissions added

Central permission groups now cover platform, tenant, billing, analytics, users, roles, security, feature flags, support, audit, monitoring, notifications, infrastructure, developer tools, and settings. Permission keys are synchronized to MongoDB and role payloads reject unknown keys.

### Compatibility and migration

Existing active users with `role=superadmin` and no explicit `platformRoleIds` retain all registered permissions. After operators are assigned explicit roles, production can set `REQUIRE_EXPLICIT_PLATFORM_ROLE=true` to remove that compatibility fallback. This switch must only occur after an access verification report confirms at least two active owner accounts.

### Security behavior

Audit values redact password, token, secret, credential, cookie, authorization, and API-key fields recursively. Audit persistence failures are reported with only correlation ID and error message and do not expose request payloads or interrupt customer traffic.

### Testing

- Backend: 76 tests passed, 0 failed.
- Super Admin route module load check passed.
- Frontend changes: none in this increment; production build validation remains required when the modular shell is introduced.

### Next increment

Apply permission policies to every existing Super Admin operation; add paginated audit search/export; add role assignment and platform-user management; then introduce the nested Super Admin application shell and permission matrix UI.

## Increment 2 — Enforced access control and audit operations

Status: implemented and validated on 2026-07-18.

### Summary

Applied explicit permission middleware to every existing Super Admin endpoint and delivered modular access-management and audit APIs. Added deep-linkable Access Control and Audit Trail UI modules, including permission-filtered navigation for scoped platform operators.

### Files added

- `backend/routes/superadmin/access.js`
- `backend/routes/superadmin/audit.js`
- `backend/tests/superadminAccessAudit.test.js`
- `frontend/src/pages/superadmin/SuperAdminAccessControl.js`
- `frontend/src/pages/superadmin/SuperAdminAudit.js`

### Files modified

- `backend/routes/superadmin.js`
- `backend/middleware/platformAudit.js`
- `frontend/src/App.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### API changes

- Added cursor-paginated `GET /api/superadmin/audit` with actor, tenant, date, outcome, action, resource, resource ID, and text filters.
- Added `GET /api/superadmin/audit/facets`.
- Added bounded `GET /api/superadmin/audit/export.csv` (maximum 10,000 rows per export).
- Added paginated `GET /api/superadmin/access/users`.
- Added `GET /api/superadmin/access/me` for permission-aware UI navigation.
- Added role assignment, operator suspension, and reactivation operations.
- Every legacy Super Admin route now declares a `group.action` permission.

### UI changes

- `/superadmin/access`: role list/editor, grouped permission matrix, operator search, and multi-role assignment.
- `/superadmin/audit`: server-side filtering, facets, outcome and latency visibility, correlation IDs, cursor pagination, and CSV export.
- Super Admin paths now support `/superadmin/*` deep links.
- Navigation is filtered using effective server-resolved permissions.
- Existing aggregate dashboard requests tolerate authorization-denied modules so scoped operators can use their permitted pages.

### Security and performance

- Audit search validates dates and MongoDB identifiers and escapes regular-expression input.
- CSV values are quoted and escaped.
- Audit export is bounded.
- Role assignments accept only active known roles and prevent an operator from removing their own final role.
- Operators cannot suspend themselves.
- Tenant/user queries are paginated and exclude password/lockout data.

### Validation

- Backend: 80 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Static coverage verifies every legacy Super Admin endpoint declares a permission policy.

### Next increment

Build the routed tenant workspace with server-side search/pagination, tenant summary, billing/usage/activity tabs, tags and internal notes, health/risk scoring, and safe lifecycle operations. Replace estimated storage with recorded usage data as metering is introduced.

## Increment 3 — Enterprise tenant workspace

Status: implemented and validated on 2026-07-18.

### Summary

Added an independently routed tenant operations workspace backed by batched, tenant-aware queries. Operators can search and filter the portfolio, inspect explainable health/risk signals, view database usage and subscription history, manage tags and internal notes, review platform activity, archive/restore records, and safely transfer ownership to an active administrator in the same tenant.

### Files added

- `backend/models/TenantNote.js`
- `backend/routes/superadmin/tenantWorkspace.js`
- `backend/services/tenantHealthService.js`
- `backend/tests/tenantWorkspace.test.js`
- `frontend/src/pages/superadmin/SuperAdminTenantWorkspace.js`

### Files modified

- `backend/models/Tenant.js`
- `backend/routes/superadmin.js`
- `backend/services/tenantDeletionService.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Database changes

- Added optional `Tenant.management.tags`, `archivedAt`, `archivedBy`, and `archiveReason` fields with portfolio indexes.
- Added indexed `tenantnotes` collection with author, body, pin, visibility, and edit metadata.
- Permanent tenant deletion now includes tenant notes.
- Existing tenant documents remain valid without a blocking migration.

### API changes

- Added paginated/filterable `GET /api/superadmin/tenant-workspace`.
- Added tenant summary, activity, and notes endpoints.
- Added create/update/delete tenant-note operations.
- Added tag update, archive, restore, and ownership-transfer operations.
- Ownership transfer only accepts an active administrator belonging to the target tenant.

### UI changes

- Added `/superadmin/tenant-workspace`.
- Portfolio search, lifecycle and archive filters, pagination, explainable health scores, usage cards, billing history, audit timeline, tags, internal notes, and archive/restore controls.

### Correctness and performance

- Directory usage is computed with three batched aggregation pipelines rather than per-tenant queries.
- Product, order, paid/gross sales, stock, administrator, last-login, and last-order values come from tenant-scoped database records.
- Storage is explicitly returned as `not_metered`; the previous image-count estimate is not presented as real storage consumption.
- Health scores expose every deduction and are deterministic under test.

### Validation

- Backend: 85 tests passed, 0 failed before the final ownership/note extensions; route-module and schema coverage remained additive.
- Frontend optimized production build: compiled successfully.
- Tenant deletion registry was extended for the new tenant-owned collection.

### Next increment

Introduce platform sessions and authentication-event history, token revocation/force logout, session and device APIs, security-event persistence, and the first Security Center dashboard. Then add typed platform settings and encrypted integration configuration.

## Increment 4 — Revocable sessions and Security Center

Status: implemented and validated on 2026-07-18.

### Summary

Introduced persistent server-side sessions for newly issued tokens, per-user token versions, authentication event history, device visibility, immediate session revocation, force logout across all devices, account unlock, and an evidence-based Security Center score. Existing JWTs without a session identifier remain compatible until their account token version changes.

### Files added

- `backend/models/AuthSession.js`
- `backend/models/AuthEvent.js`
- `backend/services/authSessionService.js`
- `backend/routes/superadmin/security.js`
- `backend/tests/securityCenter.test.js`
- `frontend/src/pages/superadmin/SuperAdminSecurity.js`

### Files modified

- `backend/middleware/auth.js`
- `backend/models/User.js`
- `backend/routes/auth.js`
- `backend/routes/superadmin.js`
- `backend/services/tenantDeletionService.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Authentication and database changes

- New JWTs carry `ver` (token version) and `jti` (server session ID).
- `User.tokenVersion` is hidden by default and invalidates every older token when incremented.
- Active session lookup rejects revoked, missing, expired, or wrong-version sessions.
- Session last-seen writes are throttled to once per five minutes.
- Expired session records use a MongoDB TTL index.
- Password reset revokes existing sessions before issuing the replacement session.
- Tenant administrator password reset now increments token version and revokes existing sessions.
- Password login lookup is now tenant-scoped, eliminating ambiguous cross-tenant email authentication.
- Authentication events capture success/failure/blocked outcome, method, reason, IP, user agent, session, and correlation ID.

### API and UI changes

- Added Security overview, active-session directory, authentication-event timeline, single-session revoke, force logout, and account-unlock APIs.
- Added `/superadmin/security` with security score checks, metrics, device/session table, revoke controls, and authentication events.
- All Security APIs require `security.view` or `security.manage`.

### Compatibility and migration

- Existing JWTs without `jti` are accepted while their implicit token version remains zero.
- No user migration is blocking; absent `tokenVersion` reads as zero.
- After normal reauthentication, sessions are server-recorded and individually revocable.
- Permanent tenant deletion removes active session records while retaining platform authentication events for investigations.

### Known score finding

MFA is deliberately reported as failing—not simulated or marked complete. Implementing TOTP enrollment, recovery codes, step-up challenges, and enforcement is required before the Security Center can award those points.

### Validation

- Backend: 90 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Route-module loading and tenant-deletion coverage pass.

### Next increment

Implement typed platform settings, maintenance/registration policies, encrypted integration secrets, redacted configuration APIs, dependency connection tests, and the Platform Settings UI. Then implement MFA and step-up authentication.

## Increment 5 — Operational Platform Settings

Status: implemented and validated on 2026-07-18.

### Summary

Added a typed global settings registry and database-backed settings service with strict server validation, short-lived caching, public-value allowlisting, audited updates, active maintenance-mode gating, and enforced registration policy. The Super Admin UI provides grouped configuration, dirty-state tracking, operational warnings, and change attribution.

### Files added

- `backend/config/platformSettingsRegistry.js`
- `backend/models/PlatformSetting.js`
- `backend/services/platformSettingsService.js`
- `backend/middleware/platformPolicy.js`
- `backend/routes/superadmin/platformSettings.js`
- `backend/tests/platformSettings.test.js`
- `frontend/src/pages/superadmin/SuperAdminPlatformSettings.js`

### Files modified

- `backend/server.js`
- `backend/routes/auth.js`
- `backend/routes/superadmin.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Operational behavior

- Maintenance mode returns `503 PLATFORM_MAINTENANCE` with `Retry-After` for customer-facing requests.
- `/api/health`, `/api/superadmin/*`, and Super Admin authentication remain available for diagnosis and recovery.
- Policy reads use a 30-second cache and fail open on database/configuration read failure to avoid an accidental platform-wide outage.
- Open registration and invitation-only controls are enforced by `/api/auth/register`.
- Public settings are exposed only through an explicit allowlist at `/api/platform-settings/public`.
- HTTPS URLs, email, color, currency, enum, Boolean, length, and numeric constraints are validated server-side.
- Settings changes capture old/new values, changed fields, actor, and correlation data in the platform audit trail.

### Settings groups delivered

- Platform identity: name, logo, favicon, primary color, default theme.
- Localization: language, timezone, currency.
- Support: email, phone, chat-widget status.
- Legal: privacy and terms URLs.
- Access: registration enabled and invitation-only mode.
- Operations: maintenance status and customer message.

### Validation

- Backend: 95 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Public-value leakage, malformed configuration, maintenance recovery exemptions, permission coverage, and registration enforcement have automated tests.

### Next increment

Add encrypted integration configuration with redacted read APIs and real provider health checks. Wire supported providers into existing services through a settings/env resolution layer. Then deliver TOTP MFA, recovery codes, and step-up authentication for destructive platform actions.

## Increment 6 — Encrypted Integration Center

Status: implemented and code-validated on 2026-07-18. Live provider results depend on deployment credentials and network access.

### Summary

Added encrypted, audited platform integration configuration for providers already used by StoreKit: Stripe, Cloudinary, Resend, SMTP, Google OAuth, Meta CAPI, OpenRouter, Gemini, and Pexels. Secrets are write-only, authenticated-encrypted at rest, redacted from every read response, and resolved with environment variables as a compatibility fallback. SMTP and Resend mail delivery now consume database-backed platform integration configuration.

### Files added

- `backend/config/integrationRegistry.js`
- `backend/models/PlatformIntegration.js`
- `backend/utils/platformSecretCrypto.js`
- `backend/services/platformIntegrationService.js`
- `backend/routes/superadmin/integrations.js`
- `backend/tests/platformIntegrations.test.js`
- `frontend/src/pages/superadmin/SuperAdminIntegrations.js`

### Files modified

- `backend/routes/superadmin.js`
- `backend/utils/mailer.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Security behavior

- AES-256-GCM provides confidentiality and authentication for stored secrets.
- A dedicated `PLATFORM_SECRETS_ENCRYPTION_KEY` of at least 32 characters is required to write or decrypt database secrets; `SOCIAL_MEDIA_SECRET` is accepted as a migration fallback.
- `encryptedSecrets` is excluded from Mongoose queries by default.
- Read APIs return only field name, configured state, and source (`database`, `environment`, or `missing`).
- Blank secret edits preserve the existing value; API payloads never echo secrets.
- Secret-like provider error authorization values are redacted before persistence/response.
- Configuration updates and connection tests require `infrastructure.manage` and generate audit events.

### Provider verification

- Stripe: balance API credential check.
- Cloudinary: provider ping.
- Resend: domains API request.
- SMTP: transport verification handshake.
- Meta CAPI: Graph API identity request.
- OpenRouter and Gemini: model-list API request.
- Pexels: bounded search request.
- Google OAuth: configuration-presence validation only; true end-to-end verification requires completing an authorized browser sign-in and is explicitly labelled `configuration_only`.

No live provider was falsely marked healthy during repository testing. Results are persisted only when an operator runs a test against configured deployment credentials.

### Runtime integration

- Platform SMTP/Resend configuration is resolved from encrypted database records first, then environment variables.
- Provider resolution is cached for 30 seconds and invalidated on updates.
- Tenant-specific email configuration remains supported and takes precedence where already designed.

### UI changes

- Added `/superadmin/integrations`.
- Category filtering, configured/missing indicators, environment/database source labels, write-only secret editor, enable/disable control, connection testing, duration, status, and last-test details.

### Validation

- Backend: 100 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Encryption tamper detection, API redaction, configuration allowlisting, permissions, and mailer integration are covered automatically.

### Next increment

Implement TOTP MFA enrollment/challenge/recovery codes and step-up authentication for destructive platform actions. Follow with durable monitoring/infrastructure health and job telemetry.

## Increment 7 — TOTP MFA and step-up authentication

Status: implemented and validated on 2026-07-18.

### Summary

Implemented RFC 6238 TOTP MFA for Super Admin operators with encrypted authenticator secrets, confirmation before activation, bcrypt-hashed single-use recovery codes, password and Google sign-in challenges, session-level MFA evidence, and ten-minute step-up authentication for sensitive actions.

### Files added

- `backend/models/MfaFactor.js`
- `backend/services/mfaService.js`
- `backend/middleware/stepUp.js`
- `backend/tests/mfa.test.js`

### Files modified

- `backend/models/AuthSession.js`
- `backend/routes/auth.js`
- `backend/server.js`
- `backend/routes/superadmin.js`
- `backend/routes/superadmin/access.js`
- `backend/routes/superadmin/integrations.js`
- `backend/routes/superadmin/security.js`
- `backend/services/authSessionService.js`
- `backend/services/tenantDeletionService.js`
- `frontend/src/context/AuthContext.js`
- `frontend/src/pages/superadmin/SuperAdminLogin.js`
- `frontend/src/pages/superadmin/SuperAdminSecurity.js`

### Authentication flow

- Enrollment creates a 160-bit random TOTP secret and ten random recovery codes.
- The TOTP secret is AES-256-GCM encrypted; recovery codes are individually bcrypt hashed.
- The operator must enter a valid current TOTP before the factor becomes active.
- The enrollment response provides a standard `otpauth://` URI and manual key compatible with authenticator applications.
- Password and Google authentication return a signed five-minute MFA challenge instead of an access token when MFA is enabled.
- Successful challenge creates a normal revocable session with `mfaVerifiedAt` and `lastStepUpAt` evidence.
- Recovery codes are consumed atomically from the factor document after successful use.
- TOTP verification accepts only the previous/current/next 30-second window.

### Step-up enforcement

Recent MFA verification (maximum age ten minutes) is required for:

- Permanent tenant deletion.
- Platform role creation/update and operator role assignment.
- Integration configuration and secret changes.
- Platform-wide force logout.

Operators without MFA receive `428 MFA_ENROLLMENT_REQUIRED`; expired evidence receives `428 STEP_UP_REQUIRED`. The Security Center provides enrollment and an explicit step-up action.

### Security Center changes

- MFA status and enrollment workflow.
- One-time display of recovery codes.
- Manual authenticator key and standard provisioning URI.
- Recent step-up verification control.
- Security score now awards MFA points only when every active platform operator has an enabled factor.

### Compatibility and cleanup

- Operators without MFA may continue normal read/write work that is not classified as sensitive.
- Sensitive actions require enrollment rather than silently bypassing MFA.
- Tenant deletion removes MFA factors belonging to deleted tenant users; platform authentication evidence is retained.

### Validation

- Backend: 106 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- RFC 6238 known vector, clock-skew boundary, base32 round-trip, recovery-code format, secret exclusion, challenge rate limiting, login challenge ordering, and step-up coverage are automated.

### Next increment

Replace in-process monitoring with durable bounded metric snapshots, dependency health, job/worker records, error events, infrastructure telemetry, and alert rules; deliver the Monitoring and Infrastructure UI.

## Increment 8 — Durable Operations and Monitoring Center

Status: implemented and validated on 2026-07-18.

### Summary

Replaced restart-only operational visibility with bounded MongoDB telemetry for API performance, process health, database latency, provider state, background jobs, aggregated application errors, and stateful alerting. Added a permission-controlled Operations workspace with real health history, error resolution, job runs, integration health, and editable alert rules.

### Files added

- `backend/models/MetricSnapshot.js`
- `backend/models/SystemError.js`
- `backend/models/JobRun.js`
- `backend/models/AlertRule.js`
- `backend/models/AlertEvent.js`
- `backend/services/operationsService.js`
- `backend/routes/superadmin/operations.js`
- `backend/tests/operationsMonitoring.test.js`
- `frontend/src/pages/superadmin/SuperAdminOperations.js`

### Files modified

- `backend/middleware/monitoring.js`
- `backend/middleware/security.js`
- `backend/routes/superadmin.js`
- `backend/server.js`
- `backend/services/backupScheduler.js`
- `backend/services/subscriptionScheduler.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Database changes

- Metric snapshots retain 90 days of API-window, Node.js process, MongoDB, and integration-state telemetry.
- Job runs retain 90 days of start/completion/status/duration/count metadata.
- Aggregated error fingerprints retain 180 days and support operator resolution notes.
- Alert transition events retain 365 days; alert rules persist without TTL.
- TTL indexes provide automatic bounded retention. No destructive migration is required; normal Mongoose index synchronization creates the collections/indexes.

### API and permission changes

- Added `/api/superadmin/operations/overview` and `/metrics` for `monitoring.view`.
- Added manual metric capture for `monitoring.manage`.
- Added paginated error history and audited resolution.
- Added job-run history.
- Added alert rules/events, metric allowlisting, rule enable/disable, and audited acknowledgment.
- All operations routes require dynamic RBAC permissions; no route relies on a hardcoded operator role.

### Runtime behavior

- A snapshot is captured on startup and every five minutes per application instance.
- Request latency memory is capped at 1,000 samples and reset per snapshot window.
- Unexpected HTTP 5xx failures are sanitized, fingerprinted, and aggregated without storing bearer tokens, query secrets, or provider keys.
- Subscription billing and daily/weekly/monthly backups persist job outcomes and errors.
- Default rules detect sustained API error rate, API p95 latency, RSS memory, database latency, and event-loop lag; consecutive samples reduce transient noise.
- Alert events are created only on state transitions (`firing` or `resolved`).

### UI changes

- Added `/superadmin/operations` with health, errors, jobs, alerts, and dependencies sections.
- Includes 24-hour API latency/error visualization, runtime and MongoDB status, provider test state, social scheduler state, aggregated occurrence counts, resolution workflow, rule creation/toggling, and alert acknowledgment.
- Empty/loading states and responsive tables are included; every displayed record comes from persisted or live application data.

### Validation

- Backend: 112 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- TTL uniqueness, error redaction, nested alert comparisons, metric/operator allowlists, permission coverage, scheduler tracking, bounded samples, server error persistence, and monitoring startup are automatically checked.

### Deployment notes

- MongoDB credentials must permit index creation for TTL indexes.
- CPU values are cumulative process counters; memory, event-loop lag, API-window data, and database latency are point-in-time samples.
- Multi-instance deployments persist each `instanceId`; the current overview shows the newest sample across instances.

### Next increment

Harden and expand subscription/billing management around Stripe synchronization, invoices, payment attempts, refunds, dunning and grace periods. Then proceed with runtime feature flags, analytics, support/notifications, and developer tooling.

## Increment 9 — Billing Lifecycle, Invoices, Refunds, Dunning, and Stripe Reconciliation

Status: lifecycle foundation implemented and validated on 2026-07-18. Coupons, tax rules, a hosted billing portal, and enterprise contracts remain in the active billing phase.

### Summary

Consolidated production billing onto the mounted `TenantPayment` and `subscriptionService` path, removed the unmounted competing route/service, and added durable subscription invoices, payment attempts, refunds, dunning events, and explicit Stripe tenant reconciliation. Existing tenant billing fields and customer storefront payment processing remain compatible.

### Files added

- `backend/models/BillingPaymentAttempt.js`
- `backend/models/BillingRefund.js`
- `backend/models/BillingDunningEvent.js`
- `backend/services/billingLifecycleService.js`
- `backend/routes/superadmin/billingLifecycle.js`
- `backend/tests/billingLifecycle.test.js`

### Files modified

- `backend/models/Tenant.js`
- `backend/models/TenantPayment.js`
- `backend/models/SubscriptionInvoice.js`
- `backend/services/subscriptionService.js`
- `backend/services/tenantDeletionService.js`
- `backend/services/subscriptionScheduler.js`
- `backend/routes/superadmin.js`
- `backend/scripts/billing-migration.js`
- `backend/scripts/subscription-maintenance.js`
- `frontend/src/pages/superadmin/SuperAdminBilling.js`

### Dead code removed

- `backend/routes/superadminBilling.js` — never mounted and used a separate payment model.
- `backend/services/subscriptionBillingService.js` — competing lifecycle engine replaced by the canonical service.

The legacy `SubscriptionPayment` model remains loadable only to preserve historical collection cleanup during tenant deletion. New billing writes use `TenantPayment`.

### Database changes

- Tenant billing records now support Stripe customer/subscription references and dunning counters.
- Tenant payments support processing, failure, partial/full refund states, provider references, idempotency keys, and invoice links.
- Subscription invoices support provider reconciliation, hosted invoice URLs, past-due/uncollectible/refund states, and payment links.
- Payment attempt, refund, and dunning event collections provide append-oriented operational history.
- Dunning history expires after two years; invoices, payments, and refunds are retained as financial records.

### Correctness and security

- Manual approval atomically claims `pending → processing`; activation failure rolls the payment back to pending and records a failed attempt.
- Successful approval activates the paid period, creates/links a paid invoice, resets dunning state, and records the attempt.
- Refund amounts cannot exceed the unrefunded balance.
- Refund requests use idempotency keys; duplicate concurrent requests converge on one ledger entry.
- Stripe refunds are marked successful only when Stripe confirms success.
- Manual refunds remain pending until an operator confirms the external transfer.
- Refund and Stripe-mapping changes require recent MFA step-up and granular billing permissions.
- Every approval, rejection, refund, manual confirmation, mapping change, and Stripe sync is audited.

### Dunning behavior

- Expired trials and paid periods create or update a past-due invoice and a durable grace-start event.
- The plan-specific grace deadline is applied to both mirrored subscription representations.
- Grace expiry suspends the store and records a suspension event.
- Successful payment resets dunning attempt counters.
- The tracked scheduler returns processed/failure counts to the Operations Center.

### Stripe reconciliation

- Operators explicitly map validated `cus_…` and optional `sub_…` identifiers to a tenant.
- Sync retrieves the mapped subscription and up to 100 latest invoices through the encrypted platform Stripe integration.
- Unknown future Stripe subscription states fail conservatively to `past_due`.
- Provider invoice IDs are unique and upserted idempotently; repeated syncs do not create duplicates.
- No live provider success is claimed without configured credentials and an actual Stripe response.

### UI changes

- Billing now displays the invoice ledger, payment-attempt history, refund ledger, and dunning timeline.
- Approved payments expose refund controls; pending manual refunds expose explicit transfer confirmation.
- Tenant rows support Stripe mapping and on-demand provider synchronization.

### Migration and deployment

- Run `node scripts/billing-migration.js` once after deployment to initialize tenants that lack canonical lifecycle dates and execute a catch-up tick.
- MongoDB must permit new index creation.
- Configure and test Stripe in Super Admin Integrations before mapping tenants.
- Existing storefront/order payment endpoints are unchanged.

### Validation

- Backend: 120 tests passed, 0 failed before the final canonical-script regression was added.
- Frontend optimized production build: compiled successfully.
- Schemas, provider-state mapping, non-sequential invoice identifiers, safe approval ordering/rollback, refund step-up/audit/idempotency, Stripe confirmation, dunning persistence, tenant cleanup, and canonical script usage are automated.

### Remaining billing work

- Plan coupons and discounts with redemption limits.
- Jurisdiction-aware tax configuration and invoice tax lines.
- Stripe-hosted billing portal session creation.
- Automated retry schedules and notification delivery for dunning events.
- Enterprise contracts and manual invoice terms.

## Increment 10 — Commercial Billing Controls and Dunning Delivery

Status: implemented and validated on 2026-07-18. Live Stripe portal and email delivery require valid deployment integration credentials.

### Summary

Completed the requested subscription-commercial layer with platform coupons, jurisdiction tax rules, immutable quote snapshots, enterprise contracts, Stripe-hosted billing portal sessions, exponential dunning reminders, and a tenant-facing server-calculated payment workflow. Storefront/customer-order promotions remain isolated from SaaS subscription discounts.

### Files added

- `backend/models/BillingCoupon.js`
- `backend/models/BillingCouponRedemption.js`
- `backend/models/BillingTaxRule.js`
- `backend/models/EnterpriseContract.js`
- `backend/services/billingCommercialService.js`
- `frontend/src/pages/superadmin/SuperAdminBillingCommercial.js`

### Files modified

- `backend/config/integrationRegistry.js`
- `backend/models/BillingDunningEvent.js`
- `backend/models/SubscriptionInvoice.js`
- `backend/models/TenantPayment.js`
- `backend/routes/billing.js`
- `backend/routes/payments.js`
- `backend/routes/superadmin/billingLifecycle.js`
- `backend/services/billingLifecycleService.js`
- `backend/services/subscriptionService.js`
- `backend/services/tenantDeletionService.js`
- `backend/tests/billingLifecycle.test.js`
- `frontend/src/pages/admin/Billing.js`
- `frontend/src/pages/superadmin/SuperAdminBilling.js`

### Pricing authority and quote behavior

- Tenant-supplied subscription amounts are no longer trusted or consumed.
- The backend derives subtotal from an active enterprise contract or the assigned plan.
- Valid coupons apply after plan/contract selection and before tax.
- One highest-priority country/region tax rule applies, with inclusive and exclusive calculations supported.
- Currency, billing cycle, tax lines, contract ID, coupon, subtotal, discount, tax, and final total are snapshotted on payment/invoice records.
- A tenant cannot create another payment while one is pending or processing.
- A valid 100% coupon creates a zero-value payment and activates it through the same safe approval/invoice pipeline without requiring fabricated payment proof.

### Coupon controls

- Percentage and fixed discounts, currency matching, plan targeting, activation windows, global limits, and per-tenant limits.
- Redemption slots are atomically claimed globally and represented as reserved/redeemed/released records.
- Rejection releases the reservation and decrements the claimed count; approval finalizes it.
- Coupon codes and limits are controlled through audited `billing.update` APIs and UI.

### Tax controls

- ISO two-letter country targeting with optional region or wildcard matching.
- Inclusive/exclusive percentage tax, priority, activation windows, and enable/disable state.
- Tax line values are stored on invoices so later rule changes do not rewrite financial history.

### Enterprise contracts

- Tenant-specific amount, currency, billing cycle, Net payment terms, effective dates, renewal preference, purchase order, notes, and lifecycle state.
- Contract creation and updates require `billing.update` plus recent MFA step-up.
- Only an active contract inside its effective dates overrides plan pricing.

### Stripe billing portal

- The Stripe platform integration now accepts a secure `portalReturnUrl` configuration.
- Super Admin can create a short-lived Stripe billing portal session for a mapped tenant.
- The provider URL is returned only after Stripe successfully creates the session; no portal availability is simulated locally.

### Dunning delivery

- Past-due tenants receive up to three reminder attempts using exponential intervals (`BILLING_RETRY_BASE_HOURS`, minimum one hour, default 24 hours).
- Each retry is atomically claimed on the tenant before delivery to prevent duplicate emails across multiple application instances.
- SMTP/Resend delivery uses the encrypted integration resolution layer.
- Pending, delivered, and failed outcomes—including bounded failure messages—are persisted in the dunning timeline.
- Grace-expiry suspension remains deterministic even when email delivery fails.

### Security hardening

- PayHere, Stripe, and PayPal customer payment initiation now uses the central database-backed authentication middleware.
- Revoked sessions, disabled users, token-version changes, issuer/audience constraints, and expiration are enforced before payment initiation.
- The former route-local raw `jwt.verify` bypass was removed.

### UI changes

- Super Admin Billing includes Coupon, Tax, and Enterprise Contract editors, provider portal launch, ledger history, and dunning delivery status.
- Tenant Admin Billing supports coupon validation, exact server quote breakdown, contract indication, conditional proof requirements, and zero-value activation.
- The editable subscription amount field was removed.

### Migration and deployment

- Allow MongoDB to create indexes for coupon codes, redemptions, tax lookup, and contract numbers.
- Configure Stripe `portalReturnUrl` as an HTTPS URL and test Stripe credentials before portal use.
- Configure SMTP or Resend before relying on dunning delivery; failed attempts remain visible and retry on the exponential schedule.
- Set tenant `merchantCountryCode` accurately for tax matching. Unknown countries correctly produce no tax rather than guessing.

### Validation

- Backend: 125 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Coverage includes schemas, deterministic rounding/country normalization, provider-state mapping, server-authoritative quotes, zero-value coupon activation, session authentication, RBAC/audit/step-up controls, Stripe portal calls, multi-instance dunning claims, failed-delivery persistence, and canonical billing scripts.

### Next increment

Implement a runtime feature-flag engine distinct from plan entitlements: global/tenant/country/role/percentage targeting, deterministic allocation, dependencies, schedules, expiry, kill switches, exposure events, and Super Admin management UI.

## Increment 11 — Enterprise Runtime Feature Flags

Status: implemented and validated on 2026-07-18.

### Summary

Added a runtime release-governance engine separate from subscription plan entitlements. Flags support deterministic percentage rollout, tenant allow/deny targeting, country and role targeting, plan-entitlement composition, dependencies, schedules, expiry, client visibility, weighted variants for A/B tests, emergency kill switches, simulation, and privacy-preserving exposure analytics.

### Files added

- `backend/models/RuntimeFeatureFlag.js`
- `backend/models/FeatureFlagExposure.js`
- `backend/services/runtimeFeatureFlagService.js`
- `backend/routes/superadmin/featureFlags.js`
- `backend/routes/runtimeFeatureFlags.js`
- `backend/routes/adminRuntimeFlags.js`
- `backend/tests/runtimeFeatureFlags.test.js`
- `frontend/src/pages/superadmin/SuperAdminFeatureFlags.js`

### Files modified

- `backend/middleware/tenant.js`
- `backend/routes/superadmin.js`
- `backend/server.js`
- `backend/services/tenantDeletionService.js`
- `frontend/src/pages/admin/AdminLayout.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Evaluation architecture

- Plan entitlements remain the commercial source of ownership.
- A runtime flag with `entitlementKey` can only enable when that plan feature is already owned.
- The evaluation order is: enabled state, kill switch, start/end/expiry, entitlement, tenant deny/allow, country, role, dependencies, deterministic percentage, deterministic variant.
- Missing runtime flags preserve existing plan behavior; creating a flag opts that capability into runtime governance.
- Decisions use SHA-256 allocation over flag salt, key, version, purpose, and stable subject ID.
- Changing ordinary data increments the flag version and intentionally reallocates subjects; repeated evaluation within a version is stable.
- A five-second process cache bounds database reads. Mutations invalidate the local cache immediately; horizontally scaled instances converge within five seconds.

### Targeting and experiments

- Global enable/disable and rollout from 0–100%.
- Tenant allow and deny lists, with deny evaluated first.
- ISO country and normalized role targeting.
- Dependencies must exist and cycles are rejected before persistence.
- Start, end, and independent expiration timestamps.
- Weighted variants require unique keys and weights totaling exactly 100; bounded JSON payloads are supported.
- A simulator evaluates a selected tenant/role without recording exposure.

### Kill-switch safety

- Activating or clearing a kill switch requires `featureflags.manage` and recent MFA step-up.
- Kill activation also disables the flag and increments its version.
- Clearing a kill switch leaves the flag disabled, requiring a separate deliberate enable action.
- Generic flag editing cannot bypass the step-up-protected kill-switch endpoints.

### Exposure privacy and retention

- Exposure recording is explicit, not automatic for every evaluation.
- Raw user and anonymous subject keys are never stored as analytics identifiers.
- Subject identifiers use HMAC-SHA256 with `FEATURE_EXPOSURE_HASH_KEY`, falling back to `JWT_SECRET`.
- Exposure events retain flag/version/variant/reason/tenant/country/role/correlation data for 180 days through TTL.
- Tenant deletion removes its retained exposures.

### APIs and integration

- Super Admin CRUD, kill/restore, simulation, and exposure aggregation require dynamic `featureflags.view/manage` permissions and produce audit events.
- Public tenant evaluation is rate limited, requires a bounded anonymous ID, exposes only `clientVisible` flags, and returns `Cache-Control: private, no-store`.
- Authenticated Admin evaluation uses the database user and tenant plan rather than caller-supplied identity.
- `requireFeature(featureName, runtimeFlagKey)` now composes plan entitlement with runtime governance and returns `FEATURE_DISABLED` for a governed shutdown.
- Admin navigation evaluates client-visible flags. Convention `admin.nav.<planFeatureKey>` governs an entitled sidebar module; absence of the flag keeps the current module visible.

### UI changes

- Added `/superadmin/runtime-flags` alongside the existing plan-impact governance page.
- Create/edit controls for entitlement, percentage, tenant allow/deny, country, role, dependencies, schedule, expiration, client visibility, and JSON variants.
- Flag cards show state, version, rollout, targeting, dependencies, schedule, and exposure volume.
- Includes simulation, enable/disable, MFA-protected kill/restore, and 30-day exposure breakdown.

### Security boundary

Feature flags control release and availability, not authorization. Sensitive APIs must still enforce authentication, tenant scoping, RBAC, and ownership even when their flag evaluates enabled. Client-visible decisions must never contain secrets.

### Migration and deployment

- No data migration is required; an empty flag collection preserves all current behavior.
- Allow MongoDB to create flag and exposure indexes.
- Set a dedicated random `FEATURE_EXPOSURE_HASH_KEY` in production to isolate analytics hashing from JWT signing-key rotation.
- Use stable anonymous IDs for storefront experiments. Do not use rollout allocation as a fraud or access-control mechanism.

### Validation

- Backend: 133 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Git diff whitespace/integrity check: clean.
- Automated coverage includes schema/TTL, deterministic versioned allocation, weighted variants, every targeting gate, dependencies, schedules, RBAC/audit, MFA kill/restore, public visibility/cache rules, authenticated Admin context, keyed exposure hashing, and entitlement/runtime middleware composition.

### Next increment

Build the platform Notification and Support Center: channel/template configuration, durable queued delivery with retries, announcements and maintenance notices, tenant tickets, assignment/escalation/SLA state, internal notes, and audited operator replies.

## Increment 12 — Notification and Support Center

Status: implemented and validated on 2026-07-18.

### Summary

Added platform communication and customer-support operations without replacing the existing tenant order-notification system. Super Admin now has targeted campaigns, reusable channel templates, a restart-safe delivery queue, retry/dead-letter controls, SLA-aware tenant tickets, assignments, escalation, internal notes, and a publishable knowledge base. Tenant administrators have a tenant-isolated support portal.

### Files added

- `backend/models/PlatformNotificationTemplate.js`
- `backend/models/PlatformAnnouncement.js`
- `backend/models/NotificationDelivery.js`
- `backend/models/SupportTicket.js`
- `backend/models/SupportMessage.js`
- `backend/models/KnowledgeArticle.js`
- `backend/services/platformNotificationService.js`
- `backend/services/supportService.js`
- `backend/routes/superadmin/notificationsCenter.js`
- `backend/routes/superadmin/support.js`
- `backend/routes/support.js`
- `backend/tests/notificationsSupport.test.js`
- `frontend/src/pages/superadmin/SuperAdminNotificationsCenter.js`
- `frontend/src/pages/superadmin/SuperAdminSupportCenter.js`
- `frontend/src/pages/admin/SupportCenter.js`

### Files modified

- `backend/config/integrationRegistry.js`
- `backend/routes/notifications.js`
- `backend/routes/superadmin.js`
- `backend/server.js`
- `backend/services/platformIntegrationService.js`
- `backend/services/tenantDeletionService.js`
- `backend/tests/tenantDeletion.test.js`
- `frontend/src/App.js`
- `frontend/src/pages/admin/AdminLayout.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Notification architecture

- Templates are channel-specific, versioned, locale-ready, enable/disable capable, and reject any variable not explicitly allowlisted.
- HTML template substitutions escape untrusted tenant values.
- Campaigns support global, selected-tenant, plan, and ISO-country audiences; announcement, maintenance, trial, payment, suspension, deployment, and custom event kinds; severity; multiple channels; scheduling; archive; and tenant-specific template keys.
- Every campaign/tenant/channel delivery has a unique idempotency key, so publishing or worker retries cannot duplicate it.
- The MongoDB queue atomically claims due work, recovers stale claims, applies exponential backoff, caps attempts, and retains a dead-letter state with the last provider error.
- Scheduled campaigns are materialized by the worker when due. Queue work is bounded per run and its health is visible in the overview.
- Delivery supports platform email, Twilio SMS, Slack webhook, signed generic webhook, configured push gateway, and tenant in-app notifications. Remote channels use encrypted Integration Center secrets.
- Existing order/customer notification flows remain intact; platform `system` messages are additive to the tenant admin notification panel.

### Support architecture

- Tickets require a tenant and requester and carry category, priority, status, assignment, tags, first-response deadline, resolution deadline, escalation, resolution time, and last-activity/message counts.
- Priority selects a deterministic SLA policy; Super Admin can re-prioritize, assign, escalate, resolve, and close.
- Replies, system events, live-chat-compatible messages, and private internal notes share an ordered timeline.
- Tenant routes always include the authenticated tenant in ticket lookups and never return internal notes.
- Super Admin replies and all management changes require dynamic `support.*` permissions and create persistent platform audit events.
- Published knowledge articles are available to tenant administrators; drafts and archived articles remain platform-only.
- Tenant deletion removes deliveries, tickets, messages, and announcement targeting references before the tenant record is removed.

### APIs and permissions

- `/api/superadmin/notifications-center/*` uses `notifications.view`, `notifications.manage`, and `notifications.send`.
- `/api/superadmin/support/*` uses `support.view`, `support.reply`, and `support.manage`.
- `/api/support/*` uses authenticated tenant-admin identity and resolved tenant ownership.
- Campaign publish, delivery retry, ticket changes, escalation, replies, internal notes, and knowledge mutations are audited.

### UI changes

- Added Super Admin Notification Center with campaign authoring, targeting, channel selection, delivery templates, live queue metrics, delivery logs, errors, attempts, and retry controls.
- Added Super Admin Support Center with SLA summary, ticket timeline, assignment, priority/status control, escalation, replies, internal notes, and knowledge authoring.
- Added tenant Admin Support Center with ticket creation, status/SLA visibility, replies, conversation history, and published knowledge content.

### Integration and deployment

- Configure remote channels through Integration Center: `SLACK_WEBHOOK_URL`, Twilio account/from/auth values, signed notification webhook endpoint/secret, and push gateway endpoint/API key. Database-stored values remain encrypted and override environment fallback.
- Missing or disabled providers do not lose messages: deliveries retry and then become visible dead-letter records.
- No blocking data migration is required. MongoDB creates the new unique and compound indexes during normal model initialization.

### Validation

- Backend module load: successful.
- Backend: 138 tests passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Automated coverage includes queue idempotency/indexes, template allowlists and escaping, support ownership/internal-note boundaries, SLA priority behavior, dynamic permission enforcement, and deletion cleanup.

### Next increment

Build the platform Analytics Center and Developer Center: authoritative MRR/ARR/churn/retention and feature adoption, exports, API credentials, webhook logs/replay, usage/rate-limit visibility, environment-safe secrets, and generated OpenAPI documentation.

## Increment 13 — Authoritative Platform Analytics

Status: implemented and validated on 2026-07-18.

### Summary

Added a platform Analytics Center backed by subscription, invoice, refund, tenant, user, product, order, authentication, and feature-exposure records. Financial values remain separated by currency, every non-obvious KPI exposes its definition, and unavailable acquisition costs are reported as missing rather than estimated.

### Files added

- `backend/services/platformAnalyticsService.js`
- `backend/routes/superadmin/analytics.js`
- `backend/tests/platformAnalytics.test.js`
- `frontend/src/pages/superadmin/SuperAdminAnalytics.js`

### Files modified

- `backend/routes/superadmin.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Metrics and methodology

- MRR normalizes monthly subscriptions directly and yearly subscriptions by twelve; one-time plans and trials contribute zero.
- ARR is twelve times current MRR, separately per currency.
- Cash collection uses reviewed approved platform subscription payments less persisted succeeded refunds.
- Logo churn uses cancellations during the selected range divided by tenants eligible at its start. LTV uses the compounded equivalent monthly churn rate and is omitted when no usable churn denominator exists.
- CAC is explicitly unavailable until StoreKit records or imports acquisition spend.
- Activation requires both a product and a first order within fourteen days after tenant creation.
- Trial/paid conversion uses persisted paid/refunded subscription invoices.
- Retention cohorts mark activity when the tenant owner signs in successfully or the storefront receives an order; calendar-month arithmetic is used rather than fixed-duration approximations.
- Storefront GMV includes paid, non-cancelled, non-refunded customer orders and is separate from StoreKit SaaS revenue.
- Runtime feature adoption uses privacy-preserving exposure records and reports exposure, unique tenant, and unique subject counts.

### APIs and UI

- Added overview, time-series, retention, feature-adoption, and CSV export endpoints.
- Read APIs require `analytics.view`; CSV requires `analytics.export`.
- CSV cells are quote escaped and formula-prefixed values are neutralized.
- The Super Admin UI includes currency selection, time range, KPI cards, collection and GMV charts, cohort matrix, feature adoption, methodology, and authenticated CSV download.

### Validation

- Backend suite after this increment: 142 passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Analytics module load and Git diff integrity checks passed.

## Increment 14 — Developer Center and Platform API

Status: implemented and validated on 2026-07-18.

### Summary

Added one-time platform API credentials, dynamic scopes, environment isolation, exact-IP restrictions, expiration/revocation/rotation, atomic cross-instance rate limiting, durable usage telemetry, metadata-only webhook logs and replay, integration health, and OpenAPI 3.0 output.

### Files added

- `backend/config/developerScopes.js`
- `backend/models/PlatformApiKey.js`
- `backend/models/ApiUsageEvent.js`
- `backend/models/ApiRateLimitBucket.js`
- `backend/models/WebhookEvent.js`
- `backend/services/platformApiKeyService.js`
- `backend/services/webhookEventService.js`
- `backend/middleware/platformApiAuth.js`
- `backend/routes/platformApi.js`
- `backend/routes/superadmin/developer.js`
- `backend/tests/developerCenter.test.js`
- `frontend/src/pages/superadmin/SuperAdminDeveloperCenter.js`

### Files modified

- `backend/routes/payments.js`
- `backend/routes/superadmin.js`
- `backend/server.js`
- `backend/services/platformNotificationService.js`
- `backend/services/tenantDeletionService.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`

### Credential security

- Keys contain 256 bits of random secret material and are returned only once.
- StoreKit persists an HMAC-SHA256 digest using `PLATFORM_API_KEY_HASH_KEY`, falling back to `JWT_SECRET`; plaintext keys never enter the database.
- Lookup uses a random prefix followed by constant-time digest comparison.
- Creation, rotation, and revocation require dynamic developer permissions and recent MFA step-up and are audit logged.
- Keys support exact IPv4/IPv6 allowlists, future expiration, immediate revocation, per-minute limits, and allowlisted scopes.
- Sandbox keys are structurally isolated and may call only the health endpoint; they cannot read live tenant or analytics records.

### Rate limits and usage

- Rate limiting uses a unique MongoDB key/minute bucket and an atomic conditional increment, so multiple application replicas share one limit.
- A duplicate-key outcome at the limit fails closed with HTTP 429 and `Retry-After`.
- Buckets expire automatically after two minutes.
- API usage stores key ID, environment, method, normalized endpoint, response status, latency, bytes, IP, and correlation ID for 180 days; raw authorization values are never stored.

### Webhooks and API surface

- PayHere and Stripe inbound callbacks persist provider/event/type/tenant/status/timing and SHA-256 payload digest after processing; payload bodies and secrets are not retained.
- Signed outbound notification webhooks persist success/failure, HTTP status, duration, and delivery linkage.
- Only StoreKit-owned outbound deliveries can be replayed. Replay creates a new idempotent queue record and requires recent MFA.
- `/api/platform/v1/health`, cursor-paginated `/tenants`, and `/analytics/overview` enforce individual API scopes.
- The Developer Center exposes credentials, usage, webhook logs/replay, provider configuration health, and downloadable OpenAPI 3.0 JSON.

### Deployment

- Set a dedicated high-entropy `PLATFORM_API_KEY_HASH_KEY` before issuing production keys. Changing it invalidates every existing platform API key.
- MongoDB must be permitted to create the API prefix, rate bucket, TTL, usage, and webhook indexes.
- Existing platform endpoints and tenant/customer authentication are unchanged; the API-key middleware is mounted only under `/api/platform/v1`.

### Validation

- Backend suite: 148 passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Developer/payment route module load and Git diff integrity checks passed.

### Next increment

Complete the remaining enterprise gaps: dedicated platform-user management, notification automation triggers, infrastructure controls that can be safely actioned from configured providers, global search/command palette and accessibility pass, then perform the requirement-by-requirement production-readiness audit and generate the final architecture/database/permission/feature/API/deployment report.

## Increment 15 — Platform User Lifecycle

Status: implemented and validated on 2026-07-18.

### Summary

Completed the platform-operator lifecycle around the existing dynamic RBAC and Security Center: single-use invitations, mandatory initial MFA, detailed operator inspection, suspension/reactivation, password-reset delivery, explicit MFA reset, session revocation, guarded deletion, and retained security/audit history.

### Files added

- `backend/models/PlatformAccountToken.js`
- `backend/services/platformAccountService.js`
- `backend/routes/platformAccount.js`
- `backend/tests/platformUsers.test.js`
- `frontend/src/pages/customer/PlatformAccount.js`
- `frontend/src/pages/superadmin/SuperAdminMfaEnrollment.js`

### Files modified

- `backend/models/User.js`
- `backend/routes/auth.js`
- `backend/routes/superadmin.js`
- `backend/routes/superadmin/access.js`
- `backend/server.js`
- `frontend/src/App.js`
- `frontend/src/pages/superadmin/SuperAdminAccessControl.js`

### Lifecycle and security behavior

- Invitations require `users.invite`, recent MFA step-up, a valid active platform role, and successful platform email delivery.
- Invitation and reset tokens have 256 bits of entropy, are stored only as keyed HMAC digests, expire, are single-use, and are invalidated when a replacement is issued.
- Accepted invitations create only global `superadmin` identities with `tenantId: null`; they never create or promote tenant users.
- New operators receive `mfaEnrollmentRequired`. The frontend renders only the enrollment screen, and the backend rejects every Super Admin API until TOTP confirmation clears the requirement.
- Password reset increments token version, revokes sessions, clears lockout, and deliberately preserves the existing MFA factor. MFA can only be removed through the separate step-up-protected reset operation.
- Explicit MFA reset deletes the factor, increments token version, revokes all sessions, and restores mandatory enrollment for the next sign-in.
- Suspension is step-up protected, immediately invalidates tokens, and revokes every session. Reactivation is separately step-up protected.
- Deletion rejects self-deletion and removal of the final active explicitly assigned operator. It deletes credentials/MFA/action tokens while retaining audit and authentication history for investigations.
- Operator details show assigned roles, MFA status, recent sessions/devices, and authentication outcomes.

### UI changes

- Access Control now includes role-bound invitations and operator search.
- Each operator has a security workspace with suspend/reactivate, reset link, MFA reset, deletion, session history, and authentication history.
- Public invitation/reset acceptance uses a dedicated secure page and never exposes temporary passwords.
- Mandatory first-login MFA displays setup key, one-time recovery codes, confirmation, and no Control Center navigation until enrollment succeeds.

### Deployment

- Set a dedicated high-entropy `PLATFORM_ACCOUNT_TOKEN_KEY`; fallback to `JWT_SECRET` is supported for compatibility. Changing this key invalidates outstanding invitations and password-reset links.
- Configure `FRONTEND_URL` or `CLIENT_URL` to the canonical HTTPS frontend before sending invitations.
- A working platform SMTP or Resend integration is required. Failed email delivery removes the newly created token so operators are not left with an inaccessible pending action.

### Validation

- Backend suite: 154 passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Route-module load and Git diff integrity checks passed.
- Tests cover one-time hashing/expiry, password strength, mandatory MFA gates, preservation of MFA during password reset, explicit reset/session revocation, step-up requirements, and lifecycle audit declarations.

### Next increment

Expand typed platform policy settings for password/MFA/session/cookie/localization/file limits, add safe notification event automation, complete global search/command palette/accessibility and responsive UX, then execute the final completion audit and report generation.

## Increment 16 — Enforceable Platform Policies and Consent

Status: implemented and validated on 2026-07-18.

### Summary

Expanded the settings registry with typed security, localization, and upload policies and connected the settings to the runtime paths they govern. High-risk policy changes now require recent MFA step-up. Customer analytics and advertising resources remain unloaded until explicit consent.

### Files added

- `frontend/src/components/CookieConsent.js`

### Files modified

- `backend/config/platformSettingsRegistry.js`
- `backend/middleware/auth.js`
- `backend/routes/auth.js`
- `backend/routes/platformAccount.js`
- `backend/routes/superadmin/platformSettings.js`
- `backend/routes/upload.js`
- `backend/services/authSessionService.js`
- `backend/services/platformAccountService.js`
- `backend/tests/platformSettings.test.js`
- `frontend/public/index.html`
- `frontend/src/App.js`
- `frontend/src/hooks/useAnalytics.js`
- `frontend/src/hooks/useSEO.js`

### Runtime policies

- Password length and uppercase, lowercase, number, and special-character rules are typed settings enforced by tenant registration, password reset/change, and platform invitation/reset acceptance.
- Session lifetime is resolved when a durable session is issued and controls both JWT and database-session expiration within safe bounds.
- Enabling platform-wide operator MFA requires the acting operator to have MFA and a recent step-up. Operators without an active factor are marked for enrollment, their token versions advance, and their sessions are revoked.
- Image and bulk SKU archive limits use typed settings. Multer retains a bounded hard ceiling, and uploaded images rejected by the configured limit are removed from Cloudinary or local storage before HTTP 413 is returned.
- Allowed-country and tax-inclusive defaults are public typed policy metadata for checkout consumers. Their use as global overrides remains intentionally deferred because existing tenant checkout/tax behavior is tenant-specific and changing it without an explicit precedence model would break working stores.
- Document and video limits are registered but are not presented as enforced: StoreKit currently has no generic document or video upload route. They must be connected when such routes are introduced.

### Privacy behavior

- The HTML shell creates only a local Meta queue; it does not prefetch or download Meta/Google tracking origins.
- GA4, GTM, Meta Pixel, click-ID cookies, advanced matching, and pixel events are blocked until the customer selects **Allow analytics**.
- Choosing essential-only clears queued Meta events so activity collected before the choice cannot be replayed later.
- The public `essential_only` policy disables optional analytics entirely; `consent_required` displays an accessible preference dialog until a choice is stored.

### Validation

- Backend full suite before focused policy assertions: 154 passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Focused tests cover registry bounds, step-up/MFA enforcement declarations, password/session/upload runtime connections, eager tracker prevention, event consent gates, and queue clearing.

### Next increment

Add durable event-driven notification automation for trial expiry, payment failure, suspension, and operational/deployment events; then complete cross-module search/command navigation, accessibility/responsive hardening, and the final requirement-by-requirement production-readiness report.

## Increment 17 — Event-Driven Notification Automation

Status: implemented and validated on 2026-07-18.

### Summary

Converted lifecycle notification labels into executable, persisted automation policies. Trial-ending and payment-deadline scans, manual and automatic suspension events, and deployment-complete system events now enter the existing durable queue through deterministic idempotency keys. Billing no longer sends reminder email inline.

### Files added

- `backend/models/PlatformNotificationAutomation.js`

### Files modified

- `backend/services/platformNotificationService.js`
- `backend/services/subscriptionService.js`
- `backend/routes/superadmin/notificationsCenter.js`
- `backend/tests/billingLifecycle.test.js`
- `backend/tests/notificationsSupport.test.js`
- `frontend/src/pages/superadmin/SuperAdminNotificationsCenter.js`

### Automation contracts

- `trial_ending`: configurable 0–30 day offsets; defaults to 7, 3, and 1 days before `billing.trialEndsAt`.
- `payment_failed`: configurable 0–30 day offsets; defaults to 3 and 1 days before the grace deadline for past-due subscriptions.
- `tenant_suspended`: emitted after both Super Admin deactivation and automatic grace-period suspension.
- `deployment_complete`: explicitly records a validated deployment ID, environment, and version and delivers only to configured Slack and signed-webhook integrations.
- Each automation can be enabled/disabled, select valid channels, and bind an enabled channel-specific custom template. Built-in escaped copy is used when no custom template is assigned.

### Reliability and security

- Lifecycle scans use UTC calendar-day windows and deterministic occurrence keys. Repeated scheduler runs use MongoDB `$setOnInsert` against the unique delivery idempotency key and cannot create a second delivery.
- Notification scanning runs from both the billing lifecycle and delivery worker safely because all enqueue operations are idempotent.
- Provider sending remains in the queue worker with bounded attempts, exponential retry, stale-lock recovery, and dead-letter state.
- A notification outage is logged but never rolls back or blocks a tenant billing/suspension transition.
- Deployment triggers require `notifications.send`, recent MFA step-up, validated bounded input, and a platform audit event.
- Outbound webhook event types now preserve the automation event name and continue using the configured HMAC signature.

### UI and API changes

- Added `GET /api/superadmin/notifications-center/automations`.
- Added audited `PUT /api/superadmin/notifications-center/automations/:eventKey`.
- Added step-up-protected `POST /api/superadmin/notifications-center/automations/deployment_complete/trigger`.
- Notification Center now opens on an Automations tab with event toggles, lead-day editing, channel selection, custom template mapping, and deployment recording.

### Database and deployment

- MongoDB creates one new `platformnotificationautomations` collection with a unique `eventKey` index.
- Defaults are inserted idempotently on the first automation read or worker scan; no destructive data migration is required.
- Slack and notification-webhook automation channels require their corresponding encrypted Platform Integration configuration. Missing providers cause retry/dead-letter behavior, not lifecycle failure.

### Validation

- Focused notification and billing suites: 20 passed, 0 failed.
- Complete backend suite: 158 passed, 0 failed.
- Frontend optimized production build: compiled successfully.
- Git diff integrity and notification/billing route-module loading passed.

### Next increment

Implement unified Super Admin global search and keyboard command navigation backed by authorized cross-module APIs, then perform the accessibility/responsive/performance pass and final completion audit/report generation.

## Increment 18 — Authorized Global Search and Command Navigation

Status: implemented and validated on 2026-07-18.

### Summary

Added a permission-aware global search API and an accessible keyboard command palette. Operators can navigate every authorized Control Center module and search tenants, plans, platform users, support tickets, runtime flags, and audit events without leaking records from modules they cannot view.

### Files added

- `backend/routes/superadmin/search.js`
- `backend/tests/platformSearch.test.js`
- `frontend/src/components/superadmin/CommandPalette.js`

### Files modified

- `backend/routes/superadmin.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`
- `frontend/src/pages/superadmin/SuperAdminTenantWorkspace.js`
- `frontend/src/pages/superadmin/SuperAdminSupportCenter.js`
- `frontend/src/pages/superadmin/SuperAdminAccessControl.js`
- `frontend/src/pages/superadmin/SuperAdminFeatureFlags.js`
- `frontend/src/pages/superadmin/SuperAdminAudit.js`

### Search security and performance

- The API derives searchable collections exclusively from `req.platformPermissions`; it does not query unauthorized collections and therefore does not reveal result counts, titles, or identifiers across RBAC boundaries.
- Search terms are normalized, require at least two characters, are capped at eighty characters, and are regex escaped to eliminate expression injection and catastrophic user-supplied patterns.
- Every collection has an independent six/eight-result cap and a 1.5-second MongoDB execution ceiling. Queries execute concurrently and responses use `Cache-Control: no-store`.
- Only selected display fields are returned. Passwords, MFA state, tokens, secrets, ticket messages, audit changes, and other sensitive record bodies are excluded.
- Client requests are debounced for 220 ms and cancelled through `AbortController` when the query changes or the palette closes.

### Navigation and accessibility

- Ctrl+K and Command+K toggle the palette from anywhere in Super Admin; the persistent header button provides a pointer/touch alternative.
- The palette implements modal dialog, combobox, listbox, option, active-descendant, selected-option, and live-status semantics.
- Arrow Up/Down changes selection, Enter opens it, Escape closes it, clicking outside closes it, and focus moves to the search field when opened.
- Navigation commands are filtered from the same permission-filtered tab catalog as the sidebar.
- Search results deep-link to the selected tenant workspace, platform operator details, support ticket conversation, runtime flag editor, or audit correlation filter. Plan results open plan management.

### API changes

- Added authenticated `GET /api/superadmin/search?q=...` under the existing Super Admin authentication, MFA-enrollment, and dynamic-permission middleware chain.

### Validation

- The RBAC regression test replaces every model query and proves a `tenant.view`-only operator executes only the tenant query.
- Tests verify escaped search semantics, response cache policy, input/result/database-time bounds, keyboard behavior declarations, accessibility roles, cancellation, and deep-link construction.
- Complete backend suite: 160 passed, 0 failed.
- Frontend optimized production build: compiled successfully with no warnings.
- Search module load and Git diff integrity checks passed.

### Next increment

Perform the cross-module accessibility, responsive-layout, and frontend performance audit; correct verified defects; then generate the final requirement matrix and complete production-readiness documentation with explicit evidence and remaining external deployment dependencies.

## Increment 19 — Accessibility, Responsive, and Frontend Performance Hardening

Status: implemented and source/build validated on 2026-07-18. Rendered browser verification remains pending because no browser runtime was available to this session.

### Summary

Hardened the shared Control Center shell and high-risk workflows for keyboard and assistive-technology use, split enterprise modules into on-demand bundles, added resilient loading/error boundaries, and corrected verified small-screen form compression.

### Files added

- `frontend/src/hooks/useModalFocus.js`
- `frontend/src/components/superadmin/ModuleErrorBoundary.js`
- `backend/tests/superadminFrontendHardening.test.js`

### Files modified

- `frontend/src/components/superadmin/CommandPalette.js`
- `frontend/src/pages/superadmin/SuperAdminDashboard.js`
- `frontend/src/pages/superadmin/SuperAdminIntegrations.js`
- `frontend/src/pages/superadmin/SuperAdminFeatureFlags.js`
- `frontend/src/pages/superadmin/SuperAdminSupportCenter.js`

### Accessibility changes

- Added a keyboard-visible skip link targeting the focusable main content landmark.
- Added an explicitly named Control Center navigation landmark and complete mobile menu `aria-controls`/`aria-expanded` state.
- Replaced the click-only mobile backdrop with a named button.
- Added a reusable modal-focus controller that traps Tab/Shift+Tab, handles Escape, restores the invoking control, and locks background scrolling.
- Applied modal semantics and focus management to command search, encrypted integration configuration, and permanent tenant deletion.
- Added explicit names and autocomplete semantics to global search and names to ticket status, priority, assignee, reply, and knowledge-article controls.
- Existing global `:focus-visible` and reduced-motion styles remain active and were preserved.

### Responsive changes

- Feature-flag identity, targeting, entitlement, tenant, and schedule controls now collapse to a single column before the appropriate small-screen breakpoint.
- Knowledge article slug/category controls now collapse on narrow screens.
- Existing dense tables retain horizontal scroll containers, while tenant, support, operations, analytics, and integration workspaces use breakpoint-based column layouts.

### Performance and resilience

- Thirteen enterprise Super Admin modules now use `React.lazy` dynamic imports instead of entering one eager dashboard chunk.
- A shared Suspense status surface is displayed while the selected module downloads.
- A module error boundary prevents a chunk/render failure from blanking the entire Control Center and offers an explicit reload action while preserving work in other modules.
- The optimized build confirms the prior combined Super Admin module payload is separated into independent chunks; modules download only when navigated to.

### Validation

- Focused frontend hardening/search source gates: 6 passed, 0 failed.
- Complete backend/source-contract suite: 164 passed, 0 failed.
- Frontend optimized production build: compiled successfully with no warnings.
- Git diff integrity passed.
- Both local services were listening on ports 3000 and 5001. The required in-app browser discovery returned no available browser runtime, so visual viewport checks, live focus traversal, and automated rendered accessibility scans were not performed and are not claimed as evidence.

### Next increment

Execute the final requirement-by-requirement completion audit and generate the complete architecture, database, permission, feature, API, UI, migration, deployment, security, performance, testing, scoring, and remaining-dependency report. Any missing requirement discovered by that audit remains implementation work rather than being marked complete by documentation alone.
## Increment 20 — secure tenant impersonation

- Added an MFA step-up and `tenant.impersonate` protected endpoint that can only target the active owner administrator of an active, non-archived tenant.
- Impersonation creates a dedicated, revocable 15-minute authentication session. It records the initiating platform operator, required reason, target, expiry, client context, authentication event, and persistent audit event without changing either user account.
- Added tenant-workspace launch control and an always-visible tenant-admin warning with a one-click return to the original platform session. The original session is retained only in the initiating browser tab.
- Database change: `AuthSession` accepts the `impersonation` authentication method and stores `impersonatedBy` plus `impersonationReason`; Mongoose creates the supporting sparse-style index through normal index synchronization.
- Migration: no document rewrite is required. Deploy the backend before exposing the frontend control.
- Testing: source-level security regression coverage was added in `backend/tests/tenantImpersonation.test.js`.
## Increment 21 — enforceable network security policy

- Added persistent exact IPv4/IPv6 and IPv4 CIDR block rules with canonical validation, optional automatic expiry, bounded runtime caching, asynchronous hit counters, and last-match telemetry.
- Installed the firewall globally before request body parsing. Blocked requests receive a non-cacheable generic denial containing the correlation ID; the health probe remains available to infrastructure monitoring.
- Added self-lockout prevention, duplicate-rule rejection, one-year maximum expiry, dynamic `security.view`/`security.manage` permissions, recent MFA step-up for mutations, and persistent audit events.
- Expanded Security Center with rule creation, active-rule inventory, hit/expiry visibility, and controlled disable actions. The posture assessment now proves the network policy engine is installed.
- Database change: new `PlatformSecurityRule` collection and indexes. No existing documents are rewritten.
- Migration: deploy backend first and allow Mongoose index synchronization (or create the declared indexes through the normal production index migration process), then deploy frontend.
- Testing: exact/CIDR matching, canonicalization, invalid input, global middleware mounting, RBAC/MFA, audit, self-lockout, denial response, and health exemption are covered by `backend/tests/platformFirewall.test.js`.
## Increment 22 — tenant-isolated backup and platform disaster recovery

- Closed a critical cross-tenant defect in the legacy Backup Center: tenant administrators previously used a platform-wide archive/restore service whose restore loop deleted entire collections. Tenant operations now create, list, verify, restore, retain, and delete only records belonging to the authenticated tenant.
- Added an explicit tenant recovery registry. Store data is recoverable while SaaS billing, platform support, audit/notes, feature exposure, webhook, and authentication-session records remain under platform ownership and cannot be rewound by a tenant administrator.
- Tenant restore requires an exact tenant-and-backup-specific confirmation and waits for a tenant-scoped emergency backup to complete before replacing data.
- Removed tenant access to global Google OAuth tokens, connection controls, schedules, account identity, and quota. Tenant APIs expose only redacted platform-managed storage state and that tenant's aggregate backup usage.
- Added a separate Super Admin platform recovery API and UI using `infrastructure.view/manage`, MFA step-up, exact platform confirmation, completed emergency snapshots, checksum verification, storage deletion consistency, and persistent audit events.
- Platform restore preserves the backup registry/storage credentials, then invalidates every JWT token version and revokes every recorded session to prevent restored credentials or sessions remaining active.
- Database change: `Backup` gains `scope` and indexed `tenantId`. Legacy records with no scope remain recognized as platform recovery points. No destructive migration is required.
- Migration: deploy backend before frontend. Existing legacy platform backups remain platform-only. Run normal production index synchronization for `{tenantId, createdAt}` and validate a tenant backup plus restore in isolated staging before enabling the plan feature.
- Testing: tenant registry boundaries, route scoping, secret redaction, confirmation gates, platform RBAC/MFA, emergency recovery, audit, registry protection, and post-restore session invalidation are covered in `backend/tests/backupIsolation.test.js`.
## Increment 23 — encrypted recovery archives and key rotation support

- New tenant and platform recovery points are compressed and then encrypted with AES-256-GCM before leaving the application. The stored SHA-256 checksum covers ciphertext, while the GCM authentication tag proves confidentiality and integrity during verify/restore.
- Backup records contain only non-secret cryptographic metadata: format version, algorithm, key ID, IV, and authentication tag. Encryption keys never enter MongoDB, archives, responses, or logs.
- Supports a dedicated active `BACKUP_ENCRYPTION_KEY`/`BACKUP_ENCRYPTION_KEY_ID`, a JSON `BACKUP_ENCRYPTION_KEYS` keyring retaining prior versions for recovery, and a safe fallback to the existing platform-secrets key. Key material must contain at least 32 characters and is SHA-256 derived to 256 bits.
- Creation fails closed when encryption is unavailable. Restore selects the recorded key version and authenticates/decrypts before parsing or modifying any collection. Tampering or retired-key absence aborts recovery.
- Existing `.gz` recovery points remain readable as legacy unencrypted records; all newly created artifacts use the `.skbak` binary format and `application/octet-stream`.
- Database change: `Backup.encryption` metadata fields. No rewrite is required.
- Deployment: configure and durably escrow the active key before enabling backups. During rotation, add both old and new keys to `BACKUP_ENCRYPTION_KEYS`, switch `BACKUP_ENCRYPTION_KEY_ID`, create and verify a new recovery point, and retain old material through the legacy retention window.
- Testing: key derivation, encryption/decryption, GCM tamper rejection, encrypted upload format, and encrypted verify/restore paths are covered in `backend/tests/backupIsolation.test.js`.
## Increment 24 — acquisition economics, sequenced funnels, and activity heatmaps

- Added an indexed `AcquisitionCost` ledger with source, campaign, incurred date, currency, amount, external reference, notes, and operator attribution. Entries support list/create/update/delete with `analytics.view/manage`, MFA step-up for mutations, validation, duplicate external-reference prevention, and persistent old/new audit evidence.
- CAC is now calculated from authoritative inputs: acquisition spend divided by tenants whose first paid subscription invoice occurred inside the selected range. Spend, acquired tenants, CAC, LTV, MRR, and ARR remain separated by currency; missing spend or conversions produces an explicit insufficient-data state rather than a fabricated number.
- Added a privacy-preserving storefront commerce funnel. A customer enters only after a consented product-view event, advances only when their subsequent identified order occurs, and reaches paid only when a paid order follows. Guest orders are deliberately excluded because StoreKit cannot safely join them to consented identities.
- Added a UTC day/hour activity heatmap and source/campaign aggregates from consented behavior events. APIs return only aggregate counts and never customer identities.
- Expanded Platform Analytics UI with live CAC cards, methodology, sequenced funnel conversion, an accessible activity heatmap, and an auditable acquisition-cost entry/ledger workflow.
- Permission change: new dynamic `analytics.manage`; registry synchronization seeds it without hardcoded role changes. Assign it only to finance/growth operators who may change spend records.
- Database change: new `AcquisitionCost` collection with date/currency/source and unique sparse external-reference indexes. No existing data migration is required; CAC stays unavailable until real spend is entered.
- Testing: deterministic CAC behavior, first-paid methodology, ordered funnel sequencing, aggregate heatmap, permission separation, MFA, and audit coverage are in `backend/tests/platformAnalytics.test.js`.
## Increment 25 — attested geo blocking and origin-bypass protection

- Extended persistent security rules with two-letter ISO country blocks, automatic expiry, hit telemetry, dynamic `security.view/manage`, recent MFA step-up, audit evidence, duplicate prevention, and current-country self-lockout prevention.
- Country metadata is accepted only from the deployment-configured `TRUSTED_GEO_HEADER` when the same request contains a constant-time verified `X-StoreKit-Edge-Secret` matching `TRUSTED_EDGE_PROXY_SECRET`. Arbitrary client country headers are ignored.
- The API refuses to create geo rules unless the current Control Center request is both attested and contains a valid detected country. This prevents operators enabling a control that the deployed edge cannot enforce.
- While any country rule is active, ordinary traffic that bypasses the trusted edge is denied with `EDGE_ATTESTATION_REQUIRED`. Exact signature-verified payment webhook endpoints and infrastructure health remain directly reachable so provider callbacks and probes continue operating.
- Security Center now reports edge readiness/current detected country, disables geo controls until the trust chain is proven, and provides country-rule inventory and disable actions.
- Deployment: configure the same random 32+ character secret at the trusted edge and Railway, inject it only in edge-to-origin requests, configure the edge-provided ISO country header name, verify the Security Center reports `Trusted edge verified`, then create a short-lived test rule for a country other than the operator's current country.
- Testing: ISO validation, valid/spoofed attestation, constant-time comparison, fail-closed direct-origin enforcement, creation readiness, RBAC/MFA, and audit paths are covered in `backend/tests/platformFirewall.test.js`.

## Increment 26 — versioned JWT signing-key rotation

- Replaced single-secret token signing and verification with a shared HS256 keyring used by standard authentication, MFA challenges, tenant context, and optional authenticated checkout identity.
- New tokens include the active non-secret `kid`. Verification selects only that declared key, rejects unknown key IDs, and restricts accepted algorithms to HS256 to prevent algorithm confusion or key-search fallback.
- Rotation is non-disruptive: `JWT_SIGNING_KEYS` may retain old verification keys while `JWT_SIGNING_KEY_ID` selects the only signing key. Existing tokens without a `kid` continue to verify through `JWT_SECRET` during the migration window.
- Weak keys, malformed JSON, invalid key IDs, and active IDs absent from the keyring fail closed. Signing material remains deployment-managed and is never stored in MongoDB, logged, or returned by an API.
- Security Center reports only the active key ID, verification-key count, legacy migration state, configuration errors, and rotation readiness. The environment example documents a safe add/switch/retain/retire rollout.
- Database change: none. Migration: deploy with the current `JWT_SECRET`; add old and new 32+ character values to `JWT_SIGNING_KEYS`; set the new `JWT_SIGNING_KEY_ID`; retain old keys for the maximum token/session lifetime; then remove retired keys. Remove `JWT_SECRET` only after all no-`kid` tokens have expired.
- Testing: active-key signing, retained-key verification, legacy compatibility, unknown-key rejection, weak-key rejection, and full authentication regression coverage are in `backend/tests/jwtKeyring.test.js` and the complete suite. Validation: 177 backend tests passed, 0 failed; optimized frontend production build compiled successfully without warnings.

## Increment 27 — infrastructure capability truth and master readiness audit

- Expanded durable metric snapshots with filesystem capacity/free-space/usage data and made disk utilization available to the existing consecutive-sample alert engine.
- Added live scheduler state for subscription billing and platform backups alongside social publishing and the persistent notification worker. The Operations UI now distinguishes a stopped worker from one that merely has no recent job record.
- Added non-secret runtime capability reporting for the MongoDB-backed durable queue, process-local cache behavior, Redis configuration/support state, and email provider readiness. A configured `REDIS_URL` is explicitly reported unsupported until a real client/distributed cache is implemented; it is never presented as healthy by configuration alone.
- Added deployment identity using only provider, environment, deployment/service identifiers, commit SHA, and region. Environment variables, connection strings, credentials, and secrets are never enumerated or returned.
- Expanded the Operations dependency UI with disk, queue/cache/Redis/SMTP, scheduler/worker, deployment, database, and integration status. Existing alert, error, metric, and job workflows remain intact.
- Added `docs/SUPER_ADMIN_MASTER_READINESS.md`, a source-backed master requirement matrix with architecture, data domains, permissions, API modules, capability states, explicit remaining product gaps, and mandatory production gates. It deliberately distinguishes implementation from external setup and deployment proof.
- Database change: additive optional `MetricSnapshot.disk` fields; old snapshots remain readable and expire through the existing 90-day TTL. No document migration is required.
- Testing: runtime capability redaction, disk probing, alert allowlisting, and scheduler health contracts are covered in `backend/tests/operationsMonitoring.test.js`.
- Validation: complete backend suite 178 passed, 0 failed; optimized frontend production build compiled successfully without warnings. Runtime mail verification still reports that neither Resend nor SMTP environment credentials are configured, so delivery readiness is not claimed.

## Increment 28 — managed application firewall kill switches

- Extended persistent platform security rules with method-aware API path blocks. Operators can disable one exact endpoint or an explicit trailing-prefix surface during an incident without deploying code.
- Route policy syntax is deliberately non-regex and bounded: supported HTTP method or any method plus a clean `/api/...` exact path or single trailing `/*`. Query strings, traversal, ambiguous wildcards, unsupported methods, oversized values, and malformed paths are rejected.
- Health probes, Stripe/PayHere callbacks, and the complete authenticated Super Admin recovery surface cannot be covered by a managed route rule. The invariant is enforced both when rules are created and at request evaluation, protecting recovery even from a malformed record inserted directly into MongoDB.
- Rules reuse dynamic `security.manage`, recent MFA step-up, persistent audit evidence, expiry, duplicate prevention, bounded runtime cache, asynchronous hit counters, last match time/IP/path, and non-cacheable generic denials with correlation IDs.
- Security Center now includes an application-firewall kill-switch form and active-rule inventory, while network and country inventories remain distinct and unchanged.
- Database change: `PlatformSecurityRule.kind` accepts `route_block`, `value` expands to 600 characters, and `lastMatchedPath` is additive. No rewrite is required; deploy the backend before the frontend and run normal index/schema synchronization.
- Testing: method/exact/prefix matching, invalid syntax, protected recovery/callback paths, schema support, global enforcement, RBAC/MFA, audit contracts, and denial behavior are covered in `backend/tests/platformFirewall.test.js`.
- Validation: complete backend suite 179 passed, 0 failed; optimized frontend production build compiled successfully without warnings.

## Increment 29 — persisted tenant administration views

- Added operator-owned, database-backed saved views to the Tenant Workspace. A platform operator can save the current tenant search/status/archive configuration, reapply it across sessions, select exactly one default, and delete obsolete views.
- Saved state is server allowlisted and normalized; arbitrary query operators, columns, render state, or unknown filters are discarded. Names, search values, enum filters, and per-operator count are bounded.
- Every query and mutation includes the authenticated `ownerId` plus fixed `tenant_workspace` module, preventing operators from reading, changing, defaulting, or deleting another operator's views.
- Case-normalized names are unique per operator/module. A partial unique index guarantees at most one default even under concurrent requests; mutation conflicts return explicit refresh/retry guidance.
- View creation/default/deletion uses dynamic tenant permissions and persistent audit actions with bounded state evidence. Existing tenant filters, debounced fetching, selection, detail workflows, and pagination remain unchanged.
- Database change: new `PlatformSavedView` collection with owner/module/name uniqueness and one-default partial unique index. No existing documents are modified. Deploy backend and synchronize indexes before exposing the frontend controls.
- Testing: allowlisted normalization, injection-state exclusion, schema/index invariants, ownership filters, count bound, permissions, audit actions, and UI wiring are covered in `backend/tests/tenantWorkspace.test.js`.
- Validation: complete backend suite 181 passed, 0 failed; optimized frontend production build compiled successfully without warnings.

## Increment 30 — authenticated realtime support

- Upgraded persisted tenant support conversations to authenticated realtime Server-Sent Events for both tenant administrators and platform support operators. Both UIs expose connection/reconnect state and refetch authoritative ticket data after committed events.
- Realtime delivery is based on bounded MongoDB polling rather than process-only events. Every application replica observes committed `SupportMessage` and `SupportTicket` changes, so a client connected to one replica receives a write handled by another without requiring Redis pub/sub.
- Tenant streams are derived from authenticated tenant context. Event visibility rejects every other tenant and all `internal_note` messages; platform streams require dynamic `support.view` and may observe the full support queue.
- Connections are limited to 500 per instance and three per authenticated user, emit 15-second heartbeats, disable proxy compression/buffering, use no-store semantics, clean up on disconnect, and stop the database poller when idle.
- The reusable frontend stream hook sends the bearer token and tenant domain through `fetch`, parses bounded SSE frames, aborts on unmount, and reconnects with capped exponential backoff. Event bodies contain only resource IDs/type/timestamps; UIs fetch permission-filtered records rather than trusting streamed record data.
- Operations dependency telemetry reports the SSE/Mongo polling backend, connection count, and capacity. This implementation provides authenticated tenant-admin live support; it does not claim an anonymous public storefront chat widget.
- Database change: none. Existing timestamped ticket/message indexes and records are reused. Deployment proxies must permit long-lived `text/event-stream` responses and disable buffering; load-test connection limits before scaling replicas.
- Testing: tenant isolation, internal-note exclusion, platform visibility, endpoint authentication, connection limits, heartbeat transport, durable model polling, compression bypass, authorization headers, abort cleanup, and reconnect bounds are covered in `backend/tests/notificationsSupport.test.js`.
- Validation: complete backend suite 183 passed, 0 failed; optimized frontend production build compiled successfully without warnings. Long-lived connection behavior still requires deployment-proxy and multi-browser staging validation.

## Increment 31 — generated platform SDK packages

- Extracted the external Platform API OpenAPI 3.0 contract into `backend/config/platformOpenApi.js`, making endpoint operation IDs, security scheme, version, parameters, and responses authoritative for documentation and generated clients.
- Added on-demand JavaScript and Python SDK ZIP generation. Every archive includes the matching OpenAPI document, installation metadata, README usage, a reusable client, convenience methods for every supported platform endpoint, timeouts, bearer authentication, request IDs, structured errors, and correlation IDs.
- JavaScript output is an ES module for Node.js 18+ or modern browsers using an injectable Fetch implementation and abort-based timeouts. Python output supports 3.9+ using only the standard library, including structured HTTP/connection failures.
- SDK constructors require callers to supply both API key and base URL. Generated artifacts never contain a key, hash pepper, deployment secret, tenant identity, or hardcoded production host. Documentation directs developers to environment/secret-manager configuration and warns against browser-bundled live keys.
- Added private no-store `GET /api/superadmin/developer/sdk/:language.zip`, protected by dynamic `developer.view`, with a fixed allowlist (`javascript`, `python`), bounded generated files, versioned filenames, and correct archive response metadata.
- Developer Center now has an SDK module for downloading both language packages. Existing API key, usage, webhook, health, sandbox, and OpenAPI modules remain intact.
- Database change: none. Deployment migration: none. Optional npm/PyPI publishing remains an external release-management task; the Control Center packages are immediately usable without registry publication.
- Testing: shared-contract version/operation IDs, actual JavaScript module parsing, Python interpreter compilation, package metadata, ZIP contents, unsupported-language rejection, endpoint permissions, UI wiring, and generated-artifact secret scanning are covered by `backend/tests/developerCenter.test.js` plus the explicit Python compilation validation.
- Validation: complete backend suite 185 passed, 0 failed; optimized frontend production build compiled successfully without warnings; generated Python client compiled successfully with the local Python 3 interpreter.

## Increment 32 — accessible resizable tables and queue virtualization

- Added reusable dependency-free `ResizableHeader`/`useResizableColumns` primitives. Column widths are clamped from 80–800 pixels, persisted locally per table, restored safely from bounded JSON, and resettable without changing server queries or records.
- Resize handles support mouse drag and keyboard operation through focusable ARIA separators. Left/Right adjust in ten-pixel steps, Home restores a practical baseline, and current/min/max values are exposed to assistive technology.
- Applied persisted resizing to the Developer Center API-usage table, including fixed-layout column geometry, horizontal overflow, truncated cells with full-value titles, and an explicit reset action.
- Added a reusable fixed-row `VirtualList` with viewport math and five-row overscan. Applied it to the up-to-300-item platform support queue so DOM row count stays bounded while the complete permission-filtered result set and realtime update behavior remain available.
- Virtualized support entries retain list/listitem semantics, keyboard-focusable buttons, selected state styling, and full ticket selection behavior. No backend result, pagination, permission, or ordering semantics changed.
- Database/API changes: none. Width persistence is non-sensitive browser-local presentation state. No migration is required.
- Testing: virtualization slice/overscan contracts, real Support queue integration, ARIA list semantics, separator roles/ranges, keyboard resize controls, persistence, Developer table integration, and reset controls are covered in `backend/tests/superadminFrontendHardening.test.js`.
- Validation: complete backend/source-contract suite 186 passed, 0 failed; optimized frontend production build compiled successfully without warnings.

## Increment 33 — managed cryptographic-key lifecycle

- Added versioned AES-256-GCM keyring support for encrypted platform integration credentials and TOTP seeds. New payloads record a non-secret key ID; legacy payloads without one continue using the retained legacy key during migration.
- Platform-secret status now reports only configuration validity, active ID, retained IDs/count, and rotation readiness. JWT and backup status use the same non-secret lifecycle shape; no key value, derivative, length, fingerprint, environment dump, or encrypted payload enters an API response.
- Added an append-only `CryptographicKeyAttestation` ledger for deployed, verified, and retired lifecycle evidence, including environment, deployment ID, bounded notes, operator and immutable timestamp.
- Added a Security Center inventory that joins runtime key IDs, protected record/archive reference counts and the latest attestation. It covers JWT signing tokens, backup archives, encrypted provider secrets and MFA factors.
- Added an MFA-stepped-up migration that re-encrypts every integration credential and MFA seed from a retained platform-secret key to the active key. It is idempotent and reports migrated/remaining counts; the old key must remain configured throughout any partial failure/retry.
- Retirement attestation fails while a key is active, still present in the runtime keyring, or still protects any tracked record/archive. Exact retirement confirmation, dynamic `security.manage`, recent MFA and persistent audit evidence are mandatory.
- Key material remains controlled by Railway or the deployment secret manager. The UI manages evidence and safe data migration, not secret values; this avoids placing root cryptographic material in MongoDB or browser memory.
- Database change: additive append-only `CryptographicKeyAttestation` collection and key-purpose/time indexes. Existing encrypted payloads need no immediate rewrite. Deploy code with the legacy key, add a two-key JSON keyring, select the new active ID, migrate, confirm zero references, remove the old runtime key, then attest retirement.
- Testing: new/retained/legacy decrypt behavior, active key selection, weak/missing key failure, secret-free attestation schema, immutable evidence, lifecycle RBAC/MFA/confirmations/audit, retirement reference guards, migration encryption path and UI custody language are covered in `backend/tests/cryptographicKeyLifecycle.test.js` plus integration/MFA/backup regression suites.
- Validation: complete backend/source-contract suite 190 passed, 0 failed; optimized frontend production build compiled successfully. Runtime verification still reports that neither Resend nor SMTP credentials are configured, so outbound email delivery remains an explicit deployment gate.

## Increment 34 — privacy-preserving feature experiment outcomes

- Added real commerce outcome analysis for runtime flag variants. An assignment converts only when its tenant receives a paid order after the tenant's first exposure to that flag version inside the selected window.
- Preserved StoreKit's privacy boundary: pseudonymous exposure subject hashes are never joined to customer or guest identities. Analysis operates at tenant level and returns only aggregate assignment/conversion counts.
- Excludes a tenant from a flag version when it was exposed to more than one variant, preventing an outcome from being credited across contaminated arms. Results disclose the number of excluded tenants.
- Added Wilson 95% confidence intervals, configured/control-arm selection and relative lift. Arms below 100 uncontaminated tenant assignments are explicitly labeled insufficient; larger samples remain descriptive/directional and never claim causation or a statistically proven winner.
- Added permissioned `GET /api/superadmin/runtime-flags/analytics/experiments?days=30`, bounded to 1–180 days and protected by dynamic `featureflags.view`.
- Feature Flags UI now presents conversion rate, numerator/denominator, confidence interval, lift, contamination and evidence state alongside raw exposure analytics.
- Database change: additive compound `FeatureFlagExposure` index on flag/version/tenant/variant/time. No document rewrite is required; synchronize indexes before enabling the analytics endpoint on a high-volume deployment.
- Performance architecture: the attribution join uses tenant ID, first-exposure time and paid status against existing order tenant/payment/time indexes; capture an explain plan with production-shaped data before launch.
- Testing: deterministic interval behavior, control/lift calculation, sample guardrails, RBAC, tenant/temporal matching, paid-only conversion, contamination exclusion, privacy language and UI evidence are covered in `backend/tests/featureFlagExperiments.test.js` and runtime flag regressions.
- Validation: complete backend/source-contract suite 193 passed, 0 failed; optimized frontend production build compiled successfully. Email provider verification continues to report missing Resend/SMTP credentials and remains an external deployment gate.

## Increment 35 — encrypted Anthropic provider integration

- Added Anthropic to the existing platform integration registry under the AI category. It supports an optional model identifier plus a write-only API key sourced from encrypted database configuration or the deployment environment fallback.
- Reused the versioned AES-256-GCM platform-secret keyring, redacted public integration shape, dynamic `infrastructure.view/manage`, recent-MFA configuration updates and persistent audit evidence. No new plaintext credential path was introduced.
- Added a bounded remote credential test against Anthropic's models-list endpoint with a one-record limit, fixed API version header, ten-second timeout and redirects disabled. The test never invokes message generation or sends tenant/customer content.
- The registry-driven Integration Center automatically exposes configuration status, secret source, enabled state, last test, remote health and the existing accessible configuration dialog. No placeholder or provider-specific mock UI was added.
- Strengthened health-test error sanitization across all providers. Bearer credentials, Anthropic key shapes, credential query parameters and common secret assignment formats are removed before persistence, audit-adjacent metadata or API responses.
- This integration does not restore the removed AI social-post creation feature and is not wired to any content-generation workflow.
- Database/API changes: none. Existing `PlatformIntegration` documents and Super Admin integration endpoints are reused. Environment examples now document `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`; encrypted Control Center storage is preferred.
- Deployment: configure a least-privilege Anthropic key, save/enable the integration, run the remote test from staging, verify egress/DNS and review the persisted redacted result. Provider usage, budgets and model allowlisting remain operational responsibilities.
- Testing: registry shape, encrypted-secret routing, fixed credential endpoint/headers, bounded request behavior, absence of message generation and multi-shape error redaction are covered in `backend/tests/platformIntegrations.test.js` plus cryptographic lifecycle regressions.
- Validation: complete backend/source-contract suite 195 passed, 0 failed; optimized frontend production build compiled successfully. No live Anthropic request was made because credentials are not configured locally; staging remote verification remains mandatory.

## Increment 36 — conflict-safe tenant inline metadata editing

- Added permission-aware inline editing to Tenant Workspace directory rows for store name and management tags. Operators can edit, save or cancel in context without leaving the portfolio view; view-only operators do not receive the edit affordance.
- Deliberately excludes tenant status, subscription, billing, ownership, archive and deletion from the generic editor. Those fields retain their dedicated validated, stepped-up or confirmation-based lifecycle workflows.
- Added `PUT /api/superadmin/tenant-workspace/:id/metadata`, protected by dynamic `tenant.edit`. The request allowlists only `storeName` and `tags`, normalizes whitespace/tags, bounds names to 2–120 characters and requires an `expectedUpdatedAt` concurrency token.
- The update uses tenant ID plus the expected timestamp in both the read and atomic write filter. A stale row returns HTTP 409 and refreshes the directory instead of silently overwriting another operator or tenant-admin change.
- Successful writes persist old/new store name and tags, exact changed fields, actor, resource, endpoint, outcome, duration and correlation evidence through the existing platform audit middleware.
- The UI uses semantic forms and labels, autofocus, keyboard-native controls, explicit save/cancel states, disabled saving controls, success feedback and conflict/error announcements through the existing notification system.
- Database change: none. Existing Tenant timestamps and management tags are reused. API change is additive and does not modify current tag, archive, owner, suspension, billing or deletion routes.
- Migration: none. Deploy backend before frontend. Existing rows already contain Mongoose `updatedAt`; records without it must be touched by the normal migration/index synchronization process before inline editing.
- Testing: allowlist validation, name/tag normalization, timestamp requirement, lifecycle-field exclusion, atomic timestamp filters, conflict responses, dynamic RBAC, audit evidence, UI permission gating, accessibility labels and refresh-on-conflict are covered in `backend/tests/tenantWorkspace.test.js` plus frontend hardening regressions.
- Validation: complete backend/source-contract suite 197 passed, 0 failed; optimized frontend production build compiled successfully. Rendered multi-operator conflict testing and real-browser accessibility QA remain staging gates.

## Increment 37 — complete evidence-backed implementation report

- Added `docs/SUPER_ADMIN_COMPLETE_IMPLEMENTATION_REPORT.md` as the consolidated final handoff artifact requested by the master brief.
- Added Mermaid architecture and database relationship diagrams with explicit platform, tenant, session, RBAC, audit, worker, provider and key-custody boundaries.
- Added source-derived inventories covering 161 private Super Admin endpoint declarations across 16 route sources, 61 model files, 42 dynamic permissions in 15 groups, 20 permission-filtered modules, 18 dedicated page files and 32 backend test files.
- Added a complete UI screen inventory, dynamic permission matrix, capability matrix and per-module API declaration inventory, while distinguishing source presence from deployed reachability.
- Added deployment notes and explicit security, performance and testing checklists that show implemented controls beside missing staging/production proof.
- Added reproducible weighted scoring: production readiness is 69/100 and results in a conditional hold; code quality is 84/100. Scores are risk-tracking rubrics, not certification or a guarantee.
- Added remaining recommendations and a release decision tied to provider configuration, key/restore drills, index/query plans, browser accessibility, load/soak, SLO/on-call and live SEO/provider evidence.
- Added `backend/tests/superadminFinalReport.test.js` to enforce required final-artifact headings, Mermaid diagrams, source-synchronized route/model/permission/page/test counts, score arithmetic and non-approval language. The test immediately identified and corrected an initial permission-count discrepancy.
- Database/API/UI changes: none. This increment documents and mechanically verifies the implemented system without altering runtime behavior.
- Validation: complete backend/source-contract suite 200 passed, 0 failed; optimized frontend production build compiled successfully. Runtime mail verification continues to report missing Resend/SMTP credentials, which remains an explicit deployment gate and is reflected in the 69/100 readiness score.

## Increment 38 — automated Meta Ads acquisition-spend reconciliation

- Added a separate `meta-ads` Integration Center provider so Ads Insights `ads_read` credentials are not conflated with Meta Conversions API delivery credentials. The account ID and explicit Graph API version are non-secret configuration; the access token uses the versioned AES-256-GCM platform-secret keyring or deployment environment fallback.
- Added a real bounded health check against the configured ad account using a fixed `graph.facebook.com` host, validated numeric account ID/version, bearer header authentication, ten-second timeout and redirects disabled.
- Added `acquisitionSyncService` to retrieve account currency and daily campaign-level spend. Requests use a fixed host/path, 15–20 second timeouts, redirects disabled, a 500-row page, a maximum of 20 pages/10,000 rows and bounded opaque cursor reuse; arbitrary provider `next` URLs are never followed.
- Provider rows are normalized to non-future daily `AcquisitionCost` facts, rounded to currency precision and keyed as `meta-ads:<account>:<campaign>:<date>`. Duplicate response rows are collapsed before unordered bulk upsert. Repeated syncs reconcile amount/name/currency rather than double-counting spend.
- Added persistent non-secret sync status to `PlatformIntegration`: state, start/completion/next-eligible timestamps, redacted message and aggregate statistics. API/UI responses mask the ad account to its last four digits and never return the access token.
- Added an atomic cross-replica scheduler claim on provider/enabled/next-eligible state. The six-hour tracked job reconciles the latest seven days, attributes imported records to the integration's configuring operator, records durable `JobRun` results, retries failed claims after one hour and exposes scheduler health in Operations.
- Added `GET /api/superadmin/analytics/acquisition-sync` with `analytics.view` and MFA-stepped-up `POST /api/superadmin/analytics/acquisition-sync/meta-ads` with `analytics.manage`. Manual runs are tracked and persist bounded audit statistics without credentials or raw provider payloads.
- Analytics UI now shows masked configuration, last sync state/message/time and a seven-day reconciliation action. Manual ledger forms, deletion and provider sync controls are hidden from operators without `analytics.manage`; backend permissions remain authoritative.
- Database change: additive optional `PlatformIntegration.lastSync` metadata and compound provider/enabled/next-eligible index. Existing integration and acquisition documents remain valid. No destructive rewrite is required.
- Deployment: deploy backend and synchronize indexes before frontend; configure a Meta system-user token with least-privilege `ads_read`, numeric account ID and an explicitly supported Graph API version; run the Integration Center health check; perform a manual seven-day sync; reconcile totals/currency against Ads Manager; then allow the scheduler. Rotate/disable the token through existing key lifecycle controls.
- Testing: configuration/window bounds, deterministic normalization/reference keys, fixed-host/redirect/pagination limits, encrypted registry routing, bulk-upsert idempotency, duplicate collapse, atomic scheduler claims/failure recovery, tracked jobs, startup/Operations health, RBAC/MFA/audit, UI permission gating and secret-free status are covered in `backend/tests/acquisitionSync.test.js` plus analytics/integration/operations regressions.
- Validation: complete backend/source-contract suite 205 passed, 0 failed; optimized frontend production build compiled successfully. No live Meta API call was made without credentials, so health, spend totals, token permissions and scheduler execution still require the documented staging reconciliation.

## Increment 39 — privacy-safe storefront click heatmaps

- Added explicit, signed-in customer click capture for storefront interactive elements. Collection requires both customer marketing consent and accepted analytics-cookie consent, is throttled to one event per 750 milliseconds and capped at 60 events per browser session.
- Capture stores only a fixed page group, coarse viewport group and normalized document coordinates. It never sends DOM text, selectors, element identifiers, form values, query strings, raw URLs or raw pixel coordinates; sensitive elements can additionally opt out with `data-analytics-ignore="true"`.
- Added a consent revision to customer profiles and behavior events. Every event rechecks the same active revision after insertion, closing the consent-withdrawal race; withdrawing consent increments the revision and deletes that customer's prior behavior history for the tenant.
- Added a 180-day TTL index to behavior events plus page/time query indexes. Existing documents remain readable, but production must synchronize indexes and verify TTL/query behavior with production-shaped data before rollout.
- Added `GET /api/superadmin/analytics/click-heatmap`, protected by dynamic `analytics.view`, with bounded 1–90 day ranges, fixed page-group validation and optional validated tenant filtering.
- Server aggregation bins coordinates into a 20×20 grid and returns aggregate counts only. Cells representing fewer than three distinct customers are suppressed; customer identities and individual event records never enter the heatmap response.
- Analytics UI now renders an accessible page-group selector and aggregate grid with a clear privacy methodology and empty state when no cell reaches the disclosure threshold.
- API/UI changes are additive and preserve existing analytics, storefront and tenant-admin behavior. No new permission was needed because the endpoint inherits the existing `analytics.view` boundary.
- Testing: retention schema, consent revision/withdrawal behavior, capture bounds and payload exclusion, aggregate-only grouping, disclosure threshold, route RBAC/validation and UI integration are covered in `backend/tests/clickHeatmapPrivacy.test.js`.
- Validation: complete backend/source-contract suite 209 passed, 0 failed; optimized frontend production build compiled successfully. Legal/privacy review, deployed TTL/index proof and rendered cross-browser validation remain mandatory production gates.

## Increment 40 — encrypted Google Ads acquisition reconciliation

- Added a separate `google-ads` Integration Center provider for reporting. OAuth client ID, customer ID, optional manager login customer ID and an explicit API version are non-secret configuration; client secret, refresh token and developer token use the existing versioned AES-256-GCM secret store or deployment environment fallback.
- Added a fixed-host Google Ads client. Refresh-token exchange is restricted to `oauth2.googleapis.com`; reporting is restricted to `googleads.googleapis.com`, redirects are disabled, timeouts and request/response sizes are bounded, account identifiers are digit-normalized and API versions must be explicit.
- Remote health testing exchanges the configured grant and performs a read-only one-row customer query. It does not create or mutate campaigns, budgets, ads or account configuration.
- Added daily campaign spend retrieval using GAQL fields `customer.currency_code`, `campaign.id/name`, `segments.date` and `metrics.cost_micros`. The synchronization window is bounded to 1–90 days and the query requires positive cost.
- Cost micros are converted and rounded to currency units, invalid rows are rejected and deterministic references use `google-ads:<customer>:<campaign>:<date>`. Bulk upsert reconciles existing rows instead of double-counting repeated scheduler or manual runs.
- Extended the acquisition scheduler to claim and run Meta and Google providers independently. A failure in one provider is persisted in its integration/job state and does not prevent the other provider from being evaluated.
- Added permissioned status and recent-MFA manual synchronization endpoints for Google Ads. Mutations require `analytics.manage`, are tracked as durable jobs and persist bounded audit statistics without tokens or provider response bodies.
- Analytics UI now shows independent Meta and Google configuration/sync status and seven-day reconciliation actions. Operators without `analytics.manage` retain view-only status and ledger access.
- Strengthened provider-error sanitization for Google access tokens, client secrets, refresh tokens and developer tokens before messages can be persisted or returned.
- Database change: none. Google reuses `PlatformIntegration.lastSync` and `AcquisitionCost`; the existing provider/eligibility and external-reference indexes remain authoritative. Deploy backend before frontend and synchronize indexes normally.
- Deployment: create a dedicated read-only Google Ads OAuth grant, approve the developer token, configure the direct customer and optional manager IDs plus an explicitly supported API version, run the Integration Center health test, manually reconcile seven days against the Google Ads console, then observe a scheduled run before relying on CAC.
- Testing: configuration/account/version validation, fixed hosts, redirect/size limits, encrypted credential routing, read-only GAQL, micros conversion, deterministic references, idempotent reconciliation, scheduler independence, RBAC/MFA/audit, redaction and UI status/actions are covered by `backend/tests/googleAdsAcquisitionSync.test.js` plus existing acquisition/integration regressions.
- Validation: complete backend/source-contract suite 213 passed, 0 failed; optimized frontend production build compiled successfully. No live Google Ads request was made without configured credentials, so token approval, manager-account access, currency totals and scheduled reconciliation remain staging gates.

## Increment 41 — authoritative deployment lifecycle registry

- Replaced notification-derived deployment history with a durable `DeploymentRecord` lifecycle. Records are uniquely keyed by provider, external deployment ID and environment, retain bounded status history and capture service, version, commit, branch, HTTPS deployment URL, start/completion/duration and source attribution.
- Added strict lifecycle validation for queued, building, deploying, ready, failed, cancelled and rolled-back states. Terminal regressions are rejected, repeated status events are idempotent and optimistic status filters prevent a stale concurrent writer from overwriting a newer transition.
- Deployment inputs use bounded identifiers, 7–64 character hexadecimal commits, HTTPS-only URLs and timestamps limited to one year in the past or ten minutes in the future. Each history is capped at 50 events and records expire after 730 days.
- Added `deployments.read` and `deployments.write` developer scopes. CI/CD systems can record lifecycle events through the revocable, hashed, IP-allowlisted, rate-limited `/api/platform/v1/deployments/events` contract; sandbox keys remain unable to access production resources.
- API-key deployment mutations generate both metered `ApiUsageEvent` evidence and persistent redacted platform audit events containing the API-key ID/environment plus bounded deployment identifiers, never the bearer key.
- Versioned the authoritative Platform OpenAPI contract to 1.1.0 and added deployment read/write schemas and operations. Generated JavaScript and Python SDKs now expose list and record methods from the same source contract.
- Added permissioned Super Admin Operations deployment list and manual event API. Viewing requires `monitoring.view`; manual lifecycle mutation requires `monitoring.manage`, recent MFA and persistent audit evidence.
- The Operations UI now has a deployment section with history, source, timing and status. Manage-capable operators receive a lifecycle form; view-only operators do not receive mutation controls.
- Startup records the current Railway or Vercel deployment once when a deployment ID is available. The existing notification-completion action now writes a ready deployment record before queuing Slack/webhook notifications.
- The executive dashboard displays the five most recent authoritative deployments only for operators with `monitoring.view`, with a direct path to Operations.
- Database change: additive `DeploymentRecord` collection with unique provider/external/environment key, status/environment/time query indexes and a 730-day TTL. Synchronize indexes before CI integration. No existing deployment notification or tenant data is rewritten.
- Deployment order: backend and indexes first; create a least-privilege live API key with `deployments.write` and an IP allowlist; configure CI to send the same deployment ID through lifecycle transitions; verify audit, API usage and Operations history; then deploy the frontend. Preserve key rotation/revocation ownership.
- Testing: schema/index/retention, input bounds, transition guards, optimistic concurrency, developer scopes, sandbox isolation, OpenAPI/SDK synchronization, RBAC/MFA/audit, notification integration, runtime discovery and permission-gated UI are covered in `backend/tests/deploymentLifecycle.test.js` plus developer/operations/notification regressions.
- Validation: complete backend/source-contract suite 218 passed, 0 failed; optimized frontend production build compiled successfully. A live CI event sequence and provider-console reconciliation remain required staging evidence.

## Increment 42 — permission-aware versioned notification-template editing

- Refactored the dense Notification Center page into readable domain components while preserving automation configuration, campaign creation/publishing, template creation, delivery history/retry and deployment-completion notification behavior.
- Added capability-specific UI contracts from the Control Center shell. `notifications.view` remains sufficient to inspect the module; automation/template/campaign/retry controls require `notifications.manage`; publishing and deployment-completion notification controls require `notifications.send`.
- View-only operators no longer receive misleading mutation affordances. Automation inputs are disabled, create/edit/retry forms are absent and send controls are independently hidden, while the backend dynamic permissions remain authoritative.
- Added an inline template editor for name, locale, subject, body, allowlisted variables and enabled state with explicit edit, save and cancel modes. Channel/key identity remains immutable through this workflow.
- Strengthened the existing template update API with required `expectedVersion`, ObjectId validation and an atomic ID/version update filter. Concurrent edits return HTTP 409 instead of silently overwriting another operator's version.
- Each successful save increments the monotonic template version, validates every referenced variable against the allowlist, records old/new values, changed fields, expected/resulting versions, actor, endpoint, outcome, duration and correlation through platform audit.
- The client closes and reloads a stale editor after a 409 so the operator sees the authoritative new version before editing again.
- Fixed a permission-composition bug: optional tenant/plan picker reads now use settled requests. An operator with notification permission but without tenant or billing-directory permission can still load templates, automations, announcements and deliveries; unavailable picker datasets fail closed to empty lists.
- Database/API changes: no new collection or endpoint. `PlatformNotificationTemplate.version` is now enforced as an optimistic concurrency token by the existing update route. Existing rows already default to version 1; no destructive migration is needed.
- Deployment: deploy backend before frontend. No index change is required. Verify custom roles separately for view/manage/send, then run a two-browser stale-edit test and configured provider delivery test in staging.
- Testing: field/version bounds, dynamic permission, atomic version filtering, conflict response, audit metadata, inline save/cancel, capability separation and optional cross-module read failure are covered in `backend/tests/notificationTemplateEditing.test.js` plus notification/support regressions.
- Validation: complete backend/source-contract suite 223 passed, 0 failed; optimized frontend production build compiled successfully. Configured email/SMS/Slack/push delivery and rendered multi-operator conflict testing remain external staging gates.
