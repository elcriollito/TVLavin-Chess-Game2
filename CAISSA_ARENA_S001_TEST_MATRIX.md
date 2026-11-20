# CAISSA Arena S001 Test Matrix

Branch: `feature/caissa-online-arena-s001`  
Application candidate: `c9998be49ec2f542d742a0cc8a2655698ad5daee`  
Execution date: 2026-11-19/20 (America/New_York)

## Final automated results

| Gate | Command/evidence | Result |
| --- | --- | --- |
| Online syntax | `npm run lint:online` | PASS |
| Full Online unit/integration | `npm run test:online` | **116/116 PASS** |
| Arena-focused unit/static | included via `npm run test:online:arena` | **16/16 PASS** before final full run; all remain in 116/116 |
| Real PostgreSQL migration/lifecycle | PostgreSQL 17 plus `tests/online/arena-postgres-harness.sql` | PASS |
| Full Online browser matrix | `npm run test:online:browser` | **108/108 PASS** in Chromium, Firefox, WebKit |
| Arena browser cases | subset of full matrix | **12/12 PASS** (4 cases x 3 engines) |
| Board syntax | `npm run lint:board` | PASS |
| Board unit | `npm run test:board:unit` | **26/26 PASS** |
| Board browser foundation | `npm run test:board:browser` | **19 PASS, 1 expected skip** in Chromium/WebKit |
| Navigation | `npm run test:navigation` | **9/9 PASS** |
| Public release manifest audit | `npm run release:public:audit` | FAIL — stale baseline manifest also names untouched Yahoo Classic files; not regenerated in this scoped branch |
| Managed Codex Security diff scan | exact immutable range | BLOCKED by contradictory launcher HEAD error after setup validation succeeded |
| Four-real-user acceptance | protected hosted environment required | NOT RUN |

The npm warning about `onnxruntime-node-install` and the Playwright `NO_COLOR`
warning are existing tooling warnings. A WebKit test-server
`auth_configuration_unavailable` log occurred under the mocked browser harness and
did not fail a test.

## Requirement coverage

| Requirement | Automated coverage | Status |
| --- | --- | --- |
| Creation authorization | organizer flag/admin and production fail-closed API tests | PASS |
| Registration | authorized join API plus PostgreSQL participant insert | PASS |
| Duplicate registration | repeated same event and participant-count assertion in PostgreSQL | PASS |
| Withdrawal/rejoin | persisted withdrawn state, then distinct rejoin event in PostgreSQL | PASS |
| Four-player pairing | pure planner and real database lifecycle | PASS |
| Two simultaneous games | exact active-game count and four distinct players | PASS |
| No double pairing | planner test, transaction design, database distinct-player assertion | PASS |
| Color assignment | stable color-balance unit test | PASS |
| Rematch avoidance/rating preference | deterministic planner tests and SQL ordering assertions | PASS |
| Legal/illegal chess | existing canonical Online game-engine tests | PASS |
| Checkmate/stalemate/repetition | existing canonical Online game-engine tests | PASS |
| Resignation/draw commands | existing API and full browser native tests | PASS |
| Clock projection/expiration | existing server clock tests | PASS |
| Tournament countdown/expiration | browser recovery and PostgreSQL finishing transition | PASS |
| Result idempotency | `scored_at` guard plus repeated sync/points assertion | PASS |
| 2/1/0 calculation | unit and real database total-points assertions | PASS |
| Standings/tie break | unit sorting and final-rank database assertion | PASS |
| Successive pairings | second set of two active games after first results | PASS |
| Disconnect containment | expired-presence SQL assertion and recovery path | PASS (hosted timing test pending) |
| Refresh/reconnection | canonical Arena/game/countdown browser reload case | PASS |
| Duplicate/out-of-order Realtime | inherited resync coalescing tests plus Arena reload/polling | PASS |
| Invalid auth/guest | API denial tests | PASS |
| RLS/restricted RPC | migration grant/policy assertions | PASS (hosted policy exercise pending) |
| Feature isolation | dual gates and unconditional production disable tests | PASS |
| Board preservation | board-node identity and geometry across tournament navigation | PASS |
| Mobile ordering | board before tournament context at 390x844 | PASS |
| Accessibility | Axe serious/critical checks and keyboard navigation | PASS |

## Browser matrix

The final Online run executed 36 cases in each engine:

- Chromium: 36/36.
- Firefox: 36/36.
- WebKit: 36/36.

Arena-specific cases per engine:

1. authorized discovery, details, and join;
2. two simultaneous games plus board-preserving contextual navigation;
3. refresh recovery of membership, active game, and server countdown;
4. mobile board-first order and no serious/critical Axe findings.

The native suite additionally exercises desktop, short desktop, tablet/mobile
geometry, tab keyboard behavior, authenticated/guest flows, offers, players,
active-game actions, draw/resign, stale snapshots, polling, drag/drop, and
accessibility.

## PostgreSQL harness

The harness initializes an isolated PostgreSQL 17 cluster and applies:

1. `20261005204209_caissa_online_native_v1.sql`;
2. `20261011150814_caissa_online_hardening_only_v3.sql`;
3. `20261014035549_caissa_public_identity_v1.sql`;
4. `20261120033413_caissa_online_arena_s001.sql`.

It creates four synthetic members, heartbeats them, creates the Founders Beta,
joins all four, retries a join, withdraws/rejoins one member, starts the Arena,
asserts two unique games, ends/scored games, asserts two replacement games,
repeats sync to prove score idempotency, expires the Arena, confirms `finishing`,
ends remaining games, and asserts completion/final ranks. No remote database was
contacted.

## Browser defect resolved during QA

The first full run was 105/108 because one pre-existing native mobile test still
expected the legacy side menu that Mobile 2.0 intentionally hides. The test and
its geometry probe were corrected to the shipped destination header, targeted
checks passed in all three engines, and the final complete run passed 108/108.

## Evidence limitations

- No protected URL exists, so real Clerk tokens, hosted RLS, Supabase Realtime,
  cross-region Vercel concurrency, and touch feel on physical devices are not yet
  certified.
- Synthetic clients do not replace the required four-human test.
- The public-release manifest audit is not green on the baseline and was not
  broadened into an unrelated manifest rebuild.
- Managed security scan output is unavailable due to the recorded launcher error.
