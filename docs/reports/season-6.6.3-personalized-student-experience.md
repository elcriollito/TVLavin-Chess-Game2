# Season 6.6.3 - Personalized Student Experience

## Objective

Season 6.6.3 makes CAISSA Academy feel personal when a user is signed in while keeping Academy 1.0 Beta free, preview-oriented, and safe.

This phase does not add engines, AI, lessons, progress storage, paywalls, wallet checks, or backend work.

## Student Identity

Academy now reads the existing public CAISSA auth state and local profile data already created by the authentication layer.

When a user is signed in, Student Journey displays:

- Student label
- Display name from full name, profile name, Clerk name, username, or safe email prefix
- Enrollment date from the existing local profile when available
- Ready to Begin status
- Zero-value preview metrics for lessons, courses, certificates, training games, and achievements

When no user is signed in, Academy displays:

- Guest Student
- Sign in to personalize your Academy journey.
- Pending Enrollment
- Guest-safe progress placeholders
- Sign in to track your progress.

## Guest to Student Behavior

The change is presentation-only. Academy listens for the existing `caissa-auth-change` event and refreshes the Student Journey labels when the global auth state changes.

No new router, account component, user sync behavior, or backend state was introduced.

## Free Access Policy

Academy now includes a small beta badge:

- FREE DURING BETA
- No credits required.
- No wallet required.

This confirms that Academy remains free during the beta preview.

## What Was Not Modified

- Gateway
- FICS
- Style12
- Replay
- PGN
- Authentication backend
- `/api/user/sync`
- Wallet
- CAISSA Classic
- Spectator TV
- Core application logic

## Validation Plan

- `node --check js/academy-section.js`
- `git diff --check`
- Academy guest smoke
- Academy signed-in state smoke with simulated auth
- CAISSA Classic smoke
- Spectator TV smoke
- Full Production Validation Suite
