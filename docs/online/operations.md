# Operations, rollout and rollback

## Required server environment

| Variable | Purpose |
|---|---|
| `CAISSA_ONLINE_ROLLOUT` | `off` (default), `internal`, `preview`, or `production` |
| `CAISSA_ONLINE_INTERNAL_USERS` | Comma-separated Clerk subject allowlist in internal mode |
| `CAISSA_ONLINE_RATED` | `1` enables rated pairing |
| `CAISSA_ONLINE_TOURNAMENTS` | `1` advertises Tournament Hall foundation |
| `CAISSA_ONLINE_MULTIBOARD` | `1` advertises multiboard foundation |
| `CAISSA_ONLINE_SPECTATORS` | `1` advertises spectator foundation |
| `CAISSA_BROWSER_ORIGINS` | Comma-separated exact browser origins allowed by CORS and Clerk verification; include each enabled preview origin |
| `CAISSA_CLERK_AUTHORIZED_PARTIES` | Optional additional exact Clerk `authorizedParties`; canonical `https://www.caissa-chess.org` is always included |
| `SUPABASE_URL` | Server and public Realtime project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database credential |
| `SUPABASE_PUBLISHABLE_KEY` | Safe browser key returned in public config; legacy anon-key names are accepted |
| Clerk variables | Existing shared Clerk verification configuration |

Never expose the service-role key to the browser. Keep all additional origin values exact, HTTPS-only outside loopback development, and free of paths or wildcards. Production remains unavailable until the migration and rollout are deliberately enabled.

## Staged release

1. Keep rollout `off`; review the migration, security report and threat model.
2. Apply and lint the migration on an isolated non-production Supabase branch.
3. Configure Clerk JWT integration, private Realtime and exact preview origins, then run the two-account matrix.
4. Set `internal`, populate the subject allowlist, and keep rated/tournament/spectator flags off.
5. Observe rejection, stale-version, reconnect, timeout, rate-limit and API latency signals.
6. Promote to `preview`; optionally enable rated play only after a rating audit.
7. Set `production` only after concurrency/load testing, rollback rehearsal and explicit product approval.

The endpoint enforces an instance-local first limit and a transactional shared Postgres user/bucket limit. Production fails closed if the shared limiter is unavailable. Default shared policy is 120 reads/minute, 90 writes/minute and 20 challenge creations/minute per authenticated Clerk subject.

## Safe rollback

Fast rollback is `CAISSA_ONLINE_ROLLOUT=off`. It preserves records and makes the protected endpoint unavailable; revert the web deployment if needed. Do not run destructive SQL during an incident.

The manual destructive script at `supabase/rollback/20261005204209_caissa_online_native_v1_rollback.sql` is a last resort. Export games/events, confirm rollout is off and target a non-production project first. It removes only `caissa_online_*` objects and their Realtime policy.

## Observability and privacy

Structured server logs contain event name, game ID, version, ply, pool, rated flag and termination. They omit authorization headers, Clerk tokens, emails, FEN, PGN and move payloads. Recommended dashboards: request error ratio by code, move commit latency, rejection/stale ratio, queue wait percentiles, reconnect frequency, timeout delay, shared-limit denials and Realtime-to-poll fallback rate.

## Known limits

- Presence is approximate and deliberately short-lived.
- Realtime is notification-only; polling adds read load.
- The game row broadcast is bounded but can approach the 512 KiB PGN ceiling; move to compact invalidation payloads before materially raising the history limits.
- Tournament pairing/organizer APIs and public spectator projections are not enabled in v1.
- Fair-play detection and appeals are future work; no engine-side claims are made.
- Local database lint requires a running Supabase/Docker stack; repository-only validation cannot replace a real branch apply.
