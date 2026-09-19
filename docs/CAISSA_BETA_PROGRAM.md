# CAISSA Beta Program

## Purpose and routes

The CAISSA Beta Program is the permanent account-level access layer for prerelease CAISSA products. Its canonical, authenticated dashboard is `/beta`. Experiment routes such as `/scanner/beta` use the same server-side authorization service; knowing a URL is never sufficient.

Both routes are private, non-cacheable, and carry `noindex, nofollow, noarchive`. An anonymous document request redirects to `/signin` with a same-site `redirect_url`. An authenticated account without access receives `403` and no experiment listing.

## Authorization architecture

Every request is decided by the central helpers in `api/_lib/beta-program-policy.js` and `api/_lib/beta-program-service.js`:

1. Clerk verifies a Bearer token or, for protected same-origin browser routes, the standard `__session` cookie.
2. The verified Clerk subject resolves to a server-side `public.users` row.
3. Active grants are loaded from `public.user_entitlements`; client metadata and user-editable claims are not authorization inputs.
4. The registry record must be enabled, within its optional start/end interval, and not released or retired.
5. Its access policy must allow the account.
6. Feature infrastructure gates may still disable the experiment. For Scanner, `CAISSA_SCANNER_BETA_STAGE=internal` is an additive kill switch, not account authorization.

Failures are closed. A database or authentication outage does not expose the center or an experiment.

## Entitlements and access policies

`beta_tester` grants global beta-tester access. Roles `owner` and `admin` automatically access every active experiment, so the product owner does not need per-feature grants. Feature-specific grants use normalized names such as `scanner_beta`, `spectator_tv_beta`, or `online_lobby_alpha`.

Registry policies are:

- `global-beta`: global beta testers and owner/admin.
- `feature-entitlement`: the experiment's named entitlement and owner/admin.
- `global-or-feature`: either grant and owner/admin.
- `public-beta`: any authenticated account while active.
- `owner-only`: owner/admin only.

Feature-specific grants also allow a user to enter the Beta Center; only experiments that user can access are returned.

## Experiment registry and lifecycle

`public.beta_experiments` stores ID, slug, display name, description, stage, enabled state, route, access policy, optional required entitlement, feedback capability, sort order, start/end dates, and release date. Supported stages are `development`, `internal-alpha`, `internal-beta`, `closed-beta`, `public-beta`, `released`, and `retired`.

Disabled, expired, released, and retired records disappear automatically and cannot be launched. Records are retained for history. Moving a product to `released` removes it from `/beta`; its normal production route and navigation are managed by that product's release task. Retirement preserves registry and feedback records.

Scanner is seeded as `scanner`, displayed as **CAISSA Scanner**, at `internal-beta`, enabled, routed to `/scanner/beta`, governed by `global-beta`, and marked feedback-enabled.

## Private production activation

The Beta Program and Scanner infrastructure were deployed on the normal CAISSA production domain on 2026-09-19 as **private beta infrastructure**, not as a public Scanner release. BETA-002A supplies a Vercel-compatible frozen-v0.5 ONNX endpoint whose checksum, preprocessing, class order, threshold, head probabilities, canonical classes, and full-board output are certified against the TorchScript reference. The release still fails closed unless both the Scanner registry and production `CAISSA_SCANNER_BETA_STAGE=internal` are active. The public Scanner route, public navigation, sitemap, and frozen public Scanner UI are unchanged.

Alexander's canonical Clerk identity was resolved through the existing CAISSA account synchronization. Because the synchronized account did not have an `owner` or `admin` role, it received the scoped, non-expiring `beta_tester` entitlement. No Clerk identifier or email is stored in this document. Ordinary authenticated accounts remain denied and do not receive the account-menu Beta Program entry.

## Beta activity summary

The authorized `/beta` dashboard includes a compact **Your Beta Activity** card for Scanner. Its primary progress value is completed submissions out of the initial 100-submission field-test target; it is not the raw number of attempts.

- **Scans attempted** counts distinct, durable Scanner scan records owned by the current CAISSA account.
- **Completed submissions** counts distinct scans with one final disposition: `CONFIRMED_CORRECT`, `PIECE_CORRECTION`, `LOCALIZATION_FAILURE`, or `SCAN_FAILURE`.
- **Pending / incomplete** counts owned scan records without a final disposition.
- **Today**, **This week**, and **All-time beta** count completed submissions using immutable server receipt timestamps rather than client clocks. The week begins Monday in the database session time zone.

The 30, 50, and 100 milestones respectively identify the minimum useful checkpoint, a strong initial field sample, and the recommended first certification target. Counts are produced by `getBetaActivitySummary(userId, experimentId)`. Scanner currently backs that experiment-scoped helper with `get_scanner_beta_activity_summary`; future experiments can provide their own aggregate without changing the dashboard contract.

Scanner scan, feedback, and failure records created after the activity migration carry the immutable CAISSA `user_id`. Submission RPCs require that ID and reject cross-owner retries. Per-scan transaction locks, unique scan and feedback constraints, and distinct-scan aggregation ensure even concurrent idempotent retries count once. The summary RPC is callable only by the server-side service role, and the application always supplies the signed-in account ID. Historical pre-migration rows remain intact with no inferred owner and are intentionally excluded from personal totals.

The production account began with no owned Scanner activity. Before the physical device smoke, every Scanner counter is therefore zero and the primary display is `0 / 100 completed scans`. Production QA must use a separate account or removable isolated records; it must never submit fabricated Scanner evidence under Alexander's account.

## Physical certification and collection pause

Production infrastructure deployment does not certify the physical iPhone flow. Do not begin physical Scanner testing while the experiment and infrastructure gate are disabled. After a production-compatible frozen-v0.5 inference path is reviewed, deployed, and enabled, Alexander must sign in through the normal production account flow, open **Beta Program**, confirm the Scanner card and `0 / 100`, complete one real iPhone scan and one final disposition, then return to `/beta` and confirm that the primary counter and exactly one appropriate category increased to `1 / 100`. Take Photo, Choose Photo, recognition, Review/Edit, submission, pending-sync behavior, and session continuity are part of that physical certification.

After the production endpoint, authorization, and two activation gates pass release smoke, the state is **WAITING FOR ALEXANDER PHYSICAL BETA CERTIFICATION**. After a physical pass, the product enters **MOBILE BETA DATA COLLECTION PAUSE**: no classifier engineering, threshold changes, online training, or protected-benchmark tuning. Natural-use collection resumes evaluation at 30 completed scans, reaches a strong interim sample at 50, and reaches the recommended first field-corpus certification point at 100.

## Operations

The versioned migration must be applied only during an authorized deployment. The internal CLI requires server-side `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; it is not exposed as a public API.

```text
npm run beta:manage -- list
npm run beta:manage -- grant --clerk-id user_... --entitlement beta_tester
npm run beta:manage -- revoke --clerk-id user_... --entitlement beta_tester
npm run beta:manage -- enable --experiment scanner
npm run beta:manage -- disable --experiment scanner
npm run beta:manage -- stage --experiment scanner --stage released
```

The account must sign in once so its verified Clerk identity is synchronized to `public.users`. Revocation is timestamped; it does not delete history. Optional grant expiration is supported with `--expires-at` in ISO-8601 form.

## Auditing, feedback, and privacy

The server records only `beta_center_viewed` and `experiment_opened`, tied to the existing CAISSA user ID. Audit failure never changes the authorization result. No device fingerprinting or invasive telemetry is added.

Scanner submissions retain `caissa-scanner-beta-feedback-v0.1` and frozen model `caissa-piece-classifier-v0.5-occupancy-recovery`. Server-controlled metadata adds `experimentId=scanner` and `betaStage=internal-beta`; model identity remains in the immutable recognition record.

## Adding a future experiment

Create one registry row and choose its lifecycle stage, route, policy, optional feature entitlement, and feedback flag. Protect the feature page and APIs through `authorizeExperiment`; do not reproduce access checks in feature code. The existing account entry and `/beta` renderer then discover the experiment automatically. No account-access redesign is required.
