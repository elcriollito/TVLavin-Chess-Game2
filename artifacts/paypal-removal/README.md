# PayPal removal visual evidence

Captured locally on 2026-10-25. No financial transaction was initiated.

## Before

- `before-support-desktop.png` — 1440 × 900, historical `/support` page with a
  locally mocked Hosted Button boundary.
- `before-support-mobile.png` — 390 × 844, the same historical page at mobile
  width with a locally mocked boundary.

The mock rendered only a inert frame for layout evidence; it did not contact a
checkout endpoint or submit data.

## After

- `after-help-desktop.png` — 1440 × 900, `/support` redirected to `/help`, with
  the contribution destination absent from navigation.
- `after-help-mobile.png` — 390 × 844, the same redirect result at mobile width.

Images are local implementation evidence, not evidence of a production change
or PayPal dashboard deactivation.
