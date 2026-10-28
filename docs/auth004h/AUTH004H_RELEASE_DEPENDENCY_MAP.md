# AUTH-004H production release dependency map

Status: **PREPARED ONLY — NO PRODUCTION ACTION EXECUTED**

Each release is separately approvable. A later release must not be executed merely because an earlier one was approved.

| Release | Prerequisites | Exact action | Required proof | Rollback boundary |
| --- | --- | --- | --- | --- |
| A — Legal pages | Counsel/owner approval of exact text and unresolved C/D decisions | Publish Privacy and Terms from an immutable approved SHA | Public HTTPS 200, canonical URLs, mobile/desktop/a11y, contact delivery | Redeploy prior application; note that already-seen legal text cannot be “unpublished” from users/caches |
| B — Google Branding | A complete | Enter public legal URLs; confirm app identity/logo decision/basic scopes; follow Google's workflow | Branding complete; domain; External audience; provider status evidence | Return to Testing/disable client where available; removing URLs does not erase prior consent |
| C — Clerk Google | B provider-ready; credentials controlled | Install dedicated Google client ID/secret into exact Clerk Production instance | Authorization URL has client ID; exact callback; Account Portal/CAISSA sign-in; no duplicate identity | Disable Google connection; preserve email/password and sessions; revoke/rotate only with approval |
| D — Supabase | Exact migration approval, backup/restore verification | Apply checksum-pinned age-gate migration in transaction | Object/ACL/RLS/function/concurrency tests; registration still disabled | Transaction rollback before commit; after commit prefer dormant additive schema over destructive drop |
| E — Application | A–D compatible; immutable candidate approved | Deploy/promotion of exact candidate while registration remains paused | Existing login/sync/logout, Scanner, Beta, legal, mobile/desktop | Promote known-good prior Vercel deployment; does not roll back Clerk/Google/DB |
| F — Registration activation | Separate approval; E smoke pass; all production env inputs prepared | Add secret and explicit three release confirmations, redeploy | Eligible flow, ineligible/direct/OAuth/API bypass denial, replay/quotas, Mobile Safari, kill switch | Remove/disable `CAISSA_REGISTRATION_RELEASE` first; retain restricted Clerk and schema |

## Critical ordering

```text
Legal approval
  -> A legal publication
  -> B Google Branding/publication
  -> C Clerk Google credential installation

Migration approval
  -> D Supabase additive migration (registration still off)

A + C + D + immutable app approval
  -> E application deployment (registration still off)
  -> independent F registration activation approval
```

Existing email/password login must remain available throughout. Scanner, Beta Program, and Market Reader are invariants, not release dependencies to modify.

## Forbidden bundling

- Do not combine provider attestations with application promotion.
- Do not combine migration approval with registration activation.
- Do not combine legal publication with acceptance of unresolved liability/dispute terms.
- Do not combine Scanner Privacy/Security Season 2 work or Market Reader changes with AUTH-004.
