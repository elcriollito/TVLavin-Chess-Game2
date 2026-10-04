-- Read-only preflight for the existing CAISSA production schema.
-- Returns aggregate counts only; no subjects, emails, account IDs or PGNs.
-- This is an audit query, not a migration or a Clerk cutover command.
with normalized as (
    select nullif(btrim(clerk_id), '') as clerk_id,
           nullif(lower(btrim(email)), '') as email,
           nullif(btrim(stripe_customer_id), '') as stripe_customer_id,
           is_premium, credits
    from public.users
)
select jsonb_build_object(
    'totalUsers', (select count(*) from normalized),
    'usersWithClerkId', (select count(*) from normalized where clerk_id is not null),
    'usersWithoutClerkId', (select count(*) from normalized where clerk_id is null),
    'duplicateClerkIdGroups', (
        select count(*) from (
            select clerk_id from normalized where clerk_id is not null
            group by clerk_id having count(*) > 1
        ) duplicates
    ),
    'usersWithEmail', (select count(*) from normalized where email is not null),
    'usersWithoutEmail', (select count(*) from normalized where email is null),
    'duplicateEmailGroups', (
        select count(*) from (
            select email from normalized where email is not null
            group by email having count(*) > 1
        ) duplicates
    ),
    'usersWithStripeCustomerId', (select count(*) from normalized where stripe_customer_id is not null),
    'duplicateStripeCustomerIdGroups', (
        select count(*) from (
            select stripe_customer_id from normalized where stripe_customer_id is not null
            group by stripe_customer_id having count(*) > 1
        ) duplicates
    ),
    'premiumUsers', (select count(*) from normalized where is_premium is true),
    'usersWithPositiveCredits', (select count(*) from normalized where credits > 0),
    'creditEvents', (select count(*) from public.credit_events),
    'puzzleProgressRows', (select count(*) from public.puzzle_training_progress),
    'puzzleAttemptRows', (select count(*) from public.puzzle_training_attempts),
    'libraryCollections', (select count(*) from public.library_collections),
    'libraryPositions', (select count(*) from public.library_positions),
    'insightsDatasets', (select count(*) from public.insight_datasets),
    'insightsReports', (select count(*) from public.insight_reports),
    'identityTables', jsonb_build_object(
        'bindings', to_regclass('public.identity_bindings') is not null,
        'challenges', to_regclass('public.identity_migration_challenges') is not null,
        'enrollment', to_regclass('public.identity_enrollment_decisions') is not null,
        'audit', to_regclass('public.identity_migration_audit') is not null
    )
) as readiness_counts;
