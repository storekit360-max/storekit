# StoreKit Super Admin — Phase 1 Audit

Date: 2026-07-18  
Scope: repository-level audit of the existing StoreKit frontend and backend.  
Status: implementation baseline; production database contents and third-party account state were not inspected.

## Executive summary

StoreKit is a working multi-tenant commerce application with meaningful tenant, catalog, order, billing, SEO, social publishing, courier, backup, automation, and storefront capabilities. Its current Super Admin, however, is an operational tenant/plan console rather than an enterprise SaaS control center.

The safest path is an incremental modular migration. Existing `/api/superadmin` behavior and tenant-admin/storefront flows must remain compatible while new platform modules are introduced behind explicit permissions. The first release must establish shared foundations—request correlation, persistent audit events, dynamic RBAC, validation, pagination, platform settings, and a modular Super Admin shell—because every later module depends on them.

No system can guarantee Google ranking, third-party uptime, or zero defects. Production readiness will instead be measured through explicit acceptance tests, security controls, observability, recovery procedures, and service-level objectives.

## Existing architecture and module inventory

### Runtime

- Frontend: React 18, React Router 6, Tailwind, Recharts, Axios, GSAP.
- Backend: Node.js 18+, Express 4, Mongoose 7, MongoDB.
- Authentication: database-backed users plus bearer JWT; Google identity is supported for existing Super Admin accounts.
- Storage/media: Cloudinary and upload routes.
- Payments: Stripe package plus StoreKit tenant payment, subscription payment, invoice, coupon, and gateway data.
- Messaging: Nodemailer/Resend and tenant notification data.
- Operations: in-process request monitoring, scheduled subscription/social jobs, backup services, and health endpoints.

### Business modules found

Platform tenancy and plans; authentication; products; categories; orders; customers/users; coupons; banners; reviews; notifications; store settings; returns; gift cards; seasonal campaigns; deals; subscribers; delivery and courier integrations; payments and billing; SEO and merchant feeds; uploads and scraping; marketing and Meta CAPI; pages; WhatsApp; social media and scheduling; automation; backups; AI assistant; monitoring.

### Backend API inventory

The server mounts these API families: `auth`, `tenant`, `superadmin`, `products`, `storefront`, `orders`, `categories`, `coupons`, `banners`, `reviews`, `notifications`, `settings`, `returns`, `gift-cards`, `seasonal`, `upload`, `scrape`, `payments`, `delivery`, `curfox`, `marketing`, `pages`, `subscribers`, `seo`, `meta`, `admin`, `admin/billing`, `admin/reset`, `billing`, `whatsapp`, `social-media`, `social-scheduling`, `automation`, `deals`, `ai`, `monitoring`, and `backup`. Public SEO aliases include sitemaps, robots, and the Google Shopping feed.

The existing Super Admin API has 19 operations:

- Feature registry and tenant starter-kit preview.
- Basic stats and a combined tenant monitoring response.
- Plan list/create/update/delete.
- Tenant list/create/update/delete and deletion preview.
- Billing overview, payment list, approval, and rejection.
- Tenant deactivate/reactivate.
- Tenant domain add/remove.
- Tenant administrator password reset.

Confirmed missing Super Admin API groups include platform settings, roles/permissions, sessions, audit query/export, platform users, security incidents/rules, notifications/templates, durable monitoring/history, feature-flag rollouts, support, developer keys/webhooks, infrastructure integrations, deployment records, tenant notes/tags/timeline/import/export/archive/transfer/impersonation, and comprehensive analytics.

## Current database model

Dedicated Mongoose models exist for Tenant, Plan, User, Product, Order, Deal, AutomationRule, Backup, BackupSettings, BehaviorEvent, TenantPayment, subscription coupons/invoices/payments, courier integrations/submissions, and social scheduling/drafts/publish attempts/logs. A large `models/index.js` also defines Category, Coupon, Banner, Review, Notification, Settings, GiftCard, ReturnRequest, OTP, SeasonalCampaign, PaymentGateway, DeliveryService, BusinessPage, and Subscriber.

Most commerce records include `tenantId`, and important product/order/user paths have compound tenant indexes. The schema split between dedicated files and `models/index.js` creates avoidable coupling and inconsistent model ownership.

No code-level models currently exist for persistent platform audit events, roles, permissions, role assignments, sessions, MFA factors/recovery, platform settings, security incidents, IP/firewall rules, platform notification templates/deliveries, support tickets, tenant notes/tags, feature flags/variants/evaluations, API keys, webhook endpoints/deliveries, deployment history, job history, metric time series, integration health, or secrets metadata.

“Unused tables” cannot be proven without querying the production database. At code level, every declared model must be checked against imports and runtime collection names during migration; actual orphan collections and documents require a read-only production inventory before removal. Nothing should be deleted from production based only on this audit.

## Authentication and authorization

### Existing behavior

- Roles are a hardcoded enum: `customer`, `admin`, `superadmin`.
- JWTs are bearer tokens valid for 30 days. Optional issuer and audience checks are supported.
- Every authenticated request reloads the user, so deactivation takes effect immediately.
- Password hashing uses bcrypt cost 12.
- Login has IP rate limiting and per-user temporary lockout after repeated failures.
- Google Super Admin login verifies Google identity and only permits an existing active tenantless Super Admin, with an optional email allowlist.
- Admin access verifies the tenant remains active.

### Gaps and impact

- No dynamic RBAC: every Super Admin has unrestricted access. This prevents separation of duties and makes support, finance, security, and engineering accounts unnecessarily powerful.
- No MFA, recovery-code, or enforcement policy: compromise of one account grants platform-wide control.
- No session registry, refresh-token rotation, revocation, force logout, or device viewer: a stolen 30-day token remains usable unless the account is disabled or the token expires.
- Tokens are stored in browser local storage: an XSS event can exfiltrate them.
- Password reset returns a plaintext generated password to the Super Admin. A one-time expiring reset flow is safer and more auditable.
- No step-up authentication for destructive actions, refunds, impersonation, secrets, or key rotation.

Recommended architecture: dynamic permission definitions and roles stored in MongoDB, immutable system permissions seeded idempotently, assignments scoped to platform or tenant, deny-by-default middleware, short-lived access tokens with rotating server-recorded refresh sessions in secure cookies, MFA/step-up policies, and backwards-compatible mapping of the existing `superadmin` role to a seeded owner role.

## Existing Super Admin UI and UX

The frontend exposes only `/superadmin/login` and `/superadmin`. The dashboard is a roughly 1,450-line component with six internal tabs: Overview, Plans, Tenants, Billing, Domains, and Feature Governance. Billing is the only substantial extracted page component. All datasets are fetched together on dashboard load.

Strengths include responsive styling, plan/tenant operations, tenant onboarding, destructive-action confirmation, billing handling, domain management, and feature impact visibility.

Problems:

- Internal tab state prevents module URLs, deep links, browser history, route-level authorization, and independent lazy loading.
- Fetching stats, all plans, all tenants, monitoring, and feature governance at once increases latency and failure coupling.
- Tenant list and plan list are unpaginated; tenant monitoring loads all tenants and runs several global aggregations.
- No saved views, server-side advanced search/filter, export/import, command palette, global search, accessibility audit, keyboard workflow, or consistent skeleton/error boundary behavior.
- Feature catalog definitions are duplicated in the large frontend component even though a backend registry exists.
- Tenant details lack a canonical routed workspace and timeline.

Recommended architecture: `/superadmin/*` nested routes, a persistent accessible application shell, per-module route bundles, permission-aware navigation, TanStack-style server state patterns (or an equivalent lightweight internal abstraction), reusable table/filter/action components, and module-scoped error boundaries.

## Security audit

### Existing controls

Helmet/HSTS, CORS, global and login rate limits, NoSQL-key sanitization, prototype-pollution protection, input encoding, bcrypt passwords, account lockout, JWT verification, tenant status checks, webhook-specific limiting, and sanitized global errors are present.

### Confirmed risks

- Audit logging is a local append-only JSONL file, is not tamper-evident despite its comment, and is mounted only on two admin route groups—not Super Admin or most module mutations. It lacks action/resource, old/new values, user agent, country, duration, correlation ID, failure details, retention, querying, and export.
- CSP permits `unsafe-inline` and `unsafe-eval`; this materially weakens XSS protection.
- Recursive blanket HTML encoding can corrupt legitimate rich text and is not a substitute for context-aware output encoding and field-specific sanitization.
- CORS and proxy trust need environment-specific verification before launch.
- Tenant integration secrets (for example mail credentials/API keys) are stored in ordinary tenant fields; envelope encryption and redacted APIs are required.
- There is no CSRF design because bearer local-storage authentication is used. Moving refresh/auth cookies requires explicit SameSite/origin/CSRF controls.
- No IP/geo/firewall policy, anomaly detection, security incident workflow, secret rotation, JWT key rotation, or webhook replay management exists.
- Console logging remains in production request paths and can expose operational metadata.

## Monitoring, performance, and scalability

Monitoring currently lives in one process's memory. It resets on restart, grows endpoint/IP maps without durable aggregation, exposes no cross-instance truth, and has no percentile latency, job/queue state, event-loop lag, CPU, memory, disk, Mongo pool/replication, Redis, dependency health, alert rules, or retention. The monitoring reset endpoint applies `auth` and then `adminAuth`, which redundantly authenticates twice.

The Super Admin monitoring API loads every tenant and performs multiple global collection aggregations per request. “Storage” is estimated from product and image counts, so it is not an actual storage measurement. MRR is approximated from tenant plan prices rather than a billing ledger; ARR, churn, LTV, CAC, refunds, taxes, dunning, and recognized revenue are not reliable platform metrics.

Other scaling risks include unpaginated tenant/plan endpoints, large monolithic route and UI files, in-process schedulers without a durable queue/lease model, no Redis/cache abstraction, no distributed rate-limit store, and limited integration-contract tests. Large source hotspots include AI, Super Admin, products, SEO, orders, scraping, and several admin pages.

Recommended architecture: cursor pagination and indexed filters; dedicated query services; pre-aggregated daily metrics; durable job records and worker leases; OpenTelemetry-compatible correlation/tracing; external metrics/log storage; bounded cardinality; dependency probes; alert policies; and measured Cloudinary/object storage usage rather than estimates.

## Dead code, duplication, and technical debt

Confirmed technical-debt candidates, pending dependency/runtime validation:

- Root maintenance/debug scripts (`check1.js` through `check4.js`, `fix_and_test.js`, `run-reset.js`, migration utilities) need classification as supported operations, moved into `scripts/`, or removal after provenance checks.
- Mongoose models are split between a large index module and dedicated files.
- Feature definitions are duplicated between backend registry/schema and Super Admin UI.
- `Tenant.subscription` and `Tenant.billing` represent overlapping subscription state with different enums/field names, creating drift risk.
- Large route/page modules combine transport, authorization, validation, aggregation, and business logic.
- Comments claiming guarantees or tamper evidence exceed actual controls.
- Repeated console diagnostics should become structured, redacted logging.

Potential dead code or unused collections will not be removed until static import analysis, runtime coverage, database collection counts, and a reversible deprecation window all agree.

## Missing feature matrix and recommended architecture

| Capability | Why needed | Impact if missing | Recommended architecture |
|---|---|---|---|
| Modular dashboard | Independent ownership and reliable navigation | Coupled failures and slow releases | Nested routes, module services/controllers/policies |
| Tenant workspace | Safe lifecycle and support operations | Slow diagnosis and risky ad-hoc changes | Routed tenant profile, timeline, usage, billing, notes, actions |
| Platform settings | Centralized SaaS behavior | Environment/code changes for routine config | Versioned typed settings, validation, secret references, audit |
| Subscription engine | Reliable commercial operation | Incorrect revenue/dunning/access | Canonical subscription ledger, Stripe sync, idempotent webhooks/jobs |
| Platform users | Operate staff access | No delegation or lifecycle controls | User directory, invitations, status, sessions, scoped assignments |
| Dynamic RBAC | Least privilege | Every Super Admin is platform owner | Permission registry, roles, assignments, policy middleware/matrix UI |
| Security center | Detect/respond to abuse | Incidents remain invisible | Security events, rules, sessions, blocks, score and response workflow |
| Persistent audit | Accountability and investigation | Destructive actions cannot be reconstructed | Append-only DB events, correlation, change summaries, export/retention |
| Notification center | Consistent operational communication | Failed payments/incidents are missed | Templates, channels, delivery attempts, preferences, event outbox |
| Durable monitoring | Multi-instance operational truth | Restarts erase data and outages lack alerts | Metrics/log/traces adapter, health probes, job/dependency telemetry |
| Feature flags | Safe progressive delivery | Plan booleans cannot do rollouts/experiments | Flags, environments, targeting rules, deterministic evaluation, kill switch |
| SaaS analytics | Product and revenue decisions | Current approximations mislead operators | Event taxonomy, billing ledger, daily aggregates, definitions/versioning |
| Support center | Controlled customer resolution | Work is fragmented and unaudited | Tickets, notes, SLA/escalation, scoped impersonation and KB |
| Developer center | Safe integrations | Keys/webhooks/logs are unmanaged | Hashed scoped keys, secret vault references, webhook delivery ledger/docs |
| Infrastructure center | Dependency/config visibility | Configuration drift and slow recovery | Redacted integration registry, health status, change workflow |
| Import/export | Portfolio operations | Manual bulk work and errors | Async validated jobs, signed artifacts, audit and rollback reports |
| Backups/restore | Tenant recovery | Data loss cannot be safely remediated | Verified snapshots, restore previews, retention and recovery tests |
| Global search/command UI | Efficient operation at scale | High click cost and operator mistakes | Permission-filtered search index and confirmed command actions |

## Target module boundaries

```text
Super Admin Shell
├── Dashboard / Analytics
├── Platform / Settings / Integrations
├── Tenants / Tenant Workspace
├── Plans / Subscriptions / Billing
├── Users / Roles / Permissions / Sessions
├── Security / Audit
├── Notifications / Support
├── Monitoring / Infrastructure / Jobs
├── Feature Flags
└── Developer / API Keys / Webhooks / Deployments

HTTP Route → Authentication → Permission Policy → Validation
           → Controller → Domain Service → Repository/Integration
           → Audit Event + Outbox → Response
```

Each module will own its routes, validation, permission constants, controllers, services, data models, tests, and frontend route. Cross-module work will use explicit services/events rather than importing route internals.

## Implementation order and compatibility gates

1. Foundation: correlation IDs, structured errors/logging, persistent audit, dynamic RBAC with legacy owner mapping, validation utilities, Super Admin nested shell.
2. Platform users, roles, sessions, MFA policy, and security center.
3. Tenant directory/workspace, tags/notes/timeline, safe lifecycle actions, usage metering, import/export.
4. Canonical subscriptions/billing ledger, Stripe synchronization, dunning, invoices/refunds.
5. Platform settings, secrets/integrations, notifications and outbox.
6. Durable jobs/monitoring/infrastructure health and alerts.
7. Feature flags and plan-feature governance integration.
8. Analytics aggregates and dashboards.
9. Support and developer centers.
10. Performance/accessibility hardening, recovery tests, deployment documentation, and final readiness report.

Every increment must preserve existing routes until its replacement has parity, provide migration/rollback notes, add authorization and audit coverage, test tenant isolation, and pass backend tests plus frontend production build. Destructive schema cleanup occurs only after production evidence and a reversible migration.

## Baseline readiness assessment

- Existing commerce/storefront functionality: substantial and working, with focused automated tests.
- Super Admin functional coverage against requested control center: approximately 20%.
- Security maturity: foundational controls present; identity/session/RBAC/audit/secrets require major work.
- Observability maturity: development-level, not multi-instance production-grade.
- Scalability maturity: suitable for modest load; unbounded administrative queries and in-process state require correction.
- Production-readiness score for the requested enterprise Super Admin: **38/100** at this audit baseline.

This score is a traceable starting point, not a guarantee. It will be recalculated from implemented controls, automated tests, deployment evidence, load results, restore exercises, and integration verification in the final report.
