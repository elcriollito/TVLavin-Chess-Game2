# Account data-rights architecture

Status: `FUTURE ACTIVATION`. Season 2 does not expose an irreversible account-deletion endpoint because identity scope, shared records, legal holds, provider workflows, retention criteria, and rollback are not yet approved.

## Proposed owner-operated state machine

`received -> identity-pending -> scoped -> approved/denied-in-part -> exporting -> executing -> provider-pending -> verified -> receipt-issued`

Every transition requires an operator identity, timestamp, reason code, request version, and append-only audit event. The public request reference must be opaque and must not expose account IDs, emails, storage keys, or signed URLs.

## Required request controls

1. Accept through `privacy@caissa-chess.org`; do not request credentials or tokens by email.
2. Verify mailbox control and the current Clerk session; require recent reauthentication for export/deletion. Provide a safe manual alternative for a lost account.
3. Resolve one canonical Clerk subject to internal user IDs server-side. Reject ambiguous, cross-user, or unsupported guest claims.
4. Freeze a category inventory and legal-hold decision before mutation.
5. Generate export artifacts server-side with category manifests, checksums, short expiry, one-time access, and no third-party secrets.
6. Execute only an approved per-category plan with idempotency keys, bounded batches, ownership predicates, and resumable checkpoints.
7. Reconcile Clerk, Supabase tables/Storage, provider-held data, logs/backups, support records, activated AI/payment processors, and local-device instructions.
8. Verify completion independently and issue a receipt listing completed, retained, provider-pending, and user-device actions without leaking identifiers.

## Category decisions required before code activation

| Category | Export approach | Deletion/retention decision still needed |
|---|---|---|
| Clerk identity/session | Provider export/reference | disable/delete sequence, recovery window, audit proof |
| Saved chess content/progress | structured JSON/PGN where meaningful | delete versus anonymize; dependency ordering |
| Online/shared games | user-visible record and participation metadata | preserve game integrity while removing unnecessary identity |
| Guest/anonymous data | only if a trustworthy claim can be proved | expiry/identifier mapping; do not disclose another guest's data |
| Scanner feedback/images | metadata plus user-submitted material if authorized | certification history, grants, Storage, dataset lineage, legal hold |
| Security/audit logs | generally descriptive inventory, not raw third-party data | minimum necessary retention and access restrictions |
| Payments | provider references and available statements | statutory/tax/refund/dispute retention; no transaction facts assumed |
| AI/provider data | prompts/results only if activated and attributable | provider deletion/retention limits and direct-user relationships |
| Backups | describe coverage and restoration behavior | delayed deletion/tombstone strategy and restore re-deletion |

## Flag-off implementation boundary

No public route, database mutation, Clerk action, or feature flag was added. This is deliberate, not a completed deletion feature. Safe implementation requires a dedicated branch after counsel approves the matrix and an isolated synthetic-account rehearsal proves reauthentication, cross-user denial, idempotent resume, partial provider failure, and restore/rollback behavior.

