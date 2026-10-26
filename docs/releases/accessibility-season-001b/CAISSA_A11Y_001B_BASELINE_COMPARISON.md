# CAISSA Accessibility Season 001B — Baseline Comparison

Candidate base and detached comparison checkout are both commit `26e9d25bf4ffbd13fb8b4d253e3bdb03169dcf7b`. The candidate was never compared against the dirty developer checkout.

## Failure differential

| Suite/failure class | Production base | Candidate | Attribution |
|---|---:|---:|---|
| Affected-source Node aggregate | 2 known failures | Same 2 known failures | Not introduced |
| Legacy i18n browser assertions through `/play` | 4 | 4 | Existing tests target the intentionally unavailable Play shell |
| Opening Database external shard fetch | 1 | 1 | Same public download shard 404 class; external availability |
| Scanner legacy image-fixture flow | 20 | 20 | Same resource 404s and subsequent `readingView` timeout cascade |
| Chess TV CSP console assertions | 2 | 2 | Same pre-existing inline-handler CSP messages |
| Total broader browser command | 27 failed / 30 passed | 27 failed / 30 passed | No new signature or count |

## Exact source failures

1. `tests/i18n-foundation.test.js` reports `game-library-champions.html` missing the expected i18n-before-navigation ordering on both checkouts.
2. `tests/spectator-tv-v2-shell.test.js` expects `js/eco-opening-resolver.js?v=1.0.0`; both checkouts contain a different current asset reference.

These paths were not modified by the candidate in a way that caused or worsened either assertion. They remain backlog items and were not changed merely to make an aggregate suite green.

## Browser failure evidence

- The four i18n failures begin at `/play`, which is deliberately served by the current fail-closed unavailable gate. The focused EN/ES/PT navigation tests on `/analyze` pass in all three browsers.
- Opening Database Quiet Drag and its desktop geometry tests pass. The one parity failure is a same-origin client fetching unavailable public shard files from `downloads.caissa-chess.org`.
- Scanner initial-entry/chooser behavior passes where runtime recognition is not required. The recognition-dependent legacy tests cascade after resource 404s on both checkouts. Candidate-specific Scanner semantics, Axe, mobile visibility, modal focus cycling, Escape, and focus restoration pass.
- Chess TV functional geometry, workflow, persistent board, mobile layout, metadata-race, history, and exit tests pass. Two assertions reject known CSP inline-handler console messages that occur on both checkouts.
- All nine puzzle interaction checks pass, including promotion, en passant, progress retry, and engine exploration.

## Dependency differential

`package.json` and `package-lock.json` are identical. Both candidate and production-base installs report 6 npm advisories (1 moderate, 5 high). The combined Season 2.0 dependency/security changes were not imported.

## Behavioral parity with combined Season 2.0

Chess Gym, Opening Database, and Chess TV accessibility runtime files are byte-identical to the owner-tested combined build. The isolated candidate differs in shared bypass hardening, deterministic Play fallback active markers, Scanner modal keyboard containment, and Scanner consent text/control composition. The last three visible/behavioral differences define the targeted retest boundary; see [CAISSA_A11Y_001B_HUMAN_TEST_PARITY.md](CAISSA_A11Y_001B_HUMAN_TEST_PARITY.md).

## Conclusion

No new material regression is evidenced. Baseline failures remain real and disclosed, but they do not expand in count or signature in the accessibility candidate.
