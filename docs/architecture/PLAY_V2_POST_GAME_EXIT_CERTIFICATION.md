# Play v2 Clean PostGame Exit Certification

Season: **11.6.3**  
Contract: `PlayV2PostGameExitPolicy@1.0.0`  
Status: **locally certified; public-ready false**

## Exit inventory

| Path | Owner | Destination | Record / handoff | Cleanup and Back | Classification |
|---|---|---|---|---|---|
| Rematch | PostGame core | fresh Play v2 lifecycle | finalized record; no handoff | stop prior runtime; new lifecycle | allowed, primary |
| New Game | PostGame core | clean Play v2 setup | finalized record; no handoff | stop prior runtime; starts nothing | allowed, standard |
| Analyze | PostGame core + Analyze handoff | Analyze | finalized record; opaque local token | stop clocks/search/Worker; Back restores record | allowed, explicit |
| Review with Mentor | PostGame core + native review | isolated review workspace | finalized record; 128-bit local token | bounded analyzer; Back consumes token and restores record | allowed, explicit |
| Copy / Download / Save PGN | PostGame core / persistence | remains in PostGame | clipboard, temporary URL, or consent-local | URL revoked; no navigation | allowed non-exits |
| Browser Back / Forward | route controller + workspace owner | owned history state | history state only | deterministic owner cleanup | allowed |
| Refresh | browser + entry gate | gated entry | bounded session resolution | missing state fails closed | allowed fail-closed |
| Route exit | route controller | allowlisted CAISSA route | no automatic game transfer | runtime teardown | allowed fail-closed |
| Gate disable | beta entry | accessible unavailable state | none | teardown; no fallback | allowed fail-closed |
| Missing / malformed / expired handoff | destination handoff owner | safe unavailable or retained PostGame | rejected | bounded cleanup and safe return | allowed fail-closed |
| Legacy Play / FICS | product and FICS boundaries | none | prohibited | PostGame retained | prohibited |
| Academy / Puzzles / Endgame / courses | product boundary | none | prohibited | PostGame retained | prohibited |

## Contract and hierarchy

The frozen policy prohibits automatic navigation, silent fallback, Legacy Play and FICS fallback, completed-record mutation, PGN/FEN URLs, education recommendations, and analytics transport. Rematch remains the sole primary action. New Game, Analyze, and Review with Mentor are standard explicit actions. PGN operations remain secondary.

## Transition ownership

Analyze and Mentor are independent continuations. Both require a finalized GameRecord and reject concurrent activation through the single PostGame busy owner. Analyze retains its existing opaque local transport and route owner. Mentor retains its isolated 128-bit review session. Neither can fall back to the other, education, Legacy Play, or FICS.

Rematch stops prior runtime before creating exactly one new lifecycle and creates a Worker only when the selected local opponent needs one. New Game stops prior runtime, rotates to clean setup, and starts nothing automatically. Neither reuses transition handoffs.

## Cleanup and failure behavior

Before transition, the exit owner stops the clock, cancels engine requests, tears down active bot Worker ownership, and treats Coach assistance as terminal. PostGame owns one busy state, disables its action set with `aria-busy`, rejects double activation and New Game during a pending transition, and clears busy state on success or failure. Object URLs remain temporary and are revoked. GameRecord mutation count is zero.

Missing, malformed, expired, capacity-failed, duplicate, and consumed handoffs fail closed. Failed actions retain the completed record, announce concise feedback, and restore focus to their initiating control. Browser Back and Forward use existing route/workspace history ownership; a consumed Mentor session cannot recreate a workspace or select another record.

## Accessibility, security, and remaining gates

Automation covers logical order and semantic hierarchy, accessible names, busy state, failure focus, Back focus, browser history, reduced motion, forced colors through the certified PostGame suite, Chromium/WebKit contrast, responsive reflow, and existing touch targets. Physical devices and named screen readers remain pending.

No URL game data, upload, identity bridge, cookie, education-profile access, Memory/Mastery write, FICS connection, arbitrary destination, query credential, or analytics transport was introduced. Play v2 remains internal and not public-ready.
