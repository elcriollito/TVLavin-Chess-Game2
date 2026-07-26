# Season 10.13A-R — Regression Gate Reconciliation

## Baseline

The audit began from clean `main` at `a7ee415c9accacda4a7109ba0042a9ca6c73588f`, equal to `origin/main`.

## Original failures and root cause

| Failure | Reproduction | Classification | Root cause and disposition |
| --- | --- | --- | --- |
| `cloudflare-worker/test.js` | `node cloudflare-worker/test.js` | optional-external-integration | Requires an explicitly deployed game-fetcher and `WORKER_URL`. It is excluded from the self-contained runner and retained under `npm run test:integration:worker`. |
| FICS load harness | `node gateway/fics-cloudflare-worker/scripts/load-test.mjs 5` | optional-external-integration | Requires a separately started gateway at `127.0.0.1:8787` or `FICS_GATEWAY_URL`. It remains available under `npm run test:integration:fics`. |
| Homepage metadata duplicate | `node --test tests/homepage-seo.test.js` | generated-output contamination | `.vercel/output/static/index.html` duplicated the source page during repository-wide HTML scanning. The test passes after generated output cleanup. |
| Polyglot metadata duplicate | `node --test tests/polyglot-tool.test.js` | generated-output contamination | `.vercel/output/static/polyglot.html` duplicated the source page. The test passes after cleanup. |
| Yahoo Classic matcher assertion | `node --test tests/yahoo-classic-seo.test.js` | obsolete historical assertion | It required the old single `/` matcher. Commit `a22c7ec` legitimately added `/api/endgame/private-run-availability` to the existing middleware before 10.13A. The test now verifies the exact current matcher array. |

No product defect was found. Season 10.13A did not change the code covered by the metadata or Yahoo matcher failures.

## Generated-output policy and canonical command

`npm run test:regression` deletes only known ignored, regenerable outputs and discovers tests from `git ls-files`. It excludes `.vercel`, dist/build, coverage, dependencies, Playwright reports/results, and temporary output generically. It runs versioned self-contained `*.test.*` files and the versioned FICS gateway unit tests. It cannot traverse copied build output.

The live tablebase, deployed Worker, and separately started FICS gateway are not counted as passes. The runner reports each as an explicit dependency skip with its independent command:

- `npm run test:endgame-remote-tablebase:live`
- `npm run test:integration:worker` with `WORKER_URL`
- `npm run test:integration:fics` with `FICS_GATEWAY_URL`

Once a dependency is configured, assertion and process failures propagate unchanged; there is no catch-all skip.

## Current matcher and preview contract

The edge matcher is exactly `/` plus `/api/endgame/private-run-availability`. Release authorization remains server-evaluated. `previewEntry=endgame-practice` is only an allowlisted routing selector: duplicates, unknown parameters, empty values, and injection fail closed. It cannot enable the release boundary. An unreleased shell loads no manifest, artifact, controller, or board.

## Integrity and residual risk

The reconciliation changes test infrastructure, one obsolete assertion, and documentation only. Product copy, visual behavior, artifacts, approvals, fingerprints, digests, pools, Knowledge, navigation, Clarity, IndexNow, kill switch, protected paths, and the deployed boundary are unchanged.

The remaining risk is that external integrations can drift while unavailable. They retain explicit commands and must be run when their named dependencies are available; they are never represented as passing during the self-contained regression.
