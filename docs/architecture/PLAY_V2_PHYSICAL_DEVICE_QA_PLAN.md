# Play v2 physical-device QA plan

**Plan:** `PlayV2PhysicalDeviceQAPlan@1.0.0`

**Season:** 11.8.0

**Current status:** NOT PHYSICALLY TESTED. Environment and evidence packet prepared only.

No statement in this plan is device evidence. Desktop automation, WebKit automation, viewport emulation, CSS inspection, and user-agent substitution are pre-QA support only.

## Scope and certification boundary

The human matrix is iPhone Safari, Android Chrome, tablet portrait, and tablet landscape. Each platform covers Games, Bots, Coach, PostGame, Analyze, optional Mentor review, and Players absence. Physical certification requires an attributed evidence instance conforming to [`PLAY_V2_PHYSICAL_DEVICE_QA_TEMPLATE.json`](./evidence/PLAY_V2_PHYSICAL_DEVICE_QA_TEMPLATE.json), real-device observations, disposition of every case, no open P0/P1, and review by a named or neutral reviewer independent of the execution record.

This preparation does not certify iPhone, Android, tablets, VoiceOver, TalkBack, switch control, physical touch, browser chrome, safe areas, virtual keyboards, suspension, or device performance.

## Secure local testing architecture

```text
physical device on private LAN
        |
        | HTTPS; locally trusted QA certificate
        v
user-started private-LAN reverse proxy :8443
        |
        | HTTP loopback only
        v
CAISSA server 127.0.0.1:8000
        |
        +-- exact internal-stage gate
        +-- deterministic play-v2.html
        +-- same-origin Worker + CSP/MIME
```

`server.js` now defaults to `127.0.0.1`; a wider binding requires an explicit `CAISSA_SERVER_HOST` value. The preferred design keeps CAISSA loopback-only and lets a separately installed reverse proxy own the minimum private-LAN HTTPS listener. No public tunnel, cloud preview, query token, embedded credential, machine IP, automatic firewall change, or analytics transport is authorized.

HTTPS is required for the phone/tablet URL. The tester must provision a dedicated local hostname such as `caissa-qa.test`, private DNS/hosts resolution, and a locally trusted certificate. Trust installation is a human security action and must be removed after the session. If private name resolution, certificate trust, or an approved firewall rule is unavailable, stop: do not substitute a public tunnel or plain HTTP and do not claim the environment ready.

### Prerequisites

- clean checkout at the recorded commit and a verified SHA-256 of `play-v2.html`;
- Node version and reverse-proxy version recorded in session notes;
- device and host on a trusted private network, with guest/client isolation disabled only by the network owner;
- local CA trust installed only on the named test device with explicit human approval;
- OS firewall access approved by the user for the proxy executable/port only; this repository does not change it;
- notifications hidden or Do Not Disturb enabled before screenshots/video;
- no account login, credentials, real identity, private PGN, or personal notification captured.

### Exact server start and verification

From repository root in PowerShell, terminal 1:

```powershell
node scripts/build-play-v2.mjs --check
node --test tests/play/bot-worker-production-readiness.test.js
$env:CAISSA_PLAY_V2_BETA_STAGE='internal'
$env:CAISSA_SERVER_HOST='127.0.0.1'
node server.js
```

Terminal 2, after the user installs/configures an approved HTTPS reverse proxy and local CA:

```powershell
# Example for an already-installed Caddy binary; do not install automatically.
caddy reverse-proxy --from 'https://caissa-qa.test:8443' --to 'http://127.0.0.1:8000'
```

The user must configure private DNS (or the device equivalent) so `caissa-qa.test` resolves to the test host, trust only the proxy's local CA on the test device, and explicitly approve any narrowly scoped firewall prompt. Do not commit the resolved address. Record tool versions and the certificate expiration/fingerprint outside screenshots; do not record private keys.

Before device use, verify on the host:

```powershell
Invoke-WebRequest 'http://127.0.0.1:8000/play/beta' -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest 'http://127.0.0.1:8000/js/vendor/stockfish/stockfish-17-lite-single.js' -UseBasicParsing | Select-Object StatusCode,Headers
```

Then verify the HTTPS URL from the device without bypassing a certificate warning. Expected test URLs are:

- `https://caissa-qa.test:8443/play/beta`
- `https://caissa-qa.test:8443/play/beta/games`
- `https://caissa-qa.test:8443/play/beta/bots`
- `https://caissa-qa.test:8443/play/beta/coach`
- negative: `https://caissa-qa.test:8443/play/beta/players`

Analyze and Mentor are action-owned continuations and have no direct test URL. The negative Players URL must show the deterministic unavailable document. With terminal 1 restarted without `CAISSA_PLAY_V2_BETA_STAGE=internal`, `/play/beta` must also fail closed. Never place a stage value, token, credential, IP, PGN, FEN, or identity in a URL.

### Shutdown and rollback

Stop the proxy first, then CAISSA with Ctrl+C. Remove the local CA trust/profile and private DNS mapping after evidence transfer; revoke any temporary firewall permission. Delete unsanitized captures from shared locations. A P0/P1, gate bypass, certificate warning, unexpected external request, FICS/education surface, analytics transport, Worker from a non-self origin, or inability to identify the tested commit stops the session immediately.

## Session and evidence rules

The evidence schema requires session ID; tester name or neutral ID; date/time; manufacturer/model; affirmative physical-device confirmation; exact OS/browser versions; CSS viewport; observable DPR or null; orientation; network context; 40-character build commit; `play-v2.html` SHA-256; internal gate; test-case ID; pass/fail/blocked; observed and expected behavior; sanitized evidence filenames; issue severity; reproduction steps; and retest status.

It prohibits serial numbers, advertising IDs, IP addresses, account credentials, notification contents, private keys, and similar identifiers by omission. Evidence filenames remain local references; binary captures are not added automatically. A pass requires a written observation, not merely a screenshot. Desktop screenshots, Playwright emulation, user-agent changes, and automation cannot populate physical results.

For each session:

1. Copy the JSON schema into a separately controlled evidence instance and validate it without editing the schema.
2. Record exact build identity before testing: `git rev-parse HEAD` and `Get-FileHash play-v2.html -Algorithm SHA256`.
3. Execute every applicable case; mark unsupported platform features `blocked`, never pass.
4. Create an issue from the issue template for every failure; sanitize captures.
5. Retest fixes on a new commit/hash and retain original failure evidence.
6. A reviewer sets certification `passed` only when all required results pass, P0/P1 is empty, P2 limitations are explicitly accepted or closed, and evidence attribution is complete.

## iPhone Safari checklist

| ID | Manual case and expected evidence |
| --- | --- |
| IOS-001 | Open authorized root and Games URLs in Safari with no certificate warning; confirm internal identity, one board, no public navigation. |
| IOS-002 | Record initial portrait board rectangle; square, practical width, board-first hierarchy, no horizontal overflow. |
| IOS-003 | Record visible address/bottom navigation chrome expanded and collapsed; no clipped controls or false viewport jump. |
| IOS-004 | Inspect safe-area top/bottom in portrait and landscape, including home-indicator area; focus/touch content remains clear. |
| IOS-005 | Rotate during setup; selections persist, board remains square, layout settles without duplicate board. |
| IOS-006 | Rotate during an active game; position, active clock, orientation, and legal interaction persist. |
| IOS-007 | Scroll from board through setup/context and back; no scroll trap, nested horizontal scroller, or unreachable CTA. |
| IOS-008 | At the narrowest physically available viewport (record width; include 320 CSS px only if real), verify zero horizontal overflow. |
| IOS-009 | Tap-select a piece and legal destination; selected square and legal destinations remain visibly distinct. |
| IOS-010 | Drag a legal move if Safari/device supports it; otherwise mark blocked with platform limitation. |
| IOS-011 | Select White, Random, Black separately; announcement and resulting orientation match selection. |
| IOS-012 | Select every Quick Play preset; selected state and one Play CTA remain visible and accurate. |
| IOS-013 | Start once; immediate duplicate activation is rejected and authoritative board receives focus where Safari exposes it. |
| IOS-014 | Observe both clocks, switch after legal moves, and verify configured increment once per completed move. |
| IOS-015 | Resign; one Game Over/PostGame result appears and clocks/Worker stop. |
| IOS-016 | Promote White and Black to Queen, Rook, Bishop, Knight across cases; selector is reachable, focused/tappable, and dismisses correctly. |
| IOS-017 | Rematch preserves permitted configuration and creates one new game; New Game returns to setup without auto-start. |
| IOS-018 | Copy, Download, Save PGN individually; record Safari share/download/clipboard limitations honestly and verify no silent success. |
| IOS-019 | Launch Analyze from completed PostGame and Back; exact completed record returns. |
| IOS-020 | Explicitly launch Mentor, navigate First/Previous/Next/Last/move list, verify square review board/no overflow, then Back restores PostGame. |
| IOS-021 | Bots: four cards visible, zero Worker before Play, one after Play, responsive touch, zero after PostGame/route exit. |
| IOS-022 | Coach: compact setup, explicit Help, bounded non-answer message, no Academy content, clean PostGame. |
| IOS-023 | Configure Reduce Motion if supported; repeat mode/board/PostGame/Mentor transitions and record behavior. |
| IOS-024 | Exercise Safari page/text zoom features actually available; verify reflow/content preservation and record unsupported zoom separately. |
| IOS-025 | Background Safari during setup and active game, then return; record clock/session behavior and any OS suspension limitation. |
| IOS-026 | Expand/collapse browser chrome during active play and promotion; no control becomes clipped or untappable. |
| IOS-027 | Confirm Players is absent from visible content, tab order, VoiceOver rotor only if a human VoiceOver session is separately authorized. |

## Android Chrome checklist

| ID | Manual case and expected evidence |
| --- | --- |
| AND-001 | Open authorized root/Games URLs in Chrome with valid HTTPS and confirm internal identity, one board, no public navigation. |
| AND-002 | Portrait and landscape board geometry remains square/practical with zero horizontal overflow. |
| AND-003 | Collapse/expand address toolbar and use back/forward; viewport changes do not hide setup, clocks, promotion, or PostGame controls. |
| AND-004 | Inspect gesture-navigation bottom area and cutout/safe-area behavior; touch targets remain unobstructed. |
| AND-005 | Rotate during setup and active play; selections, position, clocks, and one-board ownership persist. |
| AND-006 | Tap-to-move and drag-to-move; selected/legal-square states remain visible and accidental scrolling does not commit moves. |
| AND-007 | White/Random/Black, every Quick Play preset, and single Play CTA remain reachable and truthful. |
| AND-008 | Verify clock switching and increment with recorded control; background/foreground once and record suspension behavior. |
| AND-009 | Promote both colors across Queen/Rook/Bishop/Knight cases; selector has visible focus/touch state and no clipping. |
| AND-010 | Complete/resign into PostGame; Rematch/New Game and Game Over ownership remain exact. |
| AND-011 | Copy/Download/Save PGN; document permission, download-manager, clipboard, or share-sheet limitations without false success. |
| AND-012 | Analyze and Back preserve the completed record. |
| AND-013 | Mentor explicit launch, board/move navigation/no overflow, and Back restoration. |
| AND-014 | Bots four cards; zero Worker before Play, one after, responsive touch, teardown after terminal/route exit. |
| AND-015 | Coach compact setup/Help/bounded content/no Academy/clean PostGame. |
| AND-016 | Android font size, page zoom, and reflow at supported settings retain content and safe touch targets. |
| AND-017 | Verify scrolling, toolbar transitions, and gesture edges introduce no horizontal scroller or unreachable control. |
| AND-018 | Confirm Players absent; do not claim TalkBack without a separately executed attributed TalkBack session. |

## Tablet portrait and landscape checklist

| ID | Manual case and expected evidence |
| --- | --- |
| TAB-001 | Portrait: board-first hierarchy, practical maximum square board, coherent stacked/side layout, panel does not unnecessarily shrink board. |
| TAB-002 | Landscape: board/context split uses available width, panel is bounded, board remains priority, controls are reachable. |
| TAB-003 | Rotate portrait↔landscape during setup and active play; one board, selections, position, clocks, and focus survive. |
| TAB-004 | Record EvaluationRail position/visibility in Games/Bots/Coach as applicable; it never overlaps board, clocks, or controls. |
| TAB-005 | Exercise touch/tap/drag, selected/legal squares, clocks, setup, all presets/colors, and Play CTA in both orientations. |
| TAB-006 | Promotion to all four pieces in both orientations; no clipped selector or unreachable option. |
| TAB-007 | PostGame hierarchy, PGN actions, Rematch/New Game, Analyze/Back in portrait and landscape. |
| TAB-008 | Mentor review board, move list, navigation, status wrapping, and Back restoration in both orientations. |
| TAB-009 | Trigger any legitimate field that invokes the virtual keyboard; verify board/control restoration. Mark not-applicable if no field exists. |
| TAB-010 | Use split view/multitasking if supported; record exact viewport and verify reflow/no clipping. Otherwise mark blocked. |
| TAB-011 | Bots Worker before/after/teardown and Coach Help/content boundaries in both orientations. |
| TAB-012 | Confirm Players absent and no empty mode slot in portrait, landscape, and supported split view. |

## Cross-platform mode matrix

| ID | Mode | Required physical outcome per platform |
| --- | --- | --- |
| MODE-001 | Games | Complete a short game or approved deterministic terminal setup; verify touch, clocks, promotion, PostGame, Rematch/New Game, Analyze. |
| MODE-002 | Bots | Four cards; zero Worker before Play, exactly one after Play, touch responsiveness, teardown on terminal and route exit. |
| MODE-003 | Coach | Compact setup, Help, bounded factual message, no answer leakage/Academy content, clean PostGame. |
| MODE-004 | Mentor | Explicit PostGame launch, square review board, move navigation/status, no overflow, exact Back restoration. |
| MODE-005 | Players | Absent from visible UI, accessible navigation, routes, and layout; direct route fails closed. |
| SEC-001 | Boundary | No FICS, education, analytics transport, external Worker, identity prompt, or public-gate bypass. |

## Severity and certification rules

- **P0:** security/privacy failure, public-gate bypass, data loss, or FICS/education boundary breach.
- **P1:** cannot start/complete a game; unusable board; fundamentally wrong clocks; impossible promotion; Worker orphan/crash; major accessibility blocker; repeatable overflow hiding required controls.
- **P2:** significant friction with workaround, rotation/layout failure, intermittent unreachable control, incorrect focus restoration, or unexplained platform-specific PGN limitation.
- **P3:** cosmetic, minor spacing, or nonblocking copy defect.

Any P0/P1 blocks certification and stops the affected session. P2 requires fix/retest or explicit risk acceptance by the release owner. P3 may be scheduled but must remain recorded. A failed retest remains open; a passed retest records the new commit/hash and never overwrites the original result.

## Automated pre-QA support

Required before handoff: deterministic entry; production-equivalent Worker artifact/provenance/CSP/MIME; internal enabled/disabled gate and canonical routes; Chromium/WebKit 320/360/390/768/1440 and rotation-equivalent matrices; safe-area CSS assertions; 44px touch targets; zero horizontal overflow; Games/Bots/Coach/PostGame/Mentor; Players omission; FICS/product/native boundaries; static guards; syntax; documentation; and whitespace checks.

These results must be labeled `automated-pre-qa`, never copied into physical `results`. Season 11.8.0 status remains NOT PHYSICALLY TESTED until actual human sessions are supplied and reviewed.

### Preparation-run automation disposition

The Season 11.8.0 preparation run passed the new plan/schema/server guards, deterministic regeneration, syntax, production-equivalent Worker checks, and the current Games, Bots, Coach, PostGame, Mentor, and Players-presentation feature specs. Chromium and WebKit Mentor/Players responsive matrices also passed.

Handoff is not fully green. The superseded `play-simplified-shell-mobile.spec.js` still expects a Worker before explicit Bots Play and an older deterministic engine harness; it reported 11 failures across Chromium/WebKit. The older beta-entry and FICS-isolation umbrella specs also retain pre-Coach and pre-lazy-Worker expectations; five such assertions plus one start-counter assertion failed while 32 current-feature checks passed. These failures are automation-maintenance blockers to a fully green pre-QA gate, not physical-device observations. They must be reconciled against the current certified contracts before a human session is treated as release evidence. No gameplay change is authorized by this plan.

### Season 11.8.0A reconciliation

The 17 findings are individually classified and resolved in [`PLAY_V2_AUTOMATION_OWNER_CATALOG.md`](./PLAY_V2_AUTOMATION_OWNER_CATALOG.md). The current mobile owner now targets the gated `/play/beta` document and current Games/Bots/Coach, lazy-Worker, Players-omission, PostGame, Mentor, responsive, safe-area, touch, focus, forced-colors, reduced-motion, and reflow contracts. Pre-Season-11 compatibility-query assumptions remain explicit historical metadata and do not contribute to current acceptance totals.

The start-counter result was a synchronous test-read race: the first action was accepted and disabled the CTA while awaiting its command; the snapshot was read before the success counter committed. The second activation was rejected and no duplicate lifecycle existed. The corrected test waits for the authoritative asynchronous counter without changing runtime behavior or its expected value.

The reconciled current browser catalog passes 90/90: 45/45 in Chromium and 45/45 in WebKit, including pointer, keyboard, touch, rapid-double, Retry, Back, Rematch, and mode-switch ownership. The current Games start, Worker, accessibility, and Classic/Legacy support group passes 23/23, and the focused current contract group passes 59/59. The repository-wide legacy-inclusive unit command reports 624/629 solely because five frozen Season 10 closure tests intentionally compare against the old release topology; they remain visible and are reported separately in the owner catalog.

Status remains **NOT PHYSICALLY TESTED**. Automation reconciliation cannot satisfy any physical-device or named assistive-technology case.
