# CAISSA Market platform

## Scope

CAISSA Market is an extensible account-aware catalog. The first active section is **Software** and the only real product is `caissa-pgn-reader`.

The certified Reader fulfillment path is unchanged:

`purchase -> durable entitlement -> My Downloads -> server-owned private Blob pathname -> short-lived signed GET`

The public catalog never contains a private Blob pathname. Release resolution remains server-owned.

## Navigation

- `/market` and `/market/software` — CAISSA software catalog.
- `/market/caissa-pgn-reader` — Reader product detail.
- `/market/books` — original CAISSA Books & PDFs foundation; no released products.
- `/market/recommendations` — external recommendations foundation; no active items or merchant links.
- `/account/downloads` — authenticated CAISSA product delivery.

All navigation labels remain visible on desktop and at 600 CSS pixels. No category relies on an icon-only control.

## Product models

The schemas and active catalog are defined in `api/_lib/market-product-catalog.js`.

### Software

Software entries support a product ID, title, image, platform, version, short and long descriptions, features, display-only price state, release status, entitlement requirement, My Downloads path and a server-owned release-mapping marker.

`CAISSA PGN Reader` is `prelaunch` and `Not on sale`. This is a status label, not a new or changed price.

Future software such as CAISSA Polyglot Builder must not be added to the active catalog until its product, release and purchase gates are separately authorized.

### Books & PDFs

The PDF schema supports product ID, title, author, cover, language, page count, description, display-only price state, edition, release ID, entitlement requirement and server-owned release mapping.

The active PDF catalog is empty. No fictional titles, covers or purchases are exposed. A future PDF will reuse the existing entitlement and private-download path without adding complex DRM.

### External recommendations

The affiliate schema supports product ID, title, image, category, merchant, editorial recommendation, external URL and an explicit disclosure flag.

The active recommendations catalog is empty. No merchant URL, affiliate/tracking identifier, merchant asset or affiliate claim is configured.

External items must always use **View at retailer**, must be visually labeled **External recommendations / Not sold by CAISSA**, and must never enter My Downloads.

## Visual boundary

CAISSA-owned products use the blue `CAISSA product` identity and may eventually expose Buy / My Downloads.

External recommendations use the violet `External recommendations` identity and a retailer handoff. They must not resemble a CAISSA checkout or fulfilled download.

## Release gates

- Production Buy remains disabled.
- Production Market downloads remain disabled.
- No live Stripe connection or checkout is introduced by this expansion.
- The RC1 Blob mapping and entitlement implementation are unchanged.
- Adding a product requires a literal server-side release mapping, product-specific tests and explicit authorization.
- Adding an affiliate item requires an approved merchant URL, asset rights and disclosure policy.
