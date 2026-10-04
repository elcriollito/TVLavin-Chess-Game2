# Clerk production readiness — 2026-10-03

Audited main: `aea9d708dcfde574425f972034ad510fc38c264c`.

Status: preparation complete for the next approval; production identity cutover is not ready.

## Current evidence

- The published `/api/public-auth-config` still supplies a development-class Clerk publishable key. No secret values were read or recorded for this audit.
- Authenticated Clerk Dashboard review of the existing CAISSA Chess application shows no production instance. Its creation dialog offers to clone authentication and theme settings; users do not transfer between development and production instances.
- A production database read-only preflight confirms existing canonical accounts with credits and Puzzles history. Stored application emails are absent, so an email-only mapping cannot recover these accounts.
- Production has no identity binding, challenge, enrollment or migration audit tables. The existing challenge and activation routes remain dormant: JSON POST requests return generic 404 responses with `Cache-Control: no-store`.
- Database ownership uses the immutable `public.users.id`: credits, library objects, Puzzles progress/attempts, Insights datasets/reports and other account records reference this UUID. Any Clerk subject change must preserve it. The new Insights tables extend the dependency inventory in the older migration plan.
- The existing foundation, cutover-tooling and default-off suites passed 36/36. These tests do not establish real dual-instance Clerk verification or a completed production migration.

Private account-level data, aggregate production counts, credentials and browser authentication values are intentionally excluded from this committed document.

## Reusable audit query

`scripts/sql/clerk-production-readiness.sql` is a SELECT-only preflight for the current production schema. It reports duplicate/missing identity counts and ownership-related row counts, including Puzzles and Insights. It returns no subjects, emails, UUIDs, PGNs or credit balances. Use it through an authorized database connection; it is not a public API or a migration. A missing required table causes the query to fail rather than report misleading empty data.

The query's production count checks were executed read-only during this audit. Re-run immediately before a later cutover because users and activity can change.

## Next action requiring explicit approval

Create the production instance of the existing CAISSA Chess application, cloning its authentication and theme settings. Review the domain, DNS/certificates and independently owned OAuth credentials. Do not accept a paid upgrade or enable new paid features without a separately authorized spending limit.

The browser's automatic approval review rejected the creation-dialog Continue action because the user's instruction authorized reviewing the configuration but did not explicitly authorize creating a production instance. The instance was not created. No alternate API/CLI path was used to attempt the rejected action.

Instance preparation alone does not authorize switching the deployed application to its new identity authority. Follow [the existing SEC-005 migration plan](SEC-005_CLERK_PRODUCTION_MIGRATION_PLAN.md): validate isolated dual-authority account proof and new-user enrollment, review and rehearse the additive schema, preserve existing internal UUIDs and all owned records, confirm rollback and any Stripe continuity requirements, and verify a migrated account before installing paired production credentials.

No production environment values, users, credits, premium state, Puzzles progress or saved reports changed during this audit. Insights remains published on the approved release.

## Official references

- [Production deployment](https://clerk.com/docs/guides/development/deployment/production)
- [Instances and environments](https://clerk.com/docs/guides/development/managing-environments)
- [Migration limitations](https://clerk.com/docs/guides/development/migrating/overview)
