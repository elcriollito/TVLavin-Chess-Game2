# Season 10.14 — Limited Preview Release

## Authorization and scope

The human approval is recorded privately in
`docs/architecture/private/SEASON_10_14_LIMITED_PREVIEW_HUMAN_APPROVAL.json`.
It authorizes only CAISSA Endgame Practice, Limited Preview, the five reviewed
exercises, public navigation, canonical/sitemap discovery, the existing
public-shell-only Clarity policy, and an enabled ephemeral runtime. It is
honestly unsigned.

The preview has no accounts, rating, saved progress, learner analytics,
telemetry, personalization, recommendation, membership, or additional content.

## Release configuration

Production must use exact server-side values:

- `CAISSA_ENDGAME_PRACTICE_RELEASE_MODE=limited-preview`
- `CAISSA_PRIVATE_ENDGAME_RUN_ENABLED=true`
- `CAISSA_PRIVATE_ENDGAME_RUN_MODE=enabled`
- `CAISSA_PRIVATE_ENDGAME_RUN_REASON=operational`

The endpoint remains no-store and fail-closed. Query parameters cannot alter
these values. The runtime rechecks availability after the full-page transition,
validates the immutable manifest and artifacts, and suppresses Clarity before
runtime initialization.

## Rollback

Known-good baseline: `8826fdf1b3b7d4e45d73f4e5b68c0854377d6129`.

Immediate containment:

1. Set the runtime disabled or the release boundary paused.
2. Redeploy normally so the server-evaluated configuration takes effect.
3. Verify Start Limited Preview is unavailable.
4. Verify zero manifest, artifact, board, and controller initialization.
5. Verify the public site and closed/unavailable shell remain stable.

Secondary rollback is a normal revert or deployment of the known-good SHA. Do
not force-push, delete artifacts, or alter approvals.

## Manual first-24-hours monitoring

This is a reproducible manual checklist, not background learner monitoring:

- route HTTP status;
- availability endpoint status and normalized modes;
- Vercel deployment status;
- runtime initialization smoke;
- manifest and artifact integrity smoke;
- public navigation, sitemap, canonical, robots, and metadata;
- Clarity absence inside the exercise runtime;
- protected-path 404 responses;
- IndexNow result.

Do not record moves, FEN, hints, failures, completion, session time, or device
fingerprints. Suggested initial review period: first 24 hours.
