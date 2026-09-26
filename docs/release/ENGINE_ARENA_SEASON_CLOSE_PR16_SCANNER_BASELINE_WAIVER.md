# Engine Arena Season Close — PR #16 Scanner Baseline Waiver

## One-time scope

This record authorizes the established one-time, PR-only Scanner baseline waiver for PR #16, `Engine Arena Season Close — Participant Types, New Match, Lc0 Dormant`.

- Reviewed code head before this documentation-only waiver record: `3ce61ca446d79a77f11a24bf8e48800e7b9e2aef`
- Base `main`: `39e36036fd66166d875d36cd96e82cdd492f1a44`
- Final PR head: the descendant containing only this waiver record, verified from PR metadata immediately before merge
- Follow-up: GitHub issue #9, `SCANNER-GATE-REPAIR-001`

The waiver is invalid if the base changes or if the final head contains any change other than the already certified Engine Arena release plus this documentation record.

## Baseline evidence

The failed required check is the unchanged Scanner workflow. It fails at:

`timeout and rate limit use stable typed responses`

with:

`Promise resolution is still pending but the event loop has already resolved` (`ERR_TEST_FAILURE`)

The latest ten listed Scanner workflow runs on `main` are failures. Run `36087211768` exhibits the same test and exact error. PR #16 changes no Scanner, ONNX/ORT, dependency, package-lock, or workflow file.

## Engine Arena evidence

- Arena/Lc0 unit contracts: 219/219
- Full local Chromium Arena matrix: 112/115 on the initial pass
- Product failure found by that matrix: fixed, then passed its focused Chromium rerun
- Remaining two static-server-only failures: PGN route and deployed SF19 CSP, both verified HTTP 200 on immutable Vercel preview
- EAP-002 functional Chromium: 6/6
- New Match and PGN focused units: 31/31
- Vercel preview checks: green
- Physical preview: correct participant selectors, Bots disabled, New Match visible and functional, four Stockfish providers, Lc0 absent, no Experimental Engines control, zero console errors

## Bypass boundary

Only the administrative merge bypass for PR #16 may be used. Scanner remains required globally. This release does not skip the failing test, modify Scanner code, alter the workflow, or weaken future branch protection.

The bypass mechanism and final PR head are recorded in the release report and PR metadata immediately before merge.
