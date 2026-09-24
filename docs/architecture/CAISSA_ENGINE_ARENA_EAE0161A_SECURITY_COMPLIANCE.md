# CAISSA Engine Arena — EAE-016.1A security and RC3 compliance

Date: 2026-09-24

## Scope

EAE-016.1A rotates the exposed Clerk server credential and reconciles the
published corresponding-source package with the already-certified RC3 runtime.
It does not modify Lc0, Maia, Stockfish, Pause/Resume, transport reconciliation,
or relay lifecycle behavior. Match, Tournament, Stage 2B, and Stage 2C remain
out of scope.

## RC3 compliance decision

Decision: `PATH B — UPDATED SOURCE PACKAGE REQUIRED`.

The downloaded immutable v0.1.1 archive contains the pre-RC3
`client-source.js` and `lc0-worker.js`, but neither is byte-identical to the
source that generated RC3. The appliance bundler is byte-identical, proving
that the artifact delta comes from those source inputs rather than a toolchain
change.

The v0.1.1 CAISSA source bytes are exactly the files imported by commit
`639d9e391c2e81589091c471964b536af3ea1e1c`. RC3 changes are:

- `client-source.js`: commits `9d2b7db`, `a409a37`, `cd5b065`, `94138d7`;
- `lc0-worker.js`: commit `94138d7`.

The generated artifact delta is 7,334 bytes:

- `client.js`: 203,948 to 211,158 bytes;
- `lc0-worker.js`: 108,767 to 108,891 bytes.

The remaining six artifact hashes are unchanged.

## v0.1.2 reconstruction

The package includes the updated sources, unchanged native patches, pinned
build scripts and lockfile, notices and license texts, exact RC3 runtime
manifest, and a machine-readable provenance record plus baseline-to-RC3 patch.

Clean reconstruction result:

- runtime manifest: `648daa880e131ebe0b83784b68ce63abb50eee571c0328158cc8a94a7f444d3d`;
- artifacts: 8/8 hash and byte-count matches;
- total artifact bytes: 24,792,351;
- tamper self-test: detected;
- source archive SHA-256: `3ef4c920c0e05536ef26be1e4a47dc5ad2c247e59c4a2145f6f003e5a0506d4a`;
- source archive bytes: 1,441,144.

Legal status remains `LEGAL_SIGNOFF_REQUIRED_RC3` until the separate human
record is completed.

## Rollout hold

The rollout remains `INTERNAL_ONLY`. `CANARY_OPT_IN` and
`EXPERIMENTAL_OPT_IN` are disabled. Stage 2A Match/Tournament work remains on
hold until both credential rotation and human RC3 legal approval are complete.
