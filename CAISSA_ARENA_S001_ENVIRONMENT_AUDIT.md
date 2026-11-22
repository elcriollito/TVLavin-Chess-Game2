# CAISSA Arena S001 Environment Isolation Audit

Status: **PASS for protected nonproduction beta**
Audit date: 2026-11-20/21 (America/New_York)
Final candidate: `d029d42c237f42d2f22fe5507a4d652094d2a2b5`

## Supabase

The authorized project `CAISSA-ARENA-S001-BETA-ISOLATED`
(`imtwlzicxaaqjyvrkdsv`) is ACTIVE_HEALTHY in `us-east-1` on PostgreSQL
17.12. No second project was created.

Only the eight-artifact clean-room chain was applied. The project has 15 public
application tables, all RLS-enabled, and retains all hosted certification
evidence. Browser roles cannot execute Arena RPCs. The shared Reader staging
project `aqizagaskicotorfpwfn` and Production were not modified.

## Clerk

The beta uses only AUTH-004D Development:

- application `app_3LHTahmv7whkNLWq10qjudrpkHb`;
- instance `ins_3LHTajA1YOW9qlf7bM5Xfocx9fL`;
- issuer `https://cheerful-mantis-9523.clerk.accounts.dev`;
- four dedicated Development test users;
- signup restricted, multi-session off, transfers off;
- session claims include `role=authenticated`.

Supabase has one resolved `clerk-development` third-party auth integration for
that exact issuer. Main CAISSA Development and Production users/credentials are
not used.

## Vercel

A separate project was created without a Git link:

- name `caissa-arena-s001-beta-isolated`;
- ID `prj_QFSK87RYJEIC7bj4MPqJOKgQlqKA`;
- target Preview;
- stable protected origin
  https://caissa-arena-s001-beta-isolated.vercel.app;
- Vercel Authentication enabled;
- 19 Preview-only environment variables, five encrypted secret values;
- no inherited environment variables, production domain, or Git auto-deploy.

The original project `tv-lavin-chess-game2` was not changed. No Git push was
performed, so no unsafe automatic Preview was triggered.

## Hosted verification

Unauthenticated access redirects to Vercel Authentication. Authenticated config
reports internal rollout, Arena/create enabled, rated/guest disabled, and the
isolated Supabase hostname. Four AUTH-004D sessions completed the live
API/database/Realtime certification.

No production modification, shared staging write, merge, promotion, public
release, or unapproved paid resource occurred.
