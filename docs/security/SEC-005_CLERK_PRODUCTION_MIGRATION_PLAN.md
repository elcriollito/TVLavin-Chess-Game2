# SEC-005 Clerk Production Migration Plan

Baseline: `0c3c1599ad47aae9477db863146bd3909020355d`

## Scope and decision

CAISSA production currently serves a `pk_test_` Clerk publishable key. The key is public by design; the defect is that a development identity authority is used on the production origin. This task does not change credentials or runtime code.

Recommended approach: **Strategy B — identity remapping around the existing immutable CAISSA `users.id`**. A credential-only cutover is prohibited. Clerk states that user data cannot be transferred from a Development instance to its Production instance, so new production Clerk subjects must be reconciled to existing CAISSA accounts before those accounts regain access. Task 12.2.1 implements the local, unapplied foundation described in `SEC-005_IDENTITY_REMAPPING_ARCHITECTURE.md`.

Authoritative Clerk references:

- [Production deployment](https://clerk.com/docs/guides/development/deployment/production)
- [Instances and environments](https://clerk.com/docs/guides/development/managing-environments)
- [Migration overview](https://clerk.com/docs/guides/development/migrating/overview)
- [Session options](https://clerk.com/docs/guides/secure/session-options)
- [Cookies](https://clerk.com/docs/guides/how-clerk-works/cookies)

## Current configuration

| Concern | Current evidence | Classification |
| --- | --- | --- |
| Browser key | `/api/public-auth-config` returns a `pk_test_`-class value | Development instance |
| Browser key source | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, then `CLERK_PUBLISHABLE_KEY` | Vercel runtime environment |
| Server key | `api/_lib/auth.js` uses only `CLERK_SECRET_KEY` with `verifyToken()` | Server-only encrypted environment value |
| Key pairing | Production registration tracking is active and bearer-token APIs work | Same instance is likely, but secret class is not inspected |
| Vercel separation | One Clerk publishable and one secret entry span Development, Preview and Production | Not isolated |
| Local fallback | `pk_test_REPLACE_WITH_YOUR_KEY` disables Clerk when runtime config is absent | Placeholder only |
| Clerk webhook | No Clerk/Svix webhook route or signing-secret reference exists | Not implemented |
| User provisioning | Authenticated browser calls `/api/user/sync` | Application-driven |
| Production domain | No Clerk domain/DNS setting in repository | Dashboard/DNS operational control |
| Redirects | `/signin`, `/signup` and post-auth paths are source-controlled; OAuth callbacks and allowed domains are Clerk/provider controls | Mixed |

The server secret’s test/live prefix is intentionally not read or printed. Because the public key is development-class, the current production identity classification is **DEVELOPMENT INSTANCE**.

## Identity dependency map

| System | Stored identity | Effect of a new Clerk subject |
| --- | --- | --- |
| `users` | Internal UUID primary key plus unique `clerk_id`; email is nullable/non-unique | `/api/user/sync` would insert a new default account instead of finding the existing row. |
| Wallet/premium/role | Columns on `users`, looked up by `clerk_id` | Existing credits and entitlement become inaccessible through the new subject. |
| Credit events | Foreign key `user_id → users.id` | Preserved if the existing user row is remapped; orphaned from login if a duplicate row is created. |
| Credit RPCs/Mentor | RPC parameter is verified Clerk subject | Must resolve the remapped existing row. |
| Library positions/collections/log | Foreign key `user_id → users.id` | Data survives a `clerk_id` update because the internal UUID stays fixed. |
| Browser profile cache | Objects and active-user state keyed by Clerk user ID | New production subject creates a separate local profile unless migrated or safely discarded/re-hydrated. Browser cache is not authoritative. |
| Checkout creation | Finds `users` by Clerk subject and writes that subject to Stripe Checkout metadata | New subject must map before checkout; otherwise a duplicate Stripe customer may be created. |
| One-time checkout webhook | Uses `session.metadata.clerk_id` to mutate/grant | In-flight sessions carrying the old subject need a compatibility lookup or must be drained/expired. |
| Renewal webhook | Finds user by `stripe_customer_id`, then calls `add_credits` with current row `clerk_id` | Preserved after a correct row remap because Stripe customer ID remains on the same internal row. |
| Subscription deletion | Finds user by `stripe_customer_id` | Preserved after correct remap. |
| Stripe customer metadata | Contains the subject used when the customer was created | Not the current renewal lookup key, but should be updated for operational consistency. |

Games/analysis are primarily local in the reviewed repository; no additional server table keyed directly by Clerk subject was found. Any production tables not represented by committed schemas require a read-only database inventory before cutover.

## Mapping constraints

- Clerk subjects must be assumed to change. Existing sessions will not transfer and users must authenticate again.
- Email is nullable and not unique in the CAISSA schema. `/api/user/sync` accepts an email from the authenticated browser body with basic format validation. Therefore stored email alone is not an authoritative automatic join key.
- A verified email match from both Clerk instances can be one proof signal, but collisions, email changes, missing emails, aliases and OAuth ambiguity require fail-closed handling.
- Paid accounts can additionally be correlated with the existing `stripe_customer_id`, but Stripe ownership must be independently proven; email alone is insufficient.
- The migration must never merge two internal UUIDs or overwrite a populated `clerk_id` merely because emails match.

The required mapping record is conceptually:

```text
old Clerk subject
→ immutable CAISSA users.id
→ new Clerk subject
→ proof method / approval / timestamp / rollback state
```

The local foundation now provides the binding ledger, hashed single-use challenge, explicit new-user enrollment decision, audit ledger, atomic activation/rollback RPCs and a dormant migration-aware sync gate. The core PostgreSQL rehearsal passed on isolated Supabase PostgreSQL 17.6 in Task 12.2.2A after two minimal compatibility fixes documented in `SEC-005_MIGRATION_REHEARSAL_REPORT.md`. Production application remains prohibited until the read-only data-quality report and all remaining cutover tooling gates pass.

## Strategy evaluation

| Strategy | Security and user impact | Complexity | Stripe/data impact | Decision |
| --- | --- | --- | --- | --- |
| A: clean cutover with user migration | Lowest UX impact if identities could transfer | Medium | Could preserve mapping | Rejected: Clerk does not support Development→Production user transfer. |
| B: identity remapping | Preserves internal account and data; requires strong proof and conflict handling | Medium/High | Keeps `users.id` and `stripe_customer_id`; old checkout metadata needs transition handling | **Recommended** |
| C: fresh identities with account claim | Highest phishing/account-takeover and support risk; users may initially see empty accounts | High | Requires claim flow and duplicate cleanup | Fallback only for records not safely pre-mapped. |

CAISSA should retain `users.id` as its durable application identity. Future APIs should resolve Clerk subjects through an identity binding rather than treating the vendor subject as the application primary identity. That architectural change is assessed here, not implemented.

## Stripe migration requirements

1. Export a read-only inventory of `users.id`, redacted old subject, email state, `stripe_customer_id`, premium status and credits; detect duplicate/missing identifiers.
2. Keep each existing `stripe_customer_id` on the same `users.id` during remap.
3. Prevent checkout until a production Clerk subject is mapped to the existing internal row.
4. Update Stripe customer metadata from old to new subject after mapping, retaining the internal CAISSA UUID as the preferred durable reference in future metadata.
5. Drain or expire pre-cutover Checkout Sessions, or provide a reviewed compatibility lookup for signed events whose metadata contains an old subject.
6. Verify renewal and deletion events continue resolving via `stripe_customer_id`.
7. Do not modify Stripe price IDs, webhook signing, credits or premium policy as part of the identity cutover.

Without these gates, changed subjects can break checkout fulfillment, create duplicate Stripe customers, or disconnect a paid human from the existing account.

## Webhook requirements

There is no Clerk webhook in the current application. Production user synchronization is browser-triggered after a verified session. If Clerk webhooks are introduced for lifecycle consistency, they require a separate authenticated/Svix-verified, idempotent endpoint with a production-only signing secret and explicit `user.created`, `user.updated` and `user.deleted` policy.

The existing Stripe webhook is unrelated to Clerk instance authentication and retains its current Stripe signing secret. Its endpoint must remain configured in Stripe. Production Clerk integrations/webhooks do not copy automatically and must be configured separately in the production Clerk instance if used.

## Domains, redirects and OAuth

Code-controlled routes:

- Sign-in: `/signin`
- Sign-up: `/signup`
- Default post-sign-in/sign-up/sign-out: `/`
- Sign-in/up pages accept `redirect_url`; SEC-011 requires same-origin validation before the migration release.

Operationally verify in Clerk and each OAuth provider:

- primary application domain `https://www.caissa-chess.org`;
- only intentional canonical aliases/subdomains;
- required Clerk Frontend API DNS records and certificates;
- subdomain allowlist and `authorizedParties` restricted to approved origins;
- production Google/other OAuth client IDs, secrets and exact callback URLs;
- sign-in, sign-up, Account Portal and email-link redirects;
- CSP additions for the production Clerk domain;
- no development `accounts.dev` callback remains in production providers.

## Session and cookie readiness

Production Clerk uses a first-party Frontend API under the configured production domain. Clerk documents `SameSite=Lax` session behavior; exact cookie domain, production DNS, session inactivity timeout, maximum lifetime, multi-session behavior, token customization and revocation settings are dashboard-controlled and require operational verification. Existing development sessions will not survive the authority change.

Required checks:

- Secure transport and production-domain cookie scope;
- sign-out clears the production session and local active-user state;
- refresh returns a token accepted by `verifyToken()` with the live server key;
- expired/revoked tokens fail all protected APIs;
- multiple-device and multi-session policy matches the approved product policy;
- maximum lifetime and inactivity timeout are explicitly recorded.

## Staging and rehearsal

Current Vercel Development, Preview and Production entries share the same Clerk and Supabase variable records, so Preview is not an identity-isolated staging environment. Before cutover create an isolated rehearsal stack:

- separate Clerk production/test application appropriate for rehearsal;
- dedicated non-production domain;
- separate Supabase database cloned with synthetic/redacted fixtures;
- isolated Stripe test-mode customers, prices and webhook secret;
- environment-specific Vercel variables;
- no production secrets or real credit/payment mutations.

Production must not be the first end-to-end migration test.

## Migration test matrix

| Case | Required result | Readiness |
| --- | --- | --- |
| Existing email/password user | Re-authenticates/claims same internal UUID | Mock verifier + real PostgreSQL passed; isolated Clerk authorities pending |
| Existing Google/OAuth user | Production OAuth identity maps without email-only merge | Pending OAuth setup |
| New signup | Creates exactly one new internal row | Pending |
| Sign-in/sign-out | Correct redirects and session clearing | Pending |
| Session refresh/revocation | Live token accepted; invalid token rejected | Pending |
| Free user | Same credits, role and library | PostgreSQL remap/concurrency passed; live verifier pending |
| Premium user | Same premium flag and Stripe customer | PostgreSQL preservation passed |
| User with credits | Exact balance/event ownership retained | PostgreSQL preservation passed |
| Saved library data | Same internal UUID and all objects retained | PostgreSQL preservation passed |
| Stripe subscriber | Renewal/deletion resolve same internal row | DB lookup continuity passed; Stripe test-mode webhook pending |
| In-flight checkout | Old-subject metadata safely drained or resolved | Pending design choice |
| Account deletion | Approved retention/deletion policy, no accidental cross-account deletion | Pending policy |
| Backend APIs | New live JWT subject resolves correct row | Pending |
| Mobile/desktop | Auth, refresh and redirects work on supported browsers | Pending |
| Conflict/missing email | Fails closed to manual recovery without duplicate/merge | Recovery CLI + real PostgreSQL passed |

## Cutover gates

All gates are mandatory:

1. Production Clerk instance created; live keys available but not yet installed.
2. Production domain/DNS/certificates configured and verified.
3. Production OAuth credentials and exact callback URLs configured.
4. Dashboard session, redirect, allowed-origin/subdomain and email settings recorded.
5. Run the implemented count-only readiness utility against an approved redacted/read-only export; every paid/premium/credit-bearing account must be classified.
6. Review and apply the additive mapping migration only after current data is compatible with its unique constraints; establish the controlled manual conflict path.
7. Stripe customer and in-flight Checkout Session transition plan verified.
8. Isolated staging rehearsal passes the entire test matrix.
9. Backup and point-in-time recovery confirmed; mapping rollback tested.
10. SEC-001/002/004/006 regression suites pass.
11. Monitoring covers auth failures, sync duplicates, unmapped subjects, webhook failures and entitlement mismatches.
12. Approved maintenance/cutover window and user communication are ready.

## Cutover sequence

1. Freeze new checkout/account-link changes briefly and snapshot identity/Stripe mappings.
2. Complete production subject proof and mapping without changing child `user_id` values.
3. Drain or explicitly handle old-subject Checkout Sessions.
4. Install paired `pk_live_` and `sk_live_` values in **Production only**; do not reuse them in Preview/Development.
5. Redeploy and verify exact commit/environment provenance.
6. Run non-economic auth/API smoke tests, then controlled migrated-account tests.
7. Update Stripe customer metadata and enable checkout only for mapped accounts.
8. Monitor duplicate-row creation, authentication errors, webhook results and ownership mismatches.

## Rollback

- Retain the old development instance and encrypted credentials during a short, approved rollback window; do not delete users or rotate blindly.
- Keep an encrypted pre-cutover export and database backup plus an immutable mapping ledger.
- Make subject-binding changes reversible per `users.id`; never delete/recreate the internal user row or cascade child data.
- On rollback, pause checkout, restore the previous paired Clerk environment values, redeploy the last verified commit, reverse only completed subject bindings from the ledger, and invalidate/communicate session changes.
- New accounts created solely in the production instance during the cutover window require explicit reconciliation; never silently merge by email.
- Rollback cannot restore production sessions into the development instance. Users should expect re-authentication.

## Readiness verdict

The corrected remapping foundation and local cutover tooling have passed isolated PostgreSQL rehearsal, including persistent throttling, locked/stale-safe recovery preview, atomic execution, confirmed rollback, immutable audit, concurrency, RLS, collision and preservation checks. Fixed dual-verifier routes pass synthetic cryptographic-boundary tests, but real cross-instance Clerk verification and rotation cannot be validated without two separately authorized isolated Clerk authorities. Production schema application, production data classification, recovery operator authorization, isolated Clerk/Stripe integration and trusted new-user enrollment authority remain incomplete. Live credentials must not be switched yet. SEC-005 remains in remediation until Strategy B is production-ready and production-verified.
