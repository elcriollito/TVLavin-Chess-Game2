# Season 6.6.2 - Academy Reality Check & User Sync Fix

## Objective

Season 6.6.2 corrects two production-quality issues:

- Academy looked complete while most actions were intentionally marked `Coming Soon`.
- `/api/user/sync` could return a server error during authenticated user sync.

This phase does not add engines, AI, backend-heavy features, complete lessons, real progress, or mentor conversations.

## User Sync Fix

The user sync endpoint was reviewed with the frontend caller in `js/caissa-access.js`.

### Root Cause

`api/user/sync.js` attempted to persist `full_name` when the current committed Supabase schema only defines:

- `clerk_id`
- `email`
- `role`
- `is_premium`
- `credits`
- `stripe_customer_id`
- timestamps

Writing a column that is not present in the deployed schema can cause the Supabase upsert to fail and surface as `POST /api/user/sync 500`.

### Fix

The endpoint now upserts only schema-backed fields:

- `clerk_id`
- `email`
- `updated_at`

Backend or Supabase failures now return a controlled recoverable `503` response instead of a generic `500`.

The frontend now avoids repeated sync spam for the same signed-in user when backend sync is temporarily unavailable. It logs a single controlled warning and waits before retrying.

## Academy Reality Check

Academy copy now states that CAISSA Academy 1.0 Beta is a foundation preview.

The page is clearer that:

- browsing and internal navigation exist now
- Learning Path filtering exists now
- lessons are not active yet
- certificates are not active yet
- progress is not active yet
- mentor conversations are not active yet

## First Functional Interaction

Learning Path filters are now functional client-side controls.

Supported filters:

- All
- Beginner
- Intermediate
- Advanced
- Master

The filter state is temporary and in-memory only. No localStorage, backend, analytics, or progress tracking was added.

## Console Cleanup

The user sync client no longer repeats warnings aggressively after a failed sync. The message is controlled and non-destructive:

- `CAISSA Access: User sync unavailable`
- `CAISSA Access: Backend unreachable for user sync`

## What Was Not Touched

This phase did not modify:

- Gateway
- FICS
- Style12
- PGN
- Replay
- Authentication architecture
- CAISSA Classic
- Spectator TV
- Core chess logic

## Validation Plan

Required validation:

- `node --check api/user/sync.js`
- `node --check js/caissa-access.js`
- `node --check js/academy-section.js`
- `git diff --check`
- Academy smoke test
- login/user sync smoke where credentials are available
- full Production Validation Suite

