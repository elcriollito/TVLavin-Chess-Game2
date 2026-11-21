# CAISSA Arena S001 Test Matrix

Branch: `feature/caissa-online-arena-s001`  
Final candidate: `d029d42c237f42d2f22fe5507a4d652094d2a2b5`
Execution date: 2026-11-20/21 (America/New_York)

## Final results

| Gate | Result |
| --- | --- |
| `npm run lint:online` | PASS |
| `npm run test:online` | 123/123 PASS |
| `npm run test:online:browser` | 108/108 PASS; 36 each Chromium, Firefox, WebKit |
| Public release focused tests | 28/28 PASS |
| `npm run release:public:audit` | PASS |
| PostgreSQL 17 clean-room apply | PASS |
| Separate-transaction rematch regression | PASS; 3 rounds, 6 unique opponent pairs |
| Supply-chain audit | PASS; 511 runtime files, 186 locked entries |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Supabase RLS/grants/advisors | PASS; intentional INFO findings documented |
| Hosted four-identity certification | PASS |
| Managed security scanner | unavailable; exact Git-range launcher error preserved |
| Four-human acceptance | PENDING |

## Hosted requirement coverage

Final tournament: `09c7ba7d-41ac-4dfe-bc70-ff24714dae53`

| Requirement | Evidence |
| --- | --- |
| Four distinct identities | four AUTH-004D Development subjects and browser contexts |
| Isolated auth/backend | exact Clerk issuer/azp and Supabase ref verified |
| Registration | four participants joined through hosted API |
| Simultaneous pairings | two active boards, four unique players |
| Legal moves and clocks | canonical move/version/clock assertions passed |
| Private Realtime | participant subscriptions passed; cross-game subscription denied |
| Scoring | hosted 2/1/0 totals and exact-once scored links |
| Re-pairing | no immediate rematch; all six unordered pairs represented |
| Reconnection | fresh browser context recovered active game/tournament |
| Completion | `completed`; 12/12 games completed and scored |
| Final standings | four ranks; six games per participant; A 8, B 8, D 4, C 4 |

## Defects found and closed

1. The public Vercel artifact omitted `api/_lib/online-arena.js`. The release
   manifest was regenerated and a recursive runtime-module regression was added.
2. Hosted separate transactions could immediately rematch the first finished
   board while the other board was active. The eighth clean-room migration waits
   for unseen active opponents; PostgreSQL and hosted reruns passed.
3. The certification script initially closed stale second-round IDs after bullet
   timeouts created later rounds. It now reads the final canonical active-game
   snapshot before completing the tournament.

Human QA remains a separate owner-led gate.
