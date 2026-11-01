# CAISSA Identity Organization v1 — implementation and operations

**Issue:** #80
**Architecture dependency:** PR #79
**Scope:** account authority and ownership resolution; no account deletion.

## Runtime contract

Account-scoped endpoints authenticate one Clerk JWT and bind it to one server-owned authority. When `CAISSA_IDENTITY_OWNERSHIP_MODE=enforced`, startup/runtime authentication requires:

- a valid Clerk secret or JWT verification key;
- an exact issuer from `CAISSA_CLERK_ISSUER` or the configured Clerk publishable key;
- an authority of `legacy_development` or `production`;
- agreement between `CAISSA_CLERK_AUTHORITY`, the publishable-key family, and the secret-key family whenever more than one signal is configured.

Any contradiction is a service configuration failure. It must not fall back to a different environment.

The browser cannot choose the subject, UUID, authority, binding, or review decision. The backend sends only the verified JWT subject and fixed server authority to `resolve_caissa_identity_ownership`.

## Ownership states

- `VERIFIED`: the exact authority/subject binding and canonical `users.clerk_id` agree, and the relationship is intrinsically safe or has a restricted review decision.
- `REVIEW_REQUIRED`: the binding is historical or otherwise needs a human ownership decision.
- `QUARANTINED`: canonical identity state conflicts or a restricted review revoked/quarantined the binding.
- `UNRESOLVED`: no active exact binding exists.

`REVIEW_REQUIRED` and `QUARANTINED` return `OWNERSHIP_REVIEW_REQUIRED` without accessing account data. Review rows contain no raw email or Clerk subject and are unavailable to `anon` and `authenticated`.

## Protected paths in v1

- `/api/user/sync`
- `/api/user/public-identity`
- `/api/puzzles/progress`

These paths preserve their prior behavior while the ownership flag is not enabled. Preview/Staging certification enables the flag only with Clerk Development and Supabase Staging. Production activation is a separate release gate.

## Migration

`20261018171912_caissa_identity_ownership_v1.sql` is additive. It creates the restricted ownership-review table and a service-role-only stable resolver. It does not classify, transfer, delete, or merge an account.

Rollback for a failed code rollout is to disable `CAISSA_IDENTITY_OWNERSHIP_MODE` and redeploy the previous code. Do not drop review evidence or restore broader grants automatically.

## Required release checks

1. Verify Clerk instance, issuer, key family, authorized parties, Supabase project, and Vercel branch scope.
2. Verify the migration ledger and aggregate counts before and after applying the migration.
3. Exercise Development JWT success and Production/wrong-issuer rejection with synthetic identities.
4. Confirm `anon`/`authenticated` cannot read reviews or execute the resolver.
5. Keep Vercel Deployment Protection active and Clerk Production invite-only.
6. Never place the restricted inventory, raw subjects, emails, JWTs, or service secrets in GitHub evidence.
