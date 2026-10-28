# Privacy owner runbooks

Status: `HUMAN APPROVAL REQUIRED`. These procedures are designed to avoid disclosure and irreversible action. They do not authorize production deletion or migration.

## Access/export request

1. Open an opaque case ID; record request type/date/channel and no unnecessary message body.
2. Verify identity using mailbox plus signed-in/recent-reauth evidence. Never accept a user ID supplied alone.
3. Resolve the account server-side; record systems/categories in scope and any ambiguity.
4. Apply a second-person or deliberate owner review to cross-user/shared records.
5. Build the export in an isolated job, scan the manifest for secrets/other-user data, checksum it, and provide a short-lived one-time delivery.
6. Record delivery/failure and expire the artifact. Do not email raw database dumps or permanent Storage links.

## Correction request

Verify identity and ownership; distinguish profile correction from immutable game/audit history. Append a correction event where integrity requires preserving the original. Notify affected processors only after confirming the authoritative source.

## Deletion/closure request

Do not execute until the account-rights architecture is approved. Inventory legal/security/payment holds, shared game integrity, Scanner certification and dataset/model lineage. Produce a dry-run plan, obtain explicit production authority, execute bounded idempotent steps, verify each provider, and issue a receipt listing narrow retained categories and rationale. A Clerk deletion must not strand internal records, and database deletion must not leave an active Clerk account.

## Consent withdrawal

Authenticate, identify exact consent/purpose/version, immediately block future eligible use, mark the grant/permission revoked, and locate affected raw evidence, exports, dataset versions and model versions. Do not promise physical untraining from an already released model. Escalate feasibility and remedy to counsel/product; preserve only the minimal revocation proof.

## Scanner lifecycle dry-run

1. Use a synthetic/local inventory and `planScannerGovernanceLifecycle`; never production by default.
2. Review untracked objects, expired reservations and stranded uploads separately.
3. Confirm referenced/bound evidence is excluded and batch size is bounded.
4. Approve retention cutoff, holds, backup effect and recovery plan.
5. Production execution requires a separate change record, exact execution flag/idempotency key, adapter review, monitoring and post-run reconciliation. No Season 2 run reached this step.

## Incident notice

Contain without destroying evidence; record discovery time, systems/data/people potentially affected, safeguards, processors and jurisdictions. Notify provider security contacts and qualified counsel. Avoid unsupported promises or blame. Florida breach duties, FTC risk, contract notice windows, and international rules require fact-specific coverage analysis; use applicable statutory deadlines, not an invented universal timer.

## Rights dispute/denial

Document the request, evidence, applicable exception, decision owner, response and review path. Reveal neither security-sensitive logic nor another person's data. Counsel must review contested identity, legal hold, minor data, shared games, financial records, model-training withdrawal, and jurisdictional deadlines.

## Operational evidence template

Record case ID, policy/runbook version, identity method, categories/systems, dry-run counts, approvals, commands/tool versions, start/end, per-step result, exceptions, provider tickets, verification, receipt date and retention of the case record. Prohibit passwords, tokens, image bytes, full prompts, raw cookies, signed URLs, and private record content in logs.

