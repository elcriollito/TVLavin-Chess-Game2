# Play v2 invite-only architecture

Status: **Season 11.9.0 implemented locally; external configuration and review required**

Contract: `PlayV2InviteOnlyPolicy@1.0.0`

## Boundary

Invite-only is a server-owned entitlement, never a frontend flag or secret URL. `CAISSA_PLAY_V2_BETA_STAGE=invite-only` is the hard ceiling. The durable `beta_program.enabled` record is the operational kill switch. Both must authorize access; failure, missing configuration, database failure, invalid session, prohibited route, and capability mismatch fail closed.

The first cohort is five testers. Games and Bots are admitted. Coach requires `coach_enabled` on the invitation. Players, FICS, Academy, classes, lessons, curriculum, Knowledge, Endgame Training, Clarity, behavioral analytics transport and public-beta remain prohibited. `/` and `/play` remain Classic and Legacy owners.

## Enrollment and session lifecycle

The local CLI creates a 256-bit opaque token and sends only its SHA-256 hash to Supabase. The invitation expires after seven days, permits at most three atomic redemptions and can be revoked immediately. The tester receives `/play/beta/invite#TOKEN`; the minimal landing removes the fragment with `history.replaceState` before its same-origin POST. It never writes the token to cookies, Web Storage or application history.

Successful redemption creates a separate 256-bit opaque session. Only its hash is durable. The browser receives `__Host-caissa_play_beta` with `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, a 24-hour idle lifetime and seven-day absolute ceiling. Logout and invitation/session revocation update durable state. Server authorization is checked before the entry document is served and at most every 45 seconds while it remains open.

Direct `play-v2.html`, QA documents, invalid descendants, query, fragment, History API and Web Storage cannot authorize entry. The Vercel entry function returns the runtime-free unavailable page on every error. Personalized responses use `private, no-store`, noindex, no-referrer and a same-origin CSP. The internal local QA gate remains separately owned; it is not enrollment.

## Feedback and privacy

`Send Beta Feedback` is mounted only on a server-authorized invite document. It collects an allowlisted category, comment, optional steps, current Games/Bots/Coach mode, optional device/browser text and explicit consent. It rejects PGN/FEN/move/account/credential-shaped submissions, strips markup and controls, and enforces 2,000/2,000/160-character bounds.

Supabase owns an atomic five-submissions-per-session-per-hour limit and 90-day deletion date. No identity, IP, fingerprint, game record, cookie, token or secret is stored. The review owner uses the restricted Supabase table/view until a separately authorized private administration surface exists.

`PlayV2InviteOnlyFeedbackSensitivePolicy@1.0.0` adds forward-only database defense in depth after the initial QA validation showed that a direct service-role RPC call could bypass the JavaScript validator. The corrective migration canonicalizes bounded feedback fields for matching, rejects contact/network, credential, game-record, spreadsheet-formula, markup and control-character shapes with the generic `FEEDBACK_REJECTED` code, and never stores or echoes rejected text. The API and PostgreSQL corpus share the same categories of evidence; real PostgreSQL behavior remains a required QA gate after the migration is applied.

Detection is deliberately bounded, not a promise of perfect PII recognition. It does not attempt unlimited homoglyph, semantic-language or obfuscation analysis. Natural sentences mentioning words such as “token”, “email”, “cookie” or “password” remain admissible when they do not provide a labeled value. Accepted content is stored after the existing API sanitization; direct RPC calls receive validation but no silent text rewriting.

## Threat model

| Threat | Control |
|---|---|
| leaked/replayed invitation | hash-only storage, seven-day TTL, three-use ceiling, atomic redemption, revocation |
| stolen session | opaque hash-only session, hardened cookie, idle/absolute expiry, revocation |
| CSRF | Strict cookie, exact HTTPS Origin/Host, session-derived CSRF header |
| XSS or feedback injection | same-origin CSP, text-only rendering, server sanitization and bounds |
| route/cache bypass | server entry owner, direct-document denial, no-store, exact route allowlist |
| storage/history fabrication | never accepted as authority |
| feedback abuse | durable per-session rate limit and no file upload |
| analytics/privacy regression | Clarity omitted; analytics transport prohibited |
| stale active session after closure | 45-second status check, shell disposal, Worker/lifecycle teardown, fail-closed navigation |

## External decisions and gates

The migration is versioned but unapplied. No Vercel variable or Supabase resource was changed. Before the first invitation: name the incident backup; confirm project/plan; configure Supabase and process-only secrets; choose the alert channel; complete Windows NVDA; run deployment security/rollback evidence and the bounded iPhone/iPad CSS/access smoke. Android remains excluded pending its own Chrome smoke.

Vercel Shareable Links may be an emergency protected-preview fallback only after plan verification. They are not the primary enrollment owner and must not replace per-route sessions.
