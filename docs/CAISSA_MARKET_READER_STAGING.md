# CAISSA Market — PGN Reader staging runbook

Status: source-ready, remote staging not yet configured or deployed. Production
Buy, downloads, licensing and publication remain disabled.

## Fixed contract

- Product: `caissa-pgn-reader`.
- Staging release: `1.0.0-rc1`.
- Private Blob pathname (server-owned):
  `products/caissa-pgn-reader/1.0.0-rc1/CAISSA-PGN-Reader-v1.0.0-rc1-windows-x64-portable.zip`.
- Certified RC1 size: `81,744,651` bytes.
- Certified RC1 SHA-256:
  `9FC58B593C1E7774DC2E326DBE91635973D3FD18AA718F73C3B2C0869641EE88`.
- RC1 remains the historical unsigned baseline. This integration does not
  replace, modify, rebuild or sign it.

The browser submits only `productId` and `releaseId`. It cannot submit a Blob
pathname, URL, store or TTL. The server maps the pair to the exact pathname.

## Routes

- `/market/caissa-pgn-reader`: staging product card; Buy is disabled.
- `/account/downloads`: authenticated My Downloads screen.
- `GET /api/account/products/caissa-pgn-reader/releases`: authenticated
  entitlement lookup and public release metadata. The Blob pathname is omitted.
- `POST /api/account/downloads`: authenticated authorization. A successful
  response contains one operation-scoped temporary GET URL and its expiry.

The signed URL flow is the current Vercel Blob contract:

1. `issueSignedToken()` receives the exact pathname, `operations: ['get']` and
   `validUntil`.
2. `presignUrl()` receives `operation: 'get'`, the same pathname,
   `access: 'private'` and the same `validUntil`.
3. The server validates HTTPS, the separately configured exact private Blob
   hostname, exact pathname and Vercel delegation/signature parameters.

Both the delegation and URL are capped at ten minutes. Expiry enforcement is
performed by Vercel Blob and an expired URL must return HTTP 403.

## Required custom `staging` environment

All secrets are server-only Vercel variables. Do not prefix any of them with
`NEXT_PUBLIC_` and do not commit or pull their values into this repository.

| Variable | Required value/purpose |
| --- | --- |
| `VERCEL_TARGET_ENV` | System value must be `staging` |
| `CAISSA_MARKET_STAGING_ENABLED` | Exact `true` |
| `PRODUCTION_MARKET_DOWNLOADS_ENABLED` | Exact `false` |
| `CLERK_SECRET_KEY` | Server-side bearer verification |
| `CAISSA_BROWSER_ORIGINS` | Exact custom-staging browser origin for existing CORS policy |
| `SUPABASE_URL` | Staging Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Staging-only server credential |
| `CAISSA_MARKET_STAGING_SUPABASE_PROJECT_REF` | Expected 20-character staging project ref; URL binding must match exactly |
| `BLOB_READ_WRITE_TOKEN` | Token connected to the private RC1 store |
| `BLOB_STORE_ID` | Store identifier used to issue the delegation (SDK-supported prefixed or bare form) |
| `MARKET_READER_BLOB_HOST` | Exact `<store>.private.blob.vercel-storage.com` host |

The current linked-project audit found the private Blob token in Preview, not
the custom `staging` environment, and found no Supabase service-role variable
for custom staging. Those variables must be connected/scoped by Alexander
before deployment. No values were read or copied during this preparation.

## Durable entitlement and checkout handoff

The local migration
`20260901010208_caissa_market_reader_entitlements.sql` prepares a server-only,
RLS-enabled `product_entitlements` table and the idempotent
`fulfill_market_product_checkout` RPC. It has not been applied.

The existing signature-verified Stripe webhook recognizes only this fixed
product contract after a verified `checkout.session.completed` event:

- `mode = payment`;
- `payment_status = paid`;
- metadata `type = product`;
- metadata `product_id = caissa-pgn-reader`;
- metadata `caissa_user_id` is the authoritative database UUID;
- Stripe customer matches the authoritative CAISSA user.

The RPC claims the Stripe event/business key and grants or refreshes one durable
entitlement atomically. The existing checkout-session endpoint was not expanded,
no Price ID is accepted from the browser, and the product contract reports
`enabled: false`. Refund and chargeback policy is deliberately not defined in
this phase.

## Staging fixture rehearsal (not yet executed)

After Alexander authorizes the database migration and server-only variables:

1. Apply the migration to the verified staging Supabase project only.
2. Create or select a synthetic Clerk/CAISSA staging account.
3. Grant that synthetic account an `active` fixture entitlement without running
   real Checkout.
4. Confirm My Downloads lists RC1 and omits the private pathname.
5. Authorize a temporary URL, GET the private Blob, then verify exact byte count
   and SHA-256.
6. Confirm an account without entitlement receives 403 and no URL.
7. Confirm an invalid release receives 403 and no URL.
8. Retain an authorized URL until expiry and confirm GET returns 403.

The optional live Node tests require operator-supplied process variables
`CAISSA_MARKET_STAGING_BASE_URL`, `CAISSA_MARKET_STAGING_CLERK_TOKEN` and, for
the negative-account and expiry checks,
`CAISSA_MARKET_STAGING_UNENTITLED_CLERK_TOKEN` and
`CAISSA_MARKET_STAGING_EXPIRED_DOWNLOAD_URL`. They never log these values.
Without them, live tests are reported as skipped rather than silently
substituting Production.

## Security invariants

- Production remains disabled even if a staging flag is copied accidentally.
- Entitlements are read server-side using Clerk identity mapped to the
  authoritative `users` row; client metadata is not trusted.
- `anon` and `authenticated` database roles have no table or RPC privileges.
- Download responses and account pages use private/no-store caching.
- Client errors are generic; authorization logs contain only allowlisted event,
  outcome, product, release and reason fields.
- Logs never contain account IDs, email, Blob pathname, signed URL, token, PGN
  or FEN data.
- No WAF enforcement, Production deployment, Production download, real Buy,
  licensing activation or publication is included here.
