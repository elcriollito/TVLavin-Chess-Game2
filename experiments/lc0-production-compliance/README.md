# EAE-015A Lc0 redistribution bundle

This directory is the release-compliance companion for the isolated Lc0 browser
appliance `eae015a-lc0-0.33.0-maia1100`. It records the exact source,
patches, toolchain, network, license texts, and deterministic build procedure
used by the preview artifact.

This is technical compliance evidence, not legal approval. Publication remains
blocked on an authorized human review of GPL corresponding-source delivery,
Maia network redistribution rights, attribution placement, and the proposed
source-offer location. Current status: `LEGAL_SIGNOFF_REQUIRED`.

The corresponding source consists of:

- Lc0 source commit `482bb4a830287b726ebe7d42f14ab7f5f17c18a0`
  from `https://github.com/jalpp/lc0.js.git`;
- the three ordered patches in `../lc0-browser-lab/patches/`;
- CAISSA runtime sources `../lc0-browser-lab/src/lc0-worker.js` and
  `../lc0-preview-relay/engine/client-source.js`;
- the reproducible build scripts in `../lc0-browser-lab/scripts/`;
- this directory's license texts, notices, and provenance manifest.

No public corresponding-source URL is asserted yet. For a release, publish an
archive containing the items above at the same time and for the same retention
period as the binary appliance, then replace the pending location in
`corresponding-source.json` with its immutable URL and SHA-256.

