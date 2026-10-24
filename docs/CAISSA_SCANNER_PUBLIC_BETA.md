# CAISSA Scanner controlled public beta

## Release state

CAISSA Scanner Phase 4 is a controlled **Public Beta**, not a 1.0 release. This change is implementation-only. It does not apply the database migration, change production environment variables, train a model, deploy, or promote a release.

The canonical public route is `/scanner`. It has one URL and two intentional responsive modes:

- Touch/small-screen mode is the functional Scanner application.
- Fine-pointer desktop mode at 1024 CSS pixels and above is an information-first product page with a local QR code and copyable canonical URL.
- Tablet widths below 1024 remain functional. A coarse-pointer tablet at or above 1024 also remains functional; the decision uses responsive behavior and pointer capability, not a user-agent string.

The QR code is a checked-in SVG encoding `https://www.caissa-chess.org/scanner`. It has no redirector, third-party request, or tracking service.

## Recognition path

The public mobile path reuses the certified architecture:

`Capture -> production localizer v4 -> frozen v0.5 ONNX classifier -> structural guardrails -> mandatory Review/Edit -> Confirm -> Workspace`

Identity remains frozen:

- Classifier: `caissa-piece-classifier-v0.5-occupancy-recovery`
- Model state SHA-256: `90D06A3C1AAC934188CBA5EEB4B68D51AC64C815351BFE372F2215101DD7209E`
- Production ONNX SHA-256: `FFF4C633613997C7C29ACD31FB233CF9A2150D173AAB4E38E0BF650644485211`
- Occupancy threshold: `0.99`
- Localizer: `caissa-scanner-board-localizer/4`

This phase changes no model weight, threshold, class order, preprocessing, or localizer scoring. It removes the public fixed-FEN seam and sends the localizer's canonical 512x512 RGBA board to the same frozen server classifier used by the private beta.

The position is never silently accepted or rewritten. `NORMAL` continues normally, `REVIEW_RECOMMENDED` shows a soft warning, and `REVIEW_REQUIRED` requires a human acknowledgement. Guardrails report missing or duplicate kings, pawn-count and back-rank-pawn problems, and unusual promoted-material patterns. They do not modify FEN.

## Supported product boundary

Supported public file types are JPEG, PNG, and WebP. HEIC and HEIF receive an explicit unsupported-format message. The product is 2D-first: digital boards, screenshots, website/app boards, broadcasts, photos of screens, and clear printed diagrams. Physical 3D boards, heavy occlusion, and severe physical-board perspective are not marketed as supported; safe failure is preferred.

## Access and abuse controls

The public landing page is anonymous. Recognition supports deliberately limited guest use and signed-in use:

- Guest default: 4 recognition requests per minute per client IP.
- Authenticated default: 12 recognition requests per minute per Clerk user.
- Recognition and scan-submission limits are configurable with `CAISSA_SCANNER_PUBLIC_GUEST_RPM` and `CAISSA_SCANNER_PUBLIC_AUTH_RPM`, bounded to safe positive values. Authenticated feedback/failure submissions default to 12 per minute and image uploads default to 6 per minute; they can be lowered or raised within the same bound with `CAISSA_SCANNER_PUBLIC_FEEDBACK_RPM` and `CAISSA_SCANNER_PUBLIC_IMAGE_RPM`.
- Recognition has a 20-second server timeout, a 25-second client timeout, a 1.5 MB JSON ceiling, a canonical 512x512 RGBA payload, and a 12 MB source-image ceiling.
- `CAISSA_SCANNER_PUBLIC_STAGE=public-beta` is the server kill switch. When it is not set, inference APIs fail closed and the mobile shell shows a friendly paused-service message; desktop information remains usable.

Public feedback and optional source-image upload require an authenticated CAISSA account. They are same-origin only. Existing `/beta` and `/scanner/beta` authorization and `trusted_beta` provenance remain unchanged and separate.

The current limiter is process-local, matching the audited private beta implementation. Before high-volume release, the human release gate should decide whether observed traffic requires a distributed limiter. This is a release-hardening decision, not permission to expose unlimited inference.

## Public feedback and privacy

Feedback is optional. The UI separately asks whether to share:

1. the correction/confirmation and recognition evidence; and
2. the source image.

No image is uploaded merely because a user scans. A consented image is written to the private `scanner-public-feedback-images` bucket and referenced by a non-public `supabase://` identifier. The server verifies JPEG/PNG/WebP signatures, recomputes SHA-256, and requires the stored object hash to equal the originating scan hash before accepting feedback. Review access uses a server-authorized signed URL with a 60-second lifetime. The browser never receives a public object URL, the service-role credential never enters client code, and the UI makes no sale or sharing promise beyond the declared improvement purpose.

Provisional retention policy for release approval:

- raw unverified metadata: review within 180 days;
- unreviewed consented images: review or delete within 90 days;
- certified evidence: retained with its certification history while it supports a governed dataset;
- deletion/privacy requests: require an owner workflow that removes the private object and adds a privacy/deletion audit event without rewriting historical certification facts.

The migration intentionally does not promise permanent storage and does not implement an automated deletion job. That operational workflow is a follow-up release requirement.

## Product analytics and performance

Server recognition logs contain aggregate event name, audience, outcome code, and duration only. They do not log raw feedback, FEN, source pixels, image hashes, or signed image URLs. The response emits `Server-Timing` for model load and inference. Public feedback latency is measurable at the request boundary without exposing evidence.

Local release measurements on 2026-10-24 are implementation evidence, not production SLOs, and must be re-measured in the protected preview before approval:

- Frozen v0.5 ONNX benchmark, 25 repetitions: cold request 266.96 ms, cold model load 78.47 ms, cold inference 183.59 ms, warm request P50 164.93 ms, warm request P95 808.64 ms. The warm P95 is above the desired interactive target and is an explicit protected-preview watch item.
- Real localizer cohort, 14 samples: mean 845.61 ms, median 860.13 ms, worst 1644.62 ms. This governed cohort intentionally includes unsupported/hard cases; the result is evidence of safe review/failure behavior, not a claim of universal detection.
- The cross-browser capture-to-Review/Edit flow completed within the 30-second browser acceptance bound in Chromium, Firefox, and WebKit. Exact field P50/P95 still requires protected-preview telemetry.
- The static desktop landing rendered at 1366x900 in Chromium, Firefox, and WebKit without horizontal overflow. Network load timing still requires the protected preview/CDN.
- Optional feedback reached the `raw-unverified` acknowledgement in all three browser engines through the deterministic test adapter. Real database latency still requires the protected preview.

No raw feedback is exposed in public analytics.

## Release and rollback

Release requires a separate human approval task. The migration file is versioned but unapplied. Production deployment is not part of Phase 4-001.

Rollback controls are:

1. unset `CAISSA_SCANNER_PUBLIC_STAGE` to stop recognition immediately;
2. serve the desktop/informational fallback while mobile reports the friendly pause;
3. revert the Phase 4 commit if the UI shell must be removed;
4. do not delete raw evidence or certification history during rollback;
5. if the migration was separately approved and applied, leave append-only evidence intact and disable application access rather than reversing it destructively.

## Verification commands

```text
npm run test:scanner:public-beta
npm run verify:scanner
npm run benchmark:scanner:inference
```

The release gate must also verify Chromium, Firefox, and WebKit; mobile widths; fine-pointer desktop mode; QR decoding; private owner authorization; same-origin enforcement; rate limiting; and signed-image expiry in the protected preview.

`npm audit --audit-level=high` reported three high and three moderate advisories in pre-existing repository dependencies. The Scanner public request path does not import those packages: vulnerable `sharp`, `cheerio`/`undici`, and direct `adm-zip` use is confined to offline tooling or non-Scanner routes; `stripe`/`qs` is confined to commerce. `onnxruntime-node` also depends on `adm-zip`, but the public inference path loads the already-bundled ONNX runtime/model and performs no ZIP extraction. These findings do not expand this change's Scanner attack surface, but repository dependency upgrades should be handled as a separate tested maintenance change rather than forced into this release branch.
