# Play v2 automation owner catalog

## Season 11.8.1A product-boundary characterization reconciliation

Commit `4d5e57aab7a9e1bd68710d32745a402d7d1369bc` introduced the original runnable product-boundary owner when `PlayV2ProductBoundary@1.0.0` admitted only Games, Bots and Analyze. Its historical characterization expected hostile `/play/coach` activation to resolve to Games, only two keyboard mode tabs, no Mentor action, the pre-result-first `White wins.` copy and the original six-action PostGame.

Those expectations remain historically valid for that commit but are not current acceptance owners. Commit `a0225a75f9b0211a2f18bd726479920bb3bb2e0f` intentionally admitted isolated native Coach through `PlayV2CoachBoundary@1.0.0`; commit `74017555715659fc7237b0b4675fc6c3b8e3a55f` bounded it through `PlayV2CoachAssistancePolicy@1.0.0`. The educational Coach stack remained prohibited. Commit `0af77a02a1622c8797723a2b3f35e303c9848898` introduced result-first `PlayV2PostGamePolicy@1.0.0` and its deterministic `You Won`/reason vocabulary; `55f5d98fe808df8ef534f9a00588876420d9e282` admitted optional post-game Mentor. Season 11.8.1A introduces the explicit 1.1.0 successor with Analyze primary while preserving the frozen 1.0.0 Rematch-primary declaration in policy history.

The runnable owner now verifies Games, Bots and native Coach admission; legacy Coach, Players, FICS and educational-resource prohibition; optional post-game-only Mentor; completed-record-only Analyze; the 1.1 hierarchy; disabled analytics; zero Training Memory/Mastery writes; three-tab keyboard navigation; one board; and lazy zero-Worker behavior before explicit Bots Play. No old assertion is skipped, suppressed or silently deleted: its original meaning and superseding evidence are retained here.

Season 11.8.1C-E reconciles the runnable lazy-loading owner with those same versioned contracts. Its former eager-Worker, Mentor-absent and Coach-blocked assertions remain historical characterization here: passive entry creates zero Workers under Native Bots Worker Readiness; optional PostGame Mentor is admitted only by `PlayV2MentorReviewBoundary@1.0.0`; native Coach is admitted only by `PlayV2CoachBoundary@1.0.0`, while the educational Coach stack remains prohibited. The runnable owner now checks those current policies directly without skips or expected-failure suppression.

The PostGame exit owner also retains its earlier history-navigation characterization. Commit `42c64aa8d82794ce6d45d6ad9debff4fb4d532d9` intentionally made completed-game Analyze an inline Play v2 overlay. Its current Back owner is the explicit `Back to PostGame` action, which restores the identical retained record without a history forward cycle or handoff token in the URL.

The Games quick-play owner likewise follows the completed-record Analyze boundary: `createFromCompletedPlayRecord` requires at least one legally replayable move. Its current scenario completes a played game, verifies that the opaque token remains out of the URL, and returns through the inline `Back to game result` control. Immediate zero-move resignation remains valid PostGame evidence but is not misrepresented as replayable analysis input.

Mobile Playability Polish intentionally made the beta Game setup disclosure collapsed on compact entry. The current Games owner must activate the visible `Change` disclosure before expecting its radio controls in the accessibility tree. The non-minimal compatibility route remains expanded. The same polish revision split each preset's formerly continuous `value · category` text into stacked nodes and accidentally dropped the middle dot from both visible and accessible names. That runtime labeling regression is corrected at the canonical Games preset owner; the exact names remain `1+0 · Bullet` through `15+10 · Rapid`, rather than being weakened in automation.

The Games owner scopes hidden-radio counts to its own disclosure because four inactive Legacy radios remain mounted outside that owner. Its Advanced Options characterization retains settings, flip, FEN, PGN and legacy controls, but no longer treats direct setup navigation to Analyze as an accepted handoff: current product policy admits Analyze only as an explicit continuation of a completed GameRecord.

The same desktop-experience commit moved Coach level, focus and timing into the shell-owned Assistance disclosure while leaving time control and color in the compact Coach setup. It also moved in-game Help into the shell-owned active-game action bar. The original Coach browser owner's five-combobox-in-panel and panel-owned Help characterizations are preserved in its introducing revision; current ownership asserts the two setup controls, three separate Assistance controls and active-game Help without restoring the prohibited educational Coach stack.

Beta mode navigation in that commit also adopted the explicit labels `Play Game`, `Play Bots` and `Play Coach`. Worker lifecycle ownership is unchanged; its runnable browser owner uses the current accessible tab name while the earlier `Games` label remains visible in repository history.

**Catalog:** `PlayV2AutomationOwnerCatalog@1.0.0`

**Season:** 11.8.0A

**Status:** NOT PHYSICALLY TESTED. This is automated pre-QA support only.

## Current Season 11 acceptance owners

Only the following suites contribute to current Play v2 acceptance. Historical characterization remains visible in the next section but is never merged into these totals.

| Area | Current owner |
| --- | --- |
| Contracts | current `tests/play/play-v2-*.test.js`, Worker production-readiness, and owner-catalog guards |
| Routes and gate | `play-v2-beta-entry.spec.js`, `play-v2-beta-entry.test.js` |
| Games | `play-games-quick-play.spec.js`, `play-games-panel.spec.js`, playable-readiness contracts |
| Bots | `play-bots.spec.js`, `play-bot-worker-readiness.spec.js`, Worker production-readiness contracts |
| Coach | `play-native-coach.spec.js`, Coach boundary and assistance contracts |
| PostGame, Analyze, Mentor and exits | `play-post-game-exits.spec.js`, `play-native-mentor-review.spec.js`, corresponding contracts |
| Players | native policy and presentation-policy unit/browser suites |
| Responsive and mobile | `play-simplified-shell-mobile.spec.js` at `/play/beta` plus feature-specific viewport matrices |
| Accessibility | current feature Axe, focus, forced-colors, reduced-motion, touch-target, and reflow assertions |
| Classic and Legacy | `play-v2-fics-isolation.spec.js` ownership-separation case and compatibility regression owners |
| Physical-QA preparation | `play-v2-physical-device-qa-preparation.test.js` |

## Historical characterization

`tests/browser/historical/play-simplified-shell-mobile.characterization.js` preserves the pre-Season-11 compatibility-query assumptions as immutable metadata. It is deliberately named without `.spec.js`: it is not a skipped test, is not discovered as current Playwright acceptance, and is validated by `play-v2-automation-owner-catalog.test.js`.

The Bots browser owner preserves the original `25bb006`/`c75ccdf` pending-versus-active profile characterization through the Bot session unit owner, without attempting to operate the now-hidden setup catalog during active play. Current public-flow ownership proves that profile selection is setup-only and creates no Worker, the active catalog is hidden from rendering and the accessibility tree, an active profile remains immutable, Rematch retains it, New Game returns to setup and admits a next-game profile, and entering Games restores Full Power. Worker ownership is asserted as zero during setup and PostGame, exactly one during Bots play, and zero again after termination.

`play-v2-identity-mode-transitions.spec.js` owns `PlayV2IdentityPolicy@1.0.0` propagation and the six `PlayV2ModeTransitionPolicy@1.0.0` PostGame-to-different-mode flows. It proves that the new Games identity is `CAISSA`, persisted historical bytes are not rewritten, completed-mode presentation is cleared, the standard board is reset without auto-start, resource ownership is zero before target Play, routing remains canonical and focus enters the target setup. Same-mode PostGame selection remains inert; New Game retains current-mode setup ownership.

The superseded expectations are: Coach absent; Coach/Mentor/Players policy resources all prohibited by name; `/play/beta/coach` unavailable; exactly two mode tabs; a Worker already present after generic Games start; legacy drawer/Help ownership; and a fake engine `e4 e5` response at every legacy compatibility viewport. Current contracts instead admit isolated Coach, load passive policy resources, keep Mentor action-owned and Players absent, create the Bots Worker only after Bots Play, and use the dedicated beta document.

The five `season-10-closure.test.js`, `season-10-post-deployment.test.js`, `season-10-release-package.test.js`, and `season-10-release-readiness.test.js` failures produced by the repository-wide legacy-inclusive unit command are also frozen historical characterization. They deliberately compare the working repository with the Season 10 closure topology (1–2 commits ahead and no later `index.html`/`server.js` changes). They remain runnable and visible as 624/629, are not changed or skipped, and are reported separately from the green current Season 11 owner set.

## Initial 17-failure disposition

| # | Suite/test and assertion | Observed | Origin and current evidence | Classification | Resolution |
| --- | --- | --- | --- | --- | --- |
| 1 | beta entry: canonical modes; Coach count expected 0 | Coach tab 1 | Season 11.2 entry; superseded by `PlayV2CoachBoundary@1.0.0` | obsolete expectation requiring update | Assert Coach visible; Mentor/Players absent. |
| 2 | beta entry: hostile state; prohibited resource list expected empty | four passive Coach/Mentor/Players policy files | Season 11.2 graph; superseded by Coach, Mentor-review, and Players policy contracts | obsolete expectation requiring update | Prohibit contaminated stacks/providers, allow passive boundary policies. |
| 3 | beta entry: descendants; Coach expected unavailable | Coach internal document | Season 11.2 routes; superseded by Coach boundary | obsolete expectation requiring update | Remove Coach from prohibited descendants; retain Mentor/Players/malformed negatives. |
| 4 | beta entry: setup tabs expected Games/Bots | Coach is third tab | Season 11.2 shell; superseded by Coach boundary | obsolete expectation requiring update | Assert exact Games/Bots/Coach set. |
| 5 | beta entry: `successfulStarts` expected 1 synchronously | 0 before asynchronous commit | Season 11.2 test harness; `GamesPanel.submit()` disables synchronously and increments after awaited engine readiness | timing/race defect | Poll authoritative counter; retain immediate duplicate rejection. |
| 6 | FICS isolation: Worker expected 1 before Bots Play | 0 | eager-Worker era; superseded by production Worker readiness and Bots contract | obsolete expectation requiring update | Assert zero before Play, one after Bots Play. |
| 7 | mobile rotation Chromium: Worker expected 1 after generic Games start | 0 | pre-Season-11 compatibility harness | frozen historical characterization | Current suite uses beta lifecycle and separates Bots Worker case. |
| 8 | mobile compact Chromium: history expected `e4,e5` | only `e4` | fake-engine legacy harness no longer owns beta mobile | legacy-only product test | Preserve metadata; current mobile owner tests current UI/lifecycle. |
| 9 | mobile standard Chromium: same response assertion | only `e4` | same | legacy-only product test | Same resolution. |
| 10 | mobile tablet portrait Chromium: same response assertion | only `e4` | same | legacy-only product test | Same resolution. |
| 11 | mobile tablet landscape Chromium: same response assertion | only `e4` | same | legacy-only product test | Same resolution. |
| 12 | mobile rotation WebKit: Worker expected 1 | 0 | pre-Season-11 eager Worker | frozen historical characterization | Same lazy-Worker separation. |
| 13 | mobile drawer WebKit: legacy toggle expected focused | inactive | legacy navigation on compatibility query; beta hides it | legacy-only product test | Current beta focus assertions replace legacy drawer ownership. |
| 14 | mobile compact WebKit: response expected `e4,e5` | only `e4` | legacy fake-engine harness | legacy-only product test | Preserve metadata; remove from current totals. |
| 15 | mobile standard WebKit: response expected `e4,e5` | only `e4` | same | legacy-only product test | Same resolution. |
| 16 | mobile tablet portrait WebKit: response expected `e4,e5` | only `e4` | same | legacy-only product test | Same resolution. |
| 17 | mobile tablet landscape WebKit: response expected `e4,e5` | only `e4` | same | legacy-only product test | Same resolution. |

## Start-counter diagnosis

The old assertion performed two synchronous `HTMLElement.click()` calls inside one `page.evaluate()` and immediately read the snapshot. The first call entered readiness, marked the CTA busy/disabled, and awaited engine startup; the second was rejected. The snapshot was captured before the first promise committed, so `successfulStarts` was correctly still zero. Production ownership was not duplicated.

The corrected owner waits for the asynchronous authoritative counter while continuing to prove immediate duplicate rejection. GamesPanel, lifecycle, clock, GameRecord, Bots, Coach, Retry, Back, Rematch, mode-switch, pointer, keyboard, and touch owners collectively enforce one accepted action, one lifecycle/game, one record projection, no more than one required Worker, and one clock service. No runtime change or expected-number substitution was made.

## Commands and reporting rule

Current acceptance and historical characterization must be reported separately. The current catalog is run explicitly by path; the historical metadata guard runs under the unit suite. No skip, filtering flag, retry, timeout increase, or caught assertion is an accepted reconciliation mechanism.

The initial reproduction commands and 32/38 and 15/26 results are recorded in the Season 11.8.0 physical-device plan. After reconciliation and explicit pointer, keyboard, touch, rapid-double, Retry, Back, Rematch, and mode-switch coverage, the combined current catalog passes 90/90: 45/45 in Chromium and 45/45 in WebKit. The supporting Games start/Worker/accessibility/Classic-Legacy group passes 23/23 in Chromium. The legacy-inclusive unit command remains 624/629 with only the five frozen Season 10 findings above; the focused current Season 11 contract group passes 59/59. One combined-run timeout before reporter output was not reproducible: no port-8000 listener remained, the isolated WebKit case passed, and the complete WebKit catalog subsequently passed without timeout inflation or retry configuration.

Physical-device and named assistive-technology evidence remain mandatory human gates.
