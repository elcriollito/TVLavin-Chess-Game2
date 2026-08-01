# Season 10 Technical Release Notes

## Version decision

Release-package version `10.0.0` is governed by the Season roadmap and `Season10ReleasePackage@1.0.0`. The repository package remains `1.0.0`; component and data-schema versions remain independent compatibility authorities. The Season version identifies an immutable package and does not activate gated features.

Proposed later tag: annotated `season-10.0.0`, message `CAISSA Simplified Play Season 10 package`, targeting the packaging commit. Creation requires explicit release authorization and occurs only after package validation and before an authorized push/deployment sequence. No tag is created here.

## Package architecture

The package covers 57 commits from `eb0511043dd397ac6ff50f05b4e67a84144b5d78` through `5132b34010339acf715e9359dfc239d861778755`. `packagingCommit: manifest-owner-commit` is deterministic because a Git commit cannot embed its own hash; after commit, Git identifies the manifest-owning packaging commit externally.

Activation remains unchanged: Classic homepage, Legacy normal Play, QA-only Simplified Play, blocked Players, QA-only themes, local bounded analytics, and disabled analytics transport. The package includes gated implementation without representing it as publicly available.

## Integrity and artifacts

The integrity record uses SHA-256 over exact UTF-8 bytes for each release artifact and a stable, ordered inventory. No timestamp enters identity. The package ID uses the canonical manifest digest prefix. Validators reproduce Git order, hashes, blockers, defaults, artifact digests, and runtime non-registration.

Artifacts are the readiness audit, package/commit manifests, changelog, user and technical notes, deployment plan, integrity record, validator tests, and package command. No binary archive is required by current repository convention.
