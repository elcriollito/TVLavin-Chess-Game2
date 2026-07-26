# Season 10.13 — Private Endgame Run Operations

## Scope and operating model

This runbook covers only `five-item-private-endgame-run`. It does not authorize a public preview. The operational decision is made by the existing same-origin Vercel middleware at `/api/endgame/private-run-availability` before the browser imports the private manifest/runtime module or initializes the board.

The endpoint returns only the validated availability contract, uses `Cache-Control: no-store`, and never returns environment values, artifacts, approvals, digests, request metadata or user data. The browser also uses `cache: no-store`, `credentials: omit` and `referrerPolicy: no-referrer`. The safe default is disabled.

The repository has no existing mutable runtime configuration service such as Vercel Edge Config. Vercel deployment environment variables evaluated by the existing middleware are therefore the narrowest available mechanism. Updating them requires a normal Vercel deployment of the same or newer Git revision. Do not add a remote configuration vendor merely to bypass that deployment boundary. Reusing middleware also stays within the Vercel Hobby function limit.

## Configuration contract

Variable:

`CAISSA_PRIVATE_ENDGAME_RUN_ENABLED`

| Exact value | Result |
| --- | --- |
| `true` | Enabled when mode is absent or `enabled` |
| `false` | Disabled |
| Missing or empty | Disabled, configuration unavailable |
| Any other spelling, case or whitespace | Disabled, configuration invalid |

Optional variables:

- `CAISSA_PRIVATE_ENDGAME_RUN_MODE`: `enabled`, `disabled`, `maintenance`, or `emergency-disabled`
- `CAISSA_PRIVATE_ENDGAME_RUN_REASON`: one of the allowlisted reason codes in the source contract

Mode and boolean must agree. Any ambiguity fails closed. Never place tokens, reviewer data, artifact identifiers or explanatory free text in these variables.

## Activation

1. Obtain approval from the Repository owner and Release reviewer.
2. Set the production environment to exact `CAISSA_PRIVATE_ENDGAME_RUN_ENABLED=true`.
3. Leave mode unset or set it to exact `enabled`; use reason `operational`.
4. create a normal production deployment from the reviewed commit. Do not force push or rebuild artifacts.
5. GET the availability endpoint and verify status 200, `Cache-Control: no-store`, exact feature ID, `enabled: true`, `mode: enabled`, and no extra sensitive fields.
6. Open the private route and verify Start Run before testing any chess path.
7. Confirm Clarity, storage, cookies, analytics and telemetry remain absent.

## Immediate disable

1. Set `CAISSA_PRIVATE_ENDGAME_RUN_ENABLED=false`.
2. Set mode `emergency-disabled` and reason `manual-emergency-disable` for urgent containment, or mode `disabled` with an approved allowlisted reason.
3. deploy the current reviewed Git revision normally. This is a configuration deployment, not a source change.
4. Verify the endpoint returns disabled with `no-store`.
5. Open the private route in a fresh context. Expect “Private run unavailable”.
6. Confirm no manifest module, artifact request, board squares, controller, storage, analytics or Clarity.
7. Confirm the public trainer, individual inspector and historical two-item run still operate.

The platform currently has no safe mutable configuration plane that can alter an already-created Vercel function without a deployment. The kill switch still avoids artifact changes and uses the normal fast deployment/alias path.

## Maintenance

Set enabled to `false`, mode to `maintenance`, and reason to `scheduled-maintenance`, then deploy the reviewed revision. Expected copy:

- Private run temporarily unavailable
- This technical exercise run is undergoing maintenance.

Restore by returning to the approved enabled configuration and deploying normally. Do not publish an ETA unless separately approved.

## Session policy

Availability is checked:

- before importing and initializing the run;
- immediately before Start Run;
- immediately before Continue loads the next exercise;
- when Retry Availability Check is selected.

Artifacts are loaded lazily, one exercise at a time. A disabled check between exercises prevents the next artifact request and disposes the temporary controller/board state. There is no polling, WebSocket, webhook or background monitor. Refresh always rechecks and clears temporary progress.

## Incident response

| Scenario | Detection | Containment | Verification | Recovery and evidence |
| --- | --- | --- | --- | --- |
| Privacy regression | Automated network/storage audit or reviewer observation | Emergency-disable and deploy current revision | No Clarity/storage/analytics on private route | Fix normally; retain test output and deployment ID |
| Clarity unexpectedly loads | Request to `clarity.ms` or `window.clarity` exists | Emergency-disable; inspect suppression gate | Public Clarity remains scoped; private count is zero | Restore only after browser privacy suite |
| Artifact digest mismatch | Neutral integrity-failure state | Keep disabled; do not repair at runtime | Exact committed hashes and bindings | Review source change; new approval if content changed |
| Invalid configuration | Endpoint or UI reports safe invalid state | Correct exact values; remain disabled | Contract test and endpoint response | Deploy corrected configuration |
| Runtime exception loop | Repeated neutral technical state | Emergency-disable | No timers, board lock or artifact retry loop | Normal source fix and regression |
| Private route linked publicly | Navigation/sitemap/IndexNow audit | Remove link via normal commit; disable run | Crawl surfaces contain no private URL | Review referral risk and release evidence |
| Private source exposed | Protected-path audit returns non-404 | Emergency-disable and correct release boundary | All protected paths return 404 | Review access logs available from platform without copying query strings |
| IndexNow receives private URL | Submission evidence contains state URL | Stop further submissions; keep run disabled | Key route remains 200; private URL absent from sitemap | Correct source selection and record audit output |

Do not add logs containing query strings, FENs, moves, hints, digests or filesystem paths. Vercel may retain platform-level request URLs; repository code adds no operational logging. Access to and retention of platform logs remain an administrative residual risk.

## Rollback

Known-good predecessor: `b7e2237d0215be5a34a5dc59722bc2a663e93f66`.

1. Contain first with the disabled configuration.
2. Verify the predecessor exists with `git cat-file -e <sha>^{commit}` and inspect it read-only.
3. If source rollback is approved, create a normal revert commit or deploy the known-good SHA.
4. Never reset shared history, amend a published commit, rebase destructively or force push.
5. Wait for READY and verify the production aliases.
6. Confirm the private route remains disabled and public surfaces remain stable.

The rehearsal is non-destructive: Git object availability, artifact recovery, lack of database/schema migrations and normal-revert sufficiency are verified without changing production. There is no persistent run state or user data to migrate or reconcile.

## Release checklist

- [ ] Kill switch tested enabled locally/through interception
- [ ] Disabled tested
- [ ] Missing and empty configuration tested
- [ ] Invalid value and malformed response tested
- [ ] Maintenance and emergency-disabled tested
- [ ] HTTP failure and 5-second timeout tested
- [ ] Integrity failure remains neutral
- [ ] Between-item disable prevents the next artifact request
- [ ] Retry availability recovers only after an enabled response
- [ ] Clarity, analytics, telemetry, storage and cookies absent in every blocked mode
- [ ] Public Clarity integration unchanged
- [ ] IndexNow tests and key route pass
- [ ] Historical run and individual inspector pass
- [ ] Protected paths return 404
- [ ] Rollback procedure rehearsed non-destructively
- [ ] Production deployment SHA, READY state and aliases verified
- [ ] Production endpoint and private route finish disabled

## Emergency contacts

- Repository owner
- Vercel project administrator
- Privacy reviewer
- Release reviewer

No personal contact details are stored in this document.
