# Social Media Product Scheduling

The scheduler is available under **Admin → Social Media → Post Management**. It uses the tenant's existing encrypted Facebook/Instagram settings and never sends tokens to the browser.

## Workflow

1. Select products or select all current filters.
2. Configure platforms, timezone, days, daily start, gap, daily limit, order, language, CTA, voucher and price adjustment.
3. Generate drafts. This does not create a queue or publish anything.
4. Review every platform draft, description, verified features, hashtags, media order, pricing and warnings.
5. Confirm valid drafts and create the schedule.
6. The backend worker claims and publishes due queue items even when the admin browser is closed.

Products, prices, stock, vouchers, media and platform connection state are revalidated immediately before publishing. Changed records follow the activity's `needs_review` or `regenerate` policy. Edited captions always go to Needs Review when source product data changes.

## Production deployment

1. Deploy the backend and frontend from the same commit.
2. Keep the existing `SOCIAL_MEDIA_SECRET` unchanged so saved Meta credentials remain decryptable.
3. In Railway set `SOCIAL_SCHEDULER_ENABLED=true` and optionally `SOCIAL_SCHEDULER_INTERVAL_MS=15000`.
   Set `META_GRAPH_VERSION` to the Graph API version currently enabled for your Meta app (the backward-compatible default is `v21.0`).
4. Run `cd backend && npm run migrate:social-scheduling` first. This is audit-only.
5. Resolve any reported duplicate per-tenant SocialMedia settings manually. The script never deletes or merges data.
6. Run `cd backend && npm run migrate:social-scheduling -- --apply` to create missing indexes. It does not drop indexes or rewrite existing records.
7. Restart Railway and check `GET /api/social-scheduling/worker/health` while authenticated as a tenant admin.
8. Create a future test draft with one safe product and use a Meta test Page/Instagram Business account. Confirm the activity survives a page refresh and backend restart.

No product/order backfill is required. The four scheduling collections are additive. Existing immediate/manual publishing and PublishLog records remain valid; new schedule references on PublishLog are optional.

## Meta limitations

- Instagram organic feed posts do not support Facebook-style Shop Now or WhatsApp buttons. The CTA remains in the caption.
- A Facebook native Shop Now link card is a different post type from a multi-image photo post. For multiple images the scheduler preserves the carousel and keeps the URL in the text.
- Facebook external WhatsApp CTA rendering varies by Page/API capability. The system preserves the `wa.me` destination as a clickable link even when a native button is unavailable.
- Instagram accepts at most 10 carousel images. The review UI shows the selected order; the publisher uses the first 10 included public HTTPS images.
- A real end-to-end Meta test requires valid Page/Instagram credentials and creates real posts. Automated tests do not contact Meta.

## Recovery and safety

Queue claims and idempotency keys are tenant-scoped. A global Mongo lock prevents overlapping worker scans, and each due item is claimed atomically. Temporary errors use exponential backoff. Permanent permissions/validation errors stop retrying. If the process restarts after contacting Meta without recording a definitive result, the item moves to Needs Review for reconciliation instead of being blindly republished.
