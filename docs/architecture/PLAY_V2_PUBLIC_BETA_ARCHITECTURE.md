# Play v2 direct public beta architecture

> **Superseded by Season 11.10:** Play v2 is now the official experience at `/play`, `/play/games`, `/play/bots`, and `/play/coach`. The former four `/play/beta` routes redirect permanently to those canonical routes. The `public-beta` environment value remains only as the existing internal activation/rollback mechanism; it is not user-visible branding or a canonical URL. Players, invite, QA, unknown descendants, historical APIs, and direct generated HTML remain fail-closed.

## Historical Season 11.9.3 record

`PlayV2PublicBetaPolicy@1.0.0` admits exactly `/play/beta`, `/play/beta/games`, `/play/beta/bots` and `/play/beta/coach` only when `CAISSA_PLAY_V2_BETA_STAGE` equals the case-sensitive value `public-beta`. Access requires no account, invitation, cookie, beta session or Supabase runtime. Missing, disabled, internal, invite-only, unknown, differently cased or padded values fail closed.

The deterministic `play-v2-public-beta.html` excludes the invite redemption/session client. Its direct URL, the invite route, Players, every QA harness and unknown descendant return the runtime-free unavailable document. Classic `/`, Legacy `/play`, production `simplified=1`, FICS and educational products retain their separate owners. The public document preserves same-origin Workers and CSP while excluding auth, Clarity, analytics transport, FICS, Players and educational resources.

## Feedback and privacy

Public Beta uses [`PlayV2ManualQaFeedbackPolicy@1.0.0`](./PLAY_V2_MANUAL_QA_FEEDBACK_POLICY.md). CAISSA produces a local sanitized JSON snapshot; the tester explicitly copies or downloads it and manually posts it to Discord. The stable channel and replaceable 30-day invitation are centralized allowlisted navigation destinations. Neither is fetched, framed, opened automatically or added to CSP connection/resource directives. No report reaches CAISSA, Supabase, Discord or analytics until the tester explicitly leaves CAISSA and posts it.

## Kill switch and rollback

The operational procedure is owned by the [`Play v2 Public Beta operations runbook`](../operations/PLAY_V2_PUBLIC_BETA_RUNBOOK.md).

The operational kill switch is a deployment with `CAISSA_PLAY_V2_BETA_STAGE=disabled`. It makes all Play v2 beta routes unavailable while Classic and Legacy remain unchanged. Because environment changes require a deployment, no sub-60-second claim is made; Preview must measure the actual interval. Rollback is Vercel rollback to the previously approved deployment. Reopening requires a reviewed deployment restoring the exact `public-beta` value and repeating the bounded route/security smoke.

On page exit or reload, the public UI disposes clocks, engine requests, Worker ownership, lifecycle, board adapter and shell. The unavailable document contains no runtime. Release authority controls the Vercel environment and deployment/rollback operation; incident response records time, affected route, decision owner, verification and reopening evidence without report content or secrets.

The invite-only implementation and three Supabase migrations remain unmodified technical history. They were not deployed for this release path. Incomplete invite concurrency work is preserved as historical, not a Public Beta gate.

## Vercel Hobby deployment ownership

`PlayV2BetaEntry@1.0.0` is enforced by the existing Vercel middleware rather than a new Serverless Function. The middleware matches the beta namespace, the historical beta API namespace, and every generated Play v2 HTML filename in addition to its pre-existing owners. It evaluates the exact case-sensitive deployment stage before selecting a document, returns the generated public document only for the four allowlisted routes, and returns the runtime-free unavailable document for every other stage or beta-shaped route. Direct generated documents are always unavailable, independent of stage.

Vercel filesystem routing can serve a root static asset before a rewrite. Direct filename interception must therefore remain in the middleware matcher rather than relying on the unavailable rewrites alone. Query, encoded-extension, trailing-path, and descendant variants do not authorize a document and do not redirect to or reveal the internal asset URL.

The six former `api/play-beta/*.js` entrypoints are preserved unchanged under `history/play-v2-invite-only/api/play-beta/`. They remain reviewable version history but are excluded from Vercel upload and cannot become routes. The middleware returns a uniform 404 for the retired API namespace without loading the historical store, Supabase, cookies, sessions, or feedback transport. This restores the deployable inventory to the 12 production API functions that preceded invite-only work; middleware is not counted as an additional Serverless Function.

The generated module `api/_lib/play-v2-public-beta-document.js` is an implementation artifact owned by `scripts/build-play-v2.mjs`. It embeds the exact deterministic public and unavailable documents in the middleware bundle and is not an API entrypoint or static public route. Editing it directly is prohibited; deterministic generation must reproduce it byte-for-byte.

The deployment-source boundary excludes historical code, repository-local Vercel output, test results, browser reports, coverage, logs, private keys, certificates, and QA artifacts. Local Vercel output must be audited from a clean deployment-source copy because the local CLI builds the supplied directory directly, whereas Git deployments apply `.vercelignore` before building. A recursive build from a developer worktree is not valid release-size evidence.
