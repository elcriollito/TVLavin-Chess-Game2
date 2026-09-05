# CAISSA Release Protection Policy

Every agent or engineer changing a certified CAISSA surface must:

1. Read the current production manifest.
2. Read the affected surface manifest.
3. Read the master and surface-specific `RESTORE.md` guides.
4. Resolve the immutable production tag to identify the production SHA.
5. Work in an isolated branch and worktree.
6. Never replace the repository with a Vault ZIP.
7. Never replace a certified UI with an older snapshot.
8. Resolve generated conflicts in source inputs first.
9. Regenerate generated documents with the repository generator.
10. Run the affected surface fingerprint tests.
11. Preserve newer unrelated surfaces and commits.
12. Create a new immutable release snapshot after publication.

A newer certified release **supersedes** an older release. It does not destroy,
move, rewrite, or invalidate the older Vault. Certified tags and archive branches
must never be force-updated or deleted as part of ordinary development.

Recovery is surgical: compare fingerprints and hashes, restore only the affected
surface in an isolated worktree, regenerate derived output, test, visually certify,
merge, deploy, and then create a new snapshot. A Vault archive is evidence and a
recovery source—not a blind repository replacement mechanism.
