# Retention Schedule Proposal

Status: READY FOR OWNER/COUNSEL REVIEW; NOT IMPLEMENTED.

No fixed period below is asserted as a current guarantee. The owner must approve a lawful operational period after confirming provider capabilities, dispute/security needs and backup behavior.

| Data class | Proposed trigger and rule | Current state |
| --- | --- | --- |
| Clerk identity/session data | Account life plus the shortest provider/security period justified after closure | BLOCKED on provider retention evidence |
| Supabase account/profile rows | Account life; owner-scoped deletion after approved closure workflow, subject to holds | NOT STARTED |
| Scanner transient image processing | Memory/request life only; no durable image created by recognition | IMPLEMENTED and TESTED |
| Optional Scanner correction | Until consent withdrawal/deletion or an approved bounded research-review period | BLOCKED on duration decision |
| Optional Scanner image | Private quarantine; delete at consent withdrawal or approved expiry unless a documented hold applies | Mechanism PREPARED; duration BLOCKED |
| Historical 96 private objects | Quarantine until consent/provenance review; never infer training permission | IMPLEMENTED as governance status, no object action |
| Certified training evidence | Separate from raw feedback; retain only with traceable rights, certification and approved model lineage | Gate IMPLEMENTED; period BLOCKED |
| Security/audit logs | Short, access-controlled period sufficient for incident response and abuse defense | BLOCKED on observed provider limits and counsel |
| Data-rights completion record | Minimized proof of request, identity verification, actions, exceptions and closure | BLOCKED on duration decision |
| Backups | Provider-defined rotation; deletion takes effect through normal expiry unless exceptional supported purge exists | BLOCKED on provider evidence |

## Approval criteria

For each row approve: purpose, controller, processor, start event, duration, deletion method, backup behavior, legal-hold exception, access role and proof of deletion. Revisit after any paid feature, Junior program, forum, DM, tournament, AI integration or new processor activation.
