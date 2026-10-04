# Game Library Champions — photo-free refinement

## Product decision

The Champions archive is designed to feel complete without licensed photography. Champion identity is carried by an editorial monogram, historical number, reign dates and era treatment. Real photographs and externally sourced portrait assets are not part of this release.

Any later portrait hotfix must use original artwork with documented provenance and publication rights. It must not reproduce a source photograph directly.

## UX problems addressed

- The earlier placeholder read as a missing asset before it read as a champion identity.
- Variable copy length made the card grid feel uneven and weakened the primary action.
- Champions with several reigns did not expose those reigns clearly in the expanded view.
- PGN badges were accurate but did not explain what the visitor could safely do.
- Match filters lacked result counts and the event list did not have a strong chronological spine.
- The selected champion and selected event were visible in the detail, but the originating card state was understated.

## Applied direction

- Photo-free archival monograms with an inset frame, large historical number and explicit “no portrait” label.
- Stable card proportions, era microcopy and a consistently anchored “Explore champion” action.
- Expanded detail with selectable reign chapters, historical context, championship events, lineage and PGN collections.
- PGN status copy that distinguishes rights-cleared reader/download access, local QA access, pending review and historical-only records.
- Counted match filters, chronological result summary, numbered event sequence and timeline markers.
- Selected/expanded states linked to URL restoration without changing the secure reader registry.

## Boundaries preserved

- `/game-library` and its IndexedDB model are unchanged.
- No external images, portrait files or new dependencies were added.
- Existing reader routes and the PGN allowlist remain unchanged.
- This is a local review deliverable; it is not published or deployed.

## Remaining risk

The archive copy and structured historical records should continue to receive editorial fact review as new events are added. A future original-art portrait release will require a separate provenance, licensing and visual-consistency review before publication.
