# Clerk production readiness — 2026-10-03

Audited main: `aea9d708dcfde574425f972034ad510fc38c264c`.

Status: the authorized production instance has been created and its setup requirements reviewed; production identity cutover is not ready.

## Product decision for this synchronization

CAISSA remains free for now. Clerk stays on the existing Hobby plan, and paid plans, subscriptions and new payment activation are postponed to a separate approved project. The current credit logic and stored credit state remain in place without modification; this documentation sync neither removes nor activates billing behavior. No Clerk upgrade, Stripe change, entitlement change or credit migration is part of this work.

## Current evidence

- The published `/api/public-auth-config` still supplies a development-class Clerk publishable key. No secret values were read or recorded for this audit.
- After explicit user authorization on 2026-10-03, the existing CAISSA Chess application now has a production instance. Authentication and theme settings were cloned from development. Existing development users were not transferred.
- A production database read-only preflight confirms existing canonical accounts with credits and Puzzles history. Stored application emails are absent, so an email-only mapping cannot recover these accounts.
- Production has no identity binding, challenge, enrollment or migration audit tables. The existing challenge and activation routes remain dormant: JSON POST requests return generic 404 responses with `Cache-Control: no-store`.
- Database ownership uses the immutable `public.users.id`: credits, library objects, Puzzles progress/attempts, Insights datasets/reports and other account records reference this UUID. Any Clerk subject change must preserve it. The new Insights tables extend the dependency inventory in the older migration plan.
- The existing foundation, cutover-tooling and default-off suites passed 36/36. These tests do not establish real dual-instance Clerk verification or a completed production migration.

Private account-level data, aggregate production counts, credentials and browser authentication values are intentionally excluded from this committed document.

## Reusable audit query

`scripts/sql/clerk-production-readiness.sql` is a SELECT-only preflight for the current production schema. It reports duplicate/missing identity counts and ownership-related row counts, including Puzzles and Insights. It returns no subjects, emails, UUIDs, PGNs or credit balances. Use it through an authorized database connection; it is not a public API or a migration. A missing required table causes the query to fail rather than report misleading empty data.

The query's production count checks were executed read-only during this audit. Re-run immediately before a later cutover because users and activity can change.

## Authorized instance preparation

The authenticated Clerk Dashboard confirms the new `Production` environment under the existing `Hobby` plan. No paid upgrade was accepted. Instance creation and configuration review are complete; the application still uses its previous credentials.

| Configuration | Verified value |
| --- | --- |
| Application | CAISSA Chess (`app_38rhCJXZbKJZGln3mL8wFm7Iaxr`) |
| Production instance | `ins_3KCrtSZ0xYIWxGejoyQf5JvUsjH` |
| Primary domain | `caissa-chess.org` |
| Application domain | `www.caissa-chess.org` |
| Frontend API | `clerk.caissa-chess.org` |
| Plan | Hobby |
| Clerk setup checklist | 0/3 complete |

### DNS and certificates

Clerk's `Verify Records` check completed with all five records still unverified. The following exact CNAME requirements were read from the new instance's domain configuration. They have not been applied by this work.

| Type | Full DNS name | Target |
| --- | --- | --- |
| CNAME | `clerk.caissa-chess.org` | `frontend-api.clerk.services` |
| CNAME | `accounts.caissa-chess.org` | `accounts.clerk.services` |
| CNAME | `clkmail.caissa-chess.org` | `mail.szipe5a5783e.clerk.services` |
| CNAME | `clk._domainkey.caissa-chess.org` | `dkim1.szipe5a5783e.clerk.services` |
| CNAME | `clk2._domainkey.caissa-chess.org` | `dkim2.szipe5a5783e.clerk.services` |

Frontend API and account portal certificates remain pending. Clerk states that they will be issued after DNS records are verified. No existing website DNS records were changed.

### Google OAuth

The cloned Google connection is enabled for sign-up and sign-in, but Clerk marks it `Setup required`: its production Client ID and Client Secret are empty. Its exact Authorized Redirect URI is `https://clerk.caissa-chess.org/v1/oauth_callback`. The existing scopes are `openid`, `https://www.googleapis.com/auth/userinfo.email` and `https://www.googleapis.com/auth/userinfo.profile`.

Custom Google credentials have not been created, read or entered by this work. Google sign-in on the new instance is not yet operational.

## Account preservation before activation

Follow [the existing SEC-005 migration plan](SEC-005_CLERK_PRODUCTION_MIGRATION_PLAN.md): validate isolated dual-authority account proof and new-user enrollment, review and rehearse the additive schema, preserve existing internal UUIDs and all owned records, confirm rollback and any Stripe continuity requirements, and verify a migrated account before installing paired production credentials. The read-only preflight and 36 passing tests establish the preparation baseline; they do not replace a real two-instance account migration rehearsal.

No production application environment values, application users, credits, premium state, Puzzles progress or saved reports changed during this preparation. No identity migration schema was applied. The new Clerk instance has not been activated for the website. Insights remains published on the approved release.

## Official references

- [Production deployment](https://clerk.com/docs/guides/development/deployment/production)
- [Instances and environments](https://clerk.com/docs/guides/development/managing-environments)
- [Migration limitations](https://clerk.com/docs/guides/development/migrating/overview)
