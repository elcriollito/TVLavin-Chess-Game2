# Data Rights Runbook

Status: DRY-RUN PLANNER IMPLEMENTED AND TESTED; REAL EXECUTION NOT STARTED.

Files changed: `tools/data-rights/plan-request.mjs` and `tests/data-rights-plan.test.js`.

## Supported request types

Access, export, correction, deletion, account closure and consent withdrawal are represented by `tools/data-rights/plan-request.mjs`. Every plan sets `executionAuthorized: false`; destructive steps are preparation-only and require human review.

## Procedure

1. Record an opaque request ID and verify the requester through an established private channel. Never request a password, session token or private key.
2. Map the verified person to Clerk and Supabase identifiers. Do not use email addresses in the planner or logs.
3. Inventory Clerk identity/session data, Supabase rows, private Scanner objects, CAISSA Online data and verified processors.
4. Classify each item by controller/processor, purpose, consent, retention basis, backup behavior and legal hold.
5. For access/export, minimize the package, inspect it for third-party data and deliver through a verified private channel.
6. For correction, prepare owner-scoped mutations and independent before/after evidence.
7. For deletion/closure/withdrawal, prepare dependency-ordered actions: revoke sessions, restrict access, handle owned rows, handle private objects, then follow up with processors.
8. Require dual review for destructive actions. Run against synthetic staging identities first.
9. Record per-system completion, partial failure and retained exceptions. Never promise deletion from backups or provider logs without evidence.
10. Close only after verification; retain a minimized audit record according to an approved schedule.

## Safety properties tested

- Invalid request types and identifier-shaped email input fail closed.
- Deletion plans inventory before prepared action.
- Legal holds return partial-retention/counsel-review status.
- Access/export end in human-reviewed private delivery.
- Correction is owner-scoped and dry-run only.
- The CLI produces a valid plan from base64url JSON without printing credentials.

## Blocked

No production executor, provider deletion connector, backup purge guarantee, retention duration or automatic user-account mutation exists. These require policy approval, staging fixtures, processor-specific evidence and a separate destructive-action gate.
