# StoreKit Super Admin Master Readiness Matrix

Evidence date: 2026-07-18  
Scope: current worktree, not deployed production state

Complete handoff artifact: `docs/SUPER_ADMIN_COMPLETE_IMPLEMENTATION_REPORT.md` contains the architecture/database diagrams, source inventories, UI screen matrix, deployment notes, security/performance/testing checklists and scored release decision required by the master brief.

## Evidence rules

- **Implemented** means a persistent backend capability, permissioned API, integrated UI, and relevant automated coverage are present unless the row explicitly narrows that claim.
- **Partial** means usable capability exists but one or more requirements or production proofs remain.
- **External setup** means code exists but configured provider credentials, infrastructure, or staging evidence is absent.
- **Missing** means the named capability is not implemented.
- A successful build or source-contract test does not prove a third-party integration works in production.
- No document or automated test can guarantee Google ranking, uninterrupted service, or defect-free operation. Those outcomes require deployment configuration, provider verification, observability, and ongoing operations.

## Architecture evidence

```text
React Control Center
  -> authenticated /api/superadmin/* modules
     -> dynamic platform RBAC + recent-MFA step-up
        -> request context + redacted persistent audit
           -> domain services
              -> tenant-scoped and platform-scoped MongoDB models
              -> encrypted provider integrations
              -> tracked workers/schedulers
              -> Stripe / Google / email / social providers
```

Tenant storefront and tenant Admin routes remain separate from platform-control routes. Tenant context is derived from authenticated identity/domain resolution and query middleware; platform routes require a tenantless Super Admin identity before dynamic permission evaluation.

## Module completion matrix

| Master area | State | Current evidence | Remaining proof or work |
|---|---|---|---|
| Control Center dashboard | Partial | Revenue/subscription/tenant/user/activity cards and charts, permission-gated authoritative recent deployments and modular lazy-loaded shell | Confirm every requested card against live seeded staging data and reconcile CI/CD lifecycle events against the deployment provider |
| Tenant management | Implemented | Workspace API/UI, filters, operator-owned persisted saved/default views, pagination, permission-aware conflict-safe inline metadata editing, CSV import/export, notes/tags, health/risk, ownership transfer, suspend/reactivate/archive/delete, usage, billing, login history, domain/branding detail, secure impersonation | Rendered cross-browser QA and large-tenant load test remain |
| Tenant backups/restore | Partial | Tenant-isolated encrypted recovery and separate platform disaster recovery | Google Drive OAuth must be configured; perform staging restore drill and retention/escrow review |
| Platform settings | Partial | Typed allowlisted settings for brand, localization, access, maintenance, security, legal, support, consent and upload limits | Several infrastructure settings are intentionally environment/provider managed; languages/country catalogs are bounded, not a full localization-management system |
| Integrations | Partial / external setup | Encrypted registry and health tests for Stripe, Cloudinary, Google, Microsoft, Apple, GitHub, Slack, Gemini, Anthropic, Meta CAPI/Ads, Pexels, Resend, Twilio, AWS, Azure, GCP, SMTP/webhook/push | Production secrets absent; provider-by-provider staging tests and callback/domain configuration required |
| Subscription/billing | Implemented | Plans/features, trials, coupons, taxes, invoices, refunds, payment history, dunning/retry/grace periods, portal, Stripe reconciliation, manual payments, enterprise contracts | Stripe webhook and refund staging replay required before production enablement |
| Platform users | Implemented | Search/filter/invite, dynamic roles, suspend/delete, password reset, force logout, MFA reset, sessions/devices and audit history | Live Google OAuth and mail invitation delivery remain external proof |
| Dynamic RBAC | Implemented | Database-backed roles/permissions, synchronized registry, matrix editor, permission groups, explicit-role enforcement switch | Run production operator assignment report before enabling `REQUIRE_EXPLICIT_PLATFORM_ROLE=true` |
| Security center | Partial / external setup | MFA, session registry, auth events, lockout, IP/CIDR and attested-country rules, method/path application firewall kill switches, JWT/backup/platform-secret key inventories, stored-secret re-encryption, retirement safeguards and attestations, password policy, API abuse telemetry | Secret-manager changes remain deployment controlled; geo blocking needs trusted-edge injection |
| Audit | Implemented | Actor, IP, user agent, changes, timestamps, endpoint/action/resource/status/duration/correlation ID; search/filter/export/timeline UI | Country is present only when trusted geo context is deployed; retention/export load test remains |
| Notifications | Partial | Persistent email/SMS/push/Slack/webhook delivery queue, permission-aware optimistic/versioned template editing, announcements, lifecycle automations, retries/dead letters | Email credentials absent; push/SMS/Slack provider tests required; no native mobile push client proof |
| Monitoring/infrastructure | Partial | API latency/errors, DB, process CPU/memory/event loop, disk, Mongo queue, schedulers/workers, integrations, runtime identity, durable deployment lifecycle/history, alerts and job/error history | Redis is honestly reported unsupported/not configured; CI/CD keys/events need deployment setup; no host-level restart API; Railway/platform storage metrics need provider API integration |
| Feature flags | Implemented | Global/tenant/country/role/percentage/variant/dependency/schedule/expiry/kill-switch evaluation, exposure records, tenant-level paid-order outcome analysis, contamination exclusion and descriptive confidence intervals | Experiment analysis deliberately avoids customer identity joins and causal claims; production-shaped sample and query-plan validation remain |
| Analytics | Partial | MRR/ARR/churn/LTV, revenue/growth/retention/usage/adoption, currency-safe CAC ledger, automated idempotent Meta and Google Ads daily campaign-spend reconciliation, sequenced funnel, temporal and consented aggregate coordinate heatmaps, exports, privacy-preserving experiment outcome analysis | Live provider reconciliation, privacy/legal review and deployed heatmap/index/browser proof remain external |
| Support | Implemented | Tenant tickets, authenticated realtime SSE chat, cross-replica durable change polling, internal notes, SLA, priority/status/assignee/escalation, knowledge base, announcements, tenant impersonation | This is authenticated tenant-admin support, not an anonymous storefront chat widget; rendered multi-browser reconnect QA remains |
| Developer center | Implemented | Hashed API keys, rotation/revoke, scopes, IP allowlist, rate limits, usage, webhook logs/replay, sandbox isolation, scoped/audited deployment ingestion, authoritative OpenAPI JSON, generated JavaScript/Python SDK ZIPs | SDKs are downloadable from StoreKit but not published to npm/PyPI; run a live CI event sequence and environment variables remain non-secret readiness metadata only |
| UX system | Partial | Responsive shell, breadcrumbs, global search, command palette, tenant saved/default views, permission-aware conflict-safe tenant metadata and notification-template inline editing, accessible persisted column resizing, virtual queues, bulk actions, focus management, skeleton/loading and empty states, reduced motion, dark theme setting | Further domain-specific inline editors, rendered accessibility scan, and real-device viewport QA are incomplete |
| Performance | Partial | Route/module code splitting, bounded pagination, virtualized 300-row support queue, caching, TTL collections, aggregation limits and background workers | No production load test, query-plan capture, frontend Core Web Vitals, broad large-table virtualization, or cache-hit telemetry |
| SEO/customer discovery | Partial / external | Product schema/feed/canonical/robots/merchant validation tests exist | Google indexing and ranking cannot be guaranteed; Search Console/Merchant Center verification and live crawl evidence required |

## Dynamic permission matrix

| Group | Actions |
|---|---|
| platform | view, edit |
| tenant | view, create, edit, suspend, impersonate, delete |
| billing | view, update, refund |
| analytics | view, export, manage |
| users | view, invite, edit, suspend, delete |
| roles | view, manage |
| security | view, manage |
| featureflags | view, manage |
| support | view, reply, manage |
| audit | view, export |
| monitoring | view, manage |
| notifications | view, manage, send |
| infrastructure | view, manage |
| developer | view, api, manage |
| settings | view, manage |

The registry is the validation source, while role assignments and permission records are persisted. Compatibility grants all registered permissions only to legacy active Super Admins without role assignments; production can disable this after operator migration.

## Primary data domains

```text
Tenant -> Users, Products, Orders, Settings, tenant integrations, tenant backups
Tenant -> Subscription/Invoices/Payments/Refunds/Dunning/Contracts
Platform User -> Platform Roles -> Platform Permissions
Platform User -> Auth Sessions, MFA Factors, Auth Events
Platform Action -> Audit Events
Platform -> Settings, Integrations, Feature Flags, Notifications, Support
Runtime -> Metric Snapshots, Job Runs, System Errors, Alert Rules/Events
Developer -> API Keys, Usage Events/Buckets, Webhook Events
Analytics -> Subscription facts, orders, behavior events, acquisition costs, flag exposures
```

Exact collection fields and indexes remain authoritative in `backend/models`. A production database diagram must be generated from the deployed schema/index inventory because Mongoose model presence alone does not prove deployed index synchronization.

## API inventory by route module

| Prefix | Route source | Purpose |
|---|---|---|
| `/api/superadmin/access` | `backend/routes/superadmin/access.js` | roles, permissions, platform operators |
| `/api/superadmin/analytics` | `backend/routes/superadmin/analytics.js` | business/platform analytics and acquisition ledger |
| `/api/superadmin/audit` | `backend/routes/superadmin/audit.js` | audit search/export |
| `/api/superadmin/billing` | `backend/routes/superadmin/billingLifecycle.js` | invoices, attempts, refunds, taxes, coupons, contracts |
| `/api/superadmin/developer` | `backend/routes/superadmin/developer.js` | API keys, usage, webhooks, OpenAPI |
| `/api/superadmin/runtime-flags` | `backend/routes/superadmin/featureFlags.js` | runtime flag lifecycle |
| `/api/superadmin/integrations` | `backend/routes/superadmin/integrations.js` | encrypted provider configuration/testing |
| `/api/superadmin/notifications-center` | `backend/routes/superadmin/notificationsCenter.js` | templates, announcements, queue and automation |
| `/api/superadmin/operations` | `backend/routes/superadmin/operations.js` | health, metrics, errors, jobs and alerts |
| `/api/superadmin/platform-backups` | `backend/routes/superadmin/platformBackups.js` | platform recovery |
| `/api/superadmin/platform-settings` | `backend/routes/superadmin/platformSettings.js` | typed global settings |
| `/api/superadmin/security` | `backend/routes/superadmin/security.js` | sessions, auth events and network policy |
| `/api/superadmin/support` | `backend/routes/superadmin/support.js` | tickets, messages and knowledge base |
| `/api/superadmin/tenant-workspace` | `backend/routes/superadmin/tenantWorkspace.js` | tenant operations and impersonation |

Legacy Super Admin routes remain mounted behind explicit permission policies in `backend/routes/superadmin.js`. The generated OpenAPI document currently covers the supported external platform API, not every private Control Center endpoint.

## Production gates that remain mandatory

1. Configure and test Resend or SMTP; current verification reports no provider credentials.
2. Configure the trusted geo edge secret/header and prove direct-origin denial before enabling country rules.
3. Configure encrypted backup storage/key escrow and complete tenant plus platform restore drills on isolated staging data.
4. Reconcile all platform operators to explicit roles, enroll MFA, preserve two recovery owners, then enable strict explicit-role enforcement.
5. Configure the JWT/platform-secret/backup keyrings, rotate in staging, migrate encrypted integration/MFA records, verify zero archive/record references, wait through maximum legacy session lifetime where applicable, remove old runtime keys, and record retirement attestations.
6. Exercise Stripe test-mode checkout, webhook signature/replay, dunning, portal, refund, and reconciliation flows.
7. Run MongoDB index synchronization/migration checks and capture query plans for high-cardinality tenant, audit, usage and analytics queries.
8. Perform browser-based keyboard, screen-reader, contrast, mobile viewport and destructive-action tests. No browser runtime was available in the latest local validation.
9. Run concurrency/load/soak tests with production-shaped data and define SLOs, alert destinations, on-call ownership and recovery objectives.
10. Verify Search Console, Merchant Center, sitemap/feed fetches and product structured data against the deployed domains; indexing/ranking remains controlled by Google.

## Current readiness conclusion

The Control Center is materially implemented but is **not yet proven production-ready for the complete master scope**. The largest remaining product work is additional domain-specific inline editing and further decomposition of dense compatibility UI/routes after rendered regression coverage exists. The largest operational gaps are provider credentials and secret-manager changes, privacy/legal review, optional npm/PyPI SDK publication, staging integration evidence, restore/key-rotation drills, load/realtime-connection testing, rendered accessibility QA, and deployment-specific edge/index configuration.
