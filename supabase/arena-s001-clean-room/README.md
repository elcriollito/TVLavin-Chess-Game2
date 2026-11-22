# CAISSA Arena S001 clean-room migration manifest

Target: one new, empty, dedicated nonproduction Supabase project only.

This manifest deliberately excludes `supabase-schema.sql`,
`supabase-schema-v2.sql`, and unrelated files under `supabase/migrations/`.
Those artifacts contain credits, Stripe, library, mentor, scanner, Reader
staging, and other product history outside the reviewed Arena beta surface.

Apply exactly these SQL artifacts, in this order, through the supported hosted
migration API:

1. `supabase/migrations/20261120232156_caissa_arena_s001_beta_foundation.sql`
   (relative to this clean-room project)
2. `../../migrations/20261005204209_caissa_online_native_v1.sql`
3. `../../migrations/20261011150814_caissa_online_hardening_only_v3.sql`
4. `../../migrations/20261014035549_caissa_public_identity_v1.sql`
5. `../../migrations/20261120033413_caissa_online_arena_s001.sql`
6. `supabase/migrations/20261120232717_caissa_arena_s001_pairing_fk_indexes.sql`
7. `supabase/migrations/20261120235311_caissa_arena_s001_rematch_hardening.sql`
8. `supabase/migrations/20261121000412_caissa_arena_s001_concurrent_rematch_hardening.sql`
9. `../../migrations/20261121034500_caissa_tournament_ux_s001.sql`

The seventh migration adds a tournament-history preference. The eighth closes
the hosted separate-transaction race: players wait for an active unseen
opponent instead of accepting an immediate rematch while the other board is
still finishing. The ninth adds bounded community-created Arenas, per-event
organizer lifecycle actions, overlap protection, and directory metadata. All
preserve the reviewed pairing transaction, server-only RPC boundary and grants.

The foundation is fail-closed: it does not use `if not exists`, and it grants
the browser roles nothing. A non-empty or drifted target must be investigated,
not coerced into matching this manifest. Hosted application is followed by
catalog/grant/RLS checks, Supabase security/performance/health advisors, and the
four-identity certification. Rollback is feature disablement plus evidence
preservation; no beta data is deleted automatically.
