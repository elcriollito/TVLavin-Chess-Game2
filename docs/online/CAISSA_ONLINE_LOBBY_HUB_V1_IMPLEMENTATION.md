# CAISSA Online Lobby Hub v1

Status: local implementation; human visual review required before any hosted release.

## A. Architecture

### Navigation

Before:

`New Game | Games | Players`

After:

`New Game | Games | Lobby`

Lobby contains a lower-level tab set:

`Players | Tables / Offers | Tournaments`

The chessboard is a persistent sibling of the workspace. Main-tab and Lobby-subtab changes only toggle existing panels; they do not recreate the board adapter, leave matchmaking, or mutate a game. When a game is active, Lobby exposes `Return to game`.

The workspace retains one scroll owner (`.workspace-body`) and a fixed semantic footer. The board geometry variables, CAISSA Board adapter, move submission, clocks, Realtime and Quiet Drag code were not changed.

### Frontend/backend boundary

The current server contract exposes automatic matchmaking (`queue.join`, `queue.leave`), private challenges, player presence and canonical game commands. It does not expose a public offer directory or an atomic offer-accept operation. `Open Games` also remains disabled.

Consequently, the hosted-safe UI renders Tables / Offers as `Unavailable`. Visual rows are enabled only when both conditions hold:

- the host is loopback (`localhost`, `127.0.0.1` or `[::1]`); and
- the URL contains `fixtures=lobby`.

Those rows are labeled `Local fixture`, use synthetic names and provide no Join action. A query parameter on a hosted domain cannot enable them.

## B. Players

The existing player directory moved intact into `Lobby → Players`:

- active-presence count and nickname filter;
- canonical public display name projection;
- real rating only when present, otherwise `Casual`;
- `Available`/`Playing` presence presentation;
- private Challenge action with duplicate suppression;
- pending incoming and outgoing challenges;
- Accept/Decline through existing server commands.

No email, legal name, UUID or private matchmaking row is added to the presentation. Guests remain visibly distinguished by the existing server-projected guest identity rules.

## C. Tables / Offers

### Implemented UI states

- `Unavailable`: current real state; explains that no public directory is enabled.
- `Fixture`: loopback-only review state, visibly labeled as synthetic.
- the component structure can host future Loading, Empty and Error state copy without changing the primary navigation.

### Existing contracts

No current Online API event lists or accepts public offers. Presence and queues cannot be repurposed because they are private and have different semantics.

### Proposed future contract (not implemented or activated)

A separately reviewed season would require a minimal server-owned projection and commands such as:

- `offer.list`: bounded, cursor-based public projection containing offer id, safe public nickname, optional real rating, pool, clock, rated/guest classification and expiry;
- `offer.create` / `offer.cancel`: owner-only, rate-limited and idempotent;
- `offer.accept`: one transaction that locks the pending offer, verifies distinct and available players, validates clock/rating/guest constraints, expires competing state and creates one canonical game;
- an opaque offer id and version/idempotency key; no Clerk subject, internal UUID or queue row in the public payload;
- explicit RLS/grants and a service-only RPC boundary, followed by private game Realtime authorization.

Concurrency tests must prove one winner under simultaneous acceptance, replay rejection, expiry, creator cancellation and no self-acceptance. No SQL migration was created for this UI season because there is not yet an approved product/API contract to encode.

## D. Setup

The workspace footer now opens an accessible `Setup` dialog and retains `Fair Play & Help` inside it.

`Mute invitation pop-ups on this device` is functional:

- it suppresses the floating incoming/outgoing challenge notice;
- it does not remove the challenge from `Lobby → Players`;
- it does not leave matchmaking, cancel a game, block a server challenge or suppress game-critical status;
- disabling it immediately restores the normal notice for a still-valid challenge.

The preference is browser-local. Member and guest scopes are separated, and the storage key uses a truncated SHA-256 digest of authority plus subject so the raw subject is not stored in the key. Only one boolean is persisted. Malformed or unavailable storage fails closed to the unmuted default. No cross-device claim is made.

Future `Do not receive incoming challenges` is deliberately not present: it requires a server-enforced preference, authorization, abuse analysis and a separate migration/release gate.

## E. QA

Automated coverage added for:

- three main tabs and absence of a top-level Players tab;
- three Lobby subtabs, roving keyboard navigation and retained subtab state;
- `Play a Friend → Lobby → Players`;
- honest unavailable Offers state and loopback-only fixtures;
- active game preservation, stable board node and Return to game;
- active matchmaking preservation across tab changes;
- Setup open/close, focus return and persistent mute behavior;
- pending challenge access while the popup is muted;
- preference isolation across members and between member/guest authority;
- Tournament Coming Soon and isolated demo;
- horizontal overflow and board/workspace non-intersection.

Local certification results:

- `lint:online`: PASS.
- Online unit/contract tests: 84/84 PASS.
- Online browser suite: 93/93 PASS across Chromium, Firefox and WebKit, including the canonical `/online/tournaments` route opening `Lobby → Tournaments`.
- Public Identity: 23/23 unit/contract tests and 12/12 browser tests PASS across Chromium, Firefox and WebKit.
- Navigation: 9/9 PASS.
- Board foundation: 26/26 unit tests; 19 browser PASS and one intentionally omitted evidence-only case.
- Security regression set: 46/46 PASS; the focused diff review found no reportable security issue.
- `git diff --check`: PASS; no credential-like literal was found in the patch.
- Axe: no serious or critical finding in the Online mobile shell.

Geometry covers 1440×900, 1440×720, 1280×720, 390×844, 340×760, 320×700, the 900/901 px breakpoint and 25/33/50/67/80/100/125% browser-zoom equivalents on 2560×1440. Every case asserts a square board, no board/panel or menu/board intersection, no horizontal overflow and the approved 24–32 px desktop gap. A synthetic 83-row Offers table (three visible fixtures plus 80 injected layout rows) confirms that only `.workspace-body` scrolls while the workspace and Setup footer keep their height and lower boundary.

Quiet Drag remained unchanged. The final Chromium boundary run recorded zero geometry reads during pointer movement, cursor-lag p95 ≈1.2 ms, immediate drop presentation ≈4.1 ms, no long tasks and no visual rewind during an intentionally delayed ≈3.5 s authoritative response.

No hosted writes or remote configuration changes are part of this certification. Double acceptance is not applicable to the local UI because no public offer command or Join control exists; concurrency and atomic acceptance remain mandatory gates for the future backend contract.

## F. Evidence

All evidence uses the local browser harness and synthetic identities only:

- `docs/visual-evidence/online-lobby-hub-v1/lobby-players-1440x900.png`
- `docs/visual-evidence/online-lobby-hub-v1/lobby-offers-local-fixtures-1440x900.png`
- `docs/visual-evidence/online-lobby-hub-v1/lobby-tournaments-1440x900.png`
- `docs/visual-evidence/online-lobby-hub-v1/setup-open-1440x900.png`
- `docs/visual-evidence/online-lobby-hub-v1/setup-muted-1440x900.png`
- `docs/visual-evidence/online-lobby-hub-v1/lobby-mobile-390x844.png`

The Offers screenshot is not evidence of an active backend. Its banner explicitly marks the rows as local visual fixtures.

## G. GitHub

- Branch: `season/caissa-online-lobby-hub-v1`
- Base: `origin/main` at `6c27fefc0de3fd91732eecc9999e10d1eeda67d0`
- Base tree: `1ea495e51b22a798a04d4c67bdda3e17c0a19970`
- Worktree: `.caissa-cloud-gate/online-lobby-hub-v1`
- Production, hosted Supabase, Clerk and Vercel configuration: unchanged
- PR/deployment: not created by this local gate
- Candidate commit/HEAD/tree: recorded in the final Human Visual Test handoff; embedding the hash inside the same commit would make it self-referential

## Release boundary

The Lobby UI can proceed to human visual review. A functional public offer directory remains a separate backend/migration authorization gate and must not be represented as available until its server contract, RLS, concurrency and hosted rollout are certified.
