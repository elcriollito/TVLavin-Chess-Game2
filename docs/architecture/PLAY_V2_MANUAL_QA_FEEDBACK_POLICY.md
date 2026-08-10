# Play v2 manual QA feedback policy

`PlayV2ManualQaFeedbackPolicy@1.0.0` governs issue reports from official Play. `PlayV2ManualQaReport@1.0.0` is the deterministic exported JSON schema. CAISSA constructs and validates a volatile snapshot in the browser; it does not store or transmit the report. The tester reviews the snapshot, copies or downloads it, and may manually post it to the allowlisted Discord channel when already a member.

The control is mounted only by the official document on `/play`, `/play/games`, `/play/bots`, and `/play/coach`. It is absent from Classic, internal QA harnesses, disabled/internal/invite-only stages and prohibited routes. Query strings, fragments, History and Web Storage cannot authorize it. No reviewer capability or in-product Bug Diary exists.

## Privacy boundary

The schema permits coarse build, mode, surface, viewport, orientation, browser family, zoom and reduced-motion context. It prohibits identity, contact data, network addresses, location, session/invite/CSRF material, credentials, cookies, device fingerprints, FEN, PGN, SAN, moves, evaluations, full User-Agent, storage, logs and media. Text is bounded to 2,000 characters per field and locally rejects recognizable credentials, contact/network data, arbitrary URLs, structured game records, markup, controls and spreadsheet formulas. This defense cannot promise detection of every semantic or deliberately obfuscated personal datum, so the dialog requires human review and displays a privacy warning.

Preview creates one atomic snapshot. Copy and Download consume that exact snapshot; any edit invalidates it. Clear removes form state and the snapshot. Close persists nothing. The ephemeral report ID identifies one report, never a tester. No cookie, Web Storage, IndexedDB, Cache API, server write, Supabase call, analytics transport, webhook or bot is used.

## Manual Discord handoff

The stable channel remains centralized in the versioned policy and opens only after explicit action in a new tab with `noopener,noreferrer`; it neither attaches nor transmits the report. The revoked invitation is `null` and no Join Discord action is rendered. The channel link is labeled for existing members and is not presented as enrollment. Discord is not added to CSP `connect-src`, scripts, frames, Workers or static resources.

The historical `/api/play-beta/feedback` endpoint remains present for architectural history but returns `FEEDBACK_TRANSPORT_DISABLED` without reading a session or contacting Supabase. Existing migrations and completed PostgreSQL validation are preserved. The incomplete bounded concurrency exercise and the independent invitation, session, revocation and kill-switch gates remain open.
