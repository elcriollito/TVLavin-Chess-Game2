# Play v2 direct public beta architecture

`PlayV2PublicBetaPolicy@1.0.0` admits exactly `/play/beta`, `/play/beta/games`, `/play/beta/bots` and `/play/beta/coach` only when `CAISSA_PLAY_V2_BETA_STAGE` equals the case-sensitive value `public-beta`. Access requires no account, invitation, cookie, beta session or Supabase runtime. Missing, disabled, internal, invite-only, unknown, differently cased or padded values fail closed.

The deterministic `play-v2-public-beta.html` excludes the invite redemption/session client. Its direct URL, the invite route, Players, every QA harness and unknown descendant return the runtime-free unavailable document. Classic `/`, Legacy `/play`, production `simplified=1`, FICS and educational products retain their separate owners. The public document preserves same-origin Workers and CSP while excluding auth, Clarity, analytics transport, FICS, Players and educational resources.

## Feedback and privacy

Public Beta uses [`PlayV2ManualQaFeedbackPolicy@1.0.0`](./PLAY_V2_MANUAL_QA_FEEDBACK_POLICY.md). CAISSA produces a local sanitized JSON snapshot; the tester explicitly copies or downloads it and manually posts it to Discord. The stable channel and replaceable 30-day invitation are centralized allowlisted navigation destinations. Neither is fetched, framed, opened automatically or added to CSP connection/resource directives. No report reaches CAISSA, Supabase, Discord or analytics until the tester explicitly leaves CAISSA and posts it.

## Kill switch and rollback

The operational procedure is owned by the [`Play v2 Public Beta operations runbook`](../operations/PLAY_V2_PUBLIC_BETA_RUNBOOK.md).

The operational kill switch is a deployment with `CAISSA_PLAY_V2_BETA_STAGE=disabled`. It makes all Play v2 beta routes unavailable while Classic and Legacy remain unchanged. Because environment changes require a deployment, no sub-60-second claim is made; Preview must measure the actual interval. Rollback is Vercel rollback to the previously approved deployment. Reopening requires a reviewed deployment restoring the exact `public-beta` value and repeating the bounded route/security smoke.

On page exit or reload, the public UI disposes clocks, engine requests, Worker ownership, lifecycle, board adapter and shell. The unavailable document contains no runtime. Release authority controls the Vercel environment and deployment/rollback operation; incident response records time, affected route, decision owner, verification and reopening evidence without report content or secrets.

The invite-only implementation and three Supabase migrations remain unmodified technical history. They were not deployed for this release path. Incomplete invite concurrency work is preserved as historical, not a Public Beta gate.
