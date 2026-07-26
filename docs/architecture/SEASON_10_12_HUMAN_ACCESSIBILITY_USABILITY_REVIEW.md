# Season 10.12 — Human Accessibility and Usability Review

## Scope and method

This is a reproducible internal simulation of the private five-item Endgame Run. It is not an external participant study and makes no claim of human-subject research. The review covers only:

`/endgame-trainer?trainerV2=1&multiMovePilot=1&privateEndgameRun=five-item`

The simulation uses the approved fixed artifacts and routes. It does not alter chess truth, authored trees, feedback strings, fingerprints, digests, approvals, persistence, analytics, or public eligibility.

## Profiles and task matrix

| Profile | Setup and reproducible task | Observed friction and severity | Resolution and expected outcome | Residual risk |
| --- | --- | --- | --- |
| Keyboard-only user | Fresh context; start, play, hint, cancel/confirm dialogs, retry and exit without pointer | Focus did not follow feedback or summary; destructive actions were immediate (blocker) | Exercise/feedback/summary focus is deterministic; native modal traps focus, Escape cancels and opener regains focus | Full screen-reader/browser combinations remain dependent on platform behavior |
| Screen-reader-oriented review | Inspect headings, names, turn, live regions and dialogs; play by board grid | Competing live regions and flat artifact feedback (high) | One atomic polite feedback region; human status precedes exact authored text | SAN pronunciation varies by voice |
| Mobile touch user | 320×568 through 412×915; complete moves, hints and modal actions | Dense controls and modal fit risk (medium) | One-column actions, 44 px controls, bounded/safe-area dialog and no horizontal overflow | Very short landscape viewports require normal vertical scrolling |
| Desktop mouse user | 1024×768 through 1920×1080; complete all five items | Feedback and next action were weakly grouped (medium) | Board remains primary; feedback and contextual actions stay adjacent | No new wide-screen visual redesign was authorized |
| Low-vision zoom user | Browser zoom 200%; inspect title, board context, feedback and modal | Long technical copy increased scanning (high) | Short title/mission, explicit turn, textual states and wrapping controls | Board squares necessarily shrink within available CSS width |
| Reduced-motion user | Emulate `prefers-reduced-motion: reduce`; complete an opponent reply | Artificial reply pause remained visible (medium) | Reply delay becomes zero and nonessential motion collapses | Native board library rendering is retained |
| First-time chess learner | Identify objective/turn, make a concept miss and recover | Internal titles and “Retry” did not explain the learning state (high) | Human labels distinguish result change from route departure; Try Again and Restart Exercise are explicit | Chess notation in the opponent announcement may still require familiarity |
| Experienced chess user | Use an accepted alternative and compare exact feedback | Sound alternatives could look like generic errors (high) | “Also winning”/“Result preserved” preserves truthful artifact detail below | Fixed teaching routes intentionally remain narrower than all sound chess |

## State-by-state initial audit

| State | Visible title / instruction / progress / turn | Actions and feedback | Focus / live / mobile | Confusion, severity and correction |
| --- | --- | --- | --- | --- |
| Run intro | “Private technical run”; five exercises | Start, Exit; generic readiness | No task focus; compressed on mobile | Purpose unclear (high): rename, explain temporary progress |
| Exercise start | Internal manifest title; `X / 5`; side embedded in one line | Hint, restart, exit | Title was not consistently focused | Goal/turn scanning burden (high): fixed human header order |
| Learner turn | Artifact feedback only | Hint/restart/exit | Board interactive | Next step ambiguous (medium): “Your turn” hierarchy |
| Opponent reply | Artifact opponent string | Controls remain rendered | Board lock existed; no dedicated human status | Waiting state unclear (high): “Black is moving…” and single reply announcement |
| Correct progress | Contract feedback | Continue only at terminal | Polite feedback but flat | Correctness type unclear (high): “Good move” plus exact text |
| Accepted alternative | Contract alternative | No explicit recovery wording | Same region as all outcomes | Could appear incorrect (high): “Also winning/holds” and Try Again |
| Authored concept miss | Contract miss | Board silently restored | No conditional focus | Chess loss vs lesson miss confused (blocker): “Still playable” |
| Objective miss preserving result | Contract miss | Board restored | No conditional focus | Objective and result conflated (blocker): “Result preserved” |
| Chess-result failure | Contract failure | Retry | Flat feedback | Severity unclear (high): “The result changed”, Retry Position |
| Technical unavailable | Generic neutral sentence | Retry/Restart/Exit | No hardened boundary | Recovery and retained progress unclear (blocker): neutral boundary copy |
| Hint 1 | Hint text | “Hint” | No stage label | Eligibility unclear (medium): Hint 1 of 3 |
| Hint 2 | Hint text | “Hint” | No stage label | Eligibility unclear (medium): Hint 2 of 3 |
| Hint 3 | Exact move revealed immediately | “Hint” | No warning modal | Irreversible independence change (blocker): confirm Show Move |
| Exercise success | Exact success plus generic continuation | Continue | Focus stayed near board | Completion could be missed (high): focus Exercise complete |
| Continue transition | Next internal title | Continue N | Partial focus behavior | Context switch weak (medium): focus next title |
| Final summary | Internal titles and independence yes/no | Global controls reused | Summary focus existed | Human interpretation weak (high): human labels and unsaved copy |
| Restart confirmation | None | Immediate restart | No modal | Accidental loss (blocker): accessible contextual confirmation |
| Exit flow | Immediate navigation | Exit | No modal | Accidental loss (blocker): confirm only with progress |

## Severity findings

### Blockers

- Restart Run and Exit Run discarded temporary progress without confirmation.
- Stage 3 revealed a move without an explicit independence warning.
- Exercise changes, important feedback and the final summary lacked reliable keyboard focus.

### High

- Exercise titles did not state the learner’s goal in plain language.
- Side to move and mission were not independently readable.
- Accepted alternatives, concept misses and objective failures shared a flat feedback surface.
- The summary exposed technical titles and did not clearly repeat that progress was unsaved.

### Medium

- Hint progression was not visible.
- Action labels were generic and inconsistent.
- Opponent work was not presented as an explicit human status.
- Runtime UI failures had no dedicated neutral recovery boundary.

### Low

- The private run needed tighter mobile action stacking and a persistent independence explanation.

## Implemented interaction contract

- Header order: exercise count, human objective, one-line mission, side to move, independence status.
- Feedback order: human status, plain-language explanation, exact immutable artifact feedback.
- Hint actions: Get a Hint, Hint 2 of 3, Show Move; Stage 3 requires a modal confirmation.
- Recovery actions: Try Again, Retry Position, Restart Exercise, Restart Run and Exit Run.
- Restart/exit confirmations state the current exercise and that nothing is saved. Completed-summary Exit is immediate.
- Native modal dialogs support keyboard focus containment, Escape cancellation and opener focus restoration.
- Keyboard-originated success, failure and concept-miss transitions move focus once; pointer interactions are not unexpectedly refocused.
- The final summary uses the five approved human labels and states “No progress was saved.”

## Board audit

The shared board retains its existing accessible grid contract: roving `tabindex`, arrow-key traversal, Enter/Space selection, piece and square labels, legal-destination labels, orientation, disabled and busy states. Season 10.12 adds a task-specific board label with keyboard instructions and does not change board mechanics.

## Verification recipe

1. Open the exact private route in a clean browser context.
2. Confirm no canonical link, `noindex,nofollow`, and no analytics or storage writes.
3. Complete the fixed five-position route with mouse, then keyboard.
4. Trigger accepted alternative, concept miss, objective failure and technical fallback paths.
5. Use two hints, cancel Stage 3 with Escape, confirm Stage 3 and verify independence is removed.
6. Exercise restart and exit confirmation cancellation/confirmation.
7. Repeat at 320, 375, 390, 768, 1024, 1440 and 1920 CSS pixels.
8. Repeat with reduced motion and run the automated accessibility scan.

Automated unit, integration, browser, integrity and build checks are the release evidence. Any manual observations remain internal simulation evidence only.

## Recorded internal task run

The following observable tasks were replayed against the fixed route in a clean browser context:

| Task | Observed result |
| --- | --- |
| Start without help; identify Exercise 1 objective and turn | “Promote the Pawn”, mission and “White to move” were visible before the first move |
| Complete one item | Exercise remained current until the contextual Continue action |
| Use Hint 1 and Hint 2 | Both stages retained independent eligibility and displayed their stage |
| Open Stage 3, cancel with Escape, reopen and confirm | Cancel restored focus to Show Move; confirmation changed independence to Not eligible |
| Accepted alternative, concept miss and objective-preserving miss | Each retained exact artifact copy and avoided “incorrect” or a false chess-loss claim |
| Chess-result failure and recovery | “The result changed” appeared with Try Again/Restart Exercise; retry did not restore independence |
| Restart, cancel, then confirm | Cancel restored opener focus; confirmation cleared run progress and restored eligibility |
| Complete all five items and interpret summary | Five human labels, 5 of 5, independence and unsaved status were explicit |
| Exit and refresh | Exit used contextual confirmation only with progress; refresh returned to Start Run with no progress |

No external interviews or participant observations were performed.
