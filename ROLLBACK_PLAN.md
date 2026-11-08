# CAISSA Downloads & Polyglot Expansion — Rollback Plan

Production is unchanged, so no production rollback is currently required.

If the candidate is later approved and deployed:

1. Record the approved candidate commit, Vercel deployment ID, Worker version, and live R2 object metadata before promotion.
2. If web smoke tests fail, restore the prior Vercel deployment; do not mutate source assets or R2 objects as an improvised rollback.
3. If the Downloads Worker fails legitimate checksum validation, restore the prior Worker version. Do not remove the SHA-256 check or overwrite the versioned key.
4. Keep the existing R2 object immutable. A changed artifact requires a new versioned key and newly approved manifest.
5. Verify `/`, `/tools/polyglot`, `/downloads`, `/vault`, the existing portable URL, navigation, and localization after rollback.
6. Preserve logs, exact response headers, object metadata, deployment IDs, and timestamps for diagnosis.

Rollback authority does not authorize a new release, R2 upload, DNS change, merge, or production promotion.
