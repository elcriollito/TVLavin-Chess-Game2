# PR #117 curated Vercel release path

## Relationship between Git input and certified staging

`PUBLIC_RELEASE_ARTIFACT_MANIFEST.json` is the positive inventory for the web
release. `npm run release:public:build` copies exactly those regular files into
an external staging directory and verifies every SHA-256. The staging directory
does not contain `.vercelignore`.

The repository-root `.vercelignore` is generated from the same manifest. It
starts with the documented Vercel root default-deny rule `/*`, reopens only the
directory nodes needed to reach approved files, re-closes every directory with
`/<directory>/*`, and finally re-includes every exact manifest path. Glob
metacharacters in literal route filenames are escaped. There are no wildcard
allowlist exceptions.

Consequently:

- a Git-triggered Vercel build receives the same 1,772 approved source files;
- unexpected tracked or untracked repository files remain denied;
- the external CLI staging and Git upload are independently reproducible from
  one reviewed manifest;
- Vercel Git metadata binds the deployment to the exact Git commit.

The former policy used a single `*`. It also denied every required function, so
`vercel.json` could not match `api/insights/**/*.js` and Vercel returned
`unused_function`. Removing the wildcard without a positive inventory is not an
approved correction.

## Required verification

From a clean candidate worktree:

```text
npm run release:public:manifest
npm run release:public:audit
npm run release:public:verify-vercel
npm run test:caissa-downloads-polyglot
npm run security:dependencies
```

The generated manifest must remain at 1,772 paths unless a separately reviewed
public file is intentionally added or removed. A changed manifest requires
fresh hash review. The root allowlist must equal `renderVercelIgnore(manifest)`.

## Release procedure

1. Push the reviewed PR head and require the authoritative
   `tv-lavin-chess-game2` Git Preview to reach `READY` for that exact SHA.
2. Verify critical file readbacks against the manifest and run protected
   browser tests on that deployment.
3. Require Scanner verification and reconcile every Vercel status context.
4. Revalidate `origin/main`, PR base/head, mergeability, and the live rollback
   deployment immediately before merge.
5. Merge only the reviewed PR head. Let the authoritative Git integration build
   production from the merge commit; do not substitute the secondary project.
6. Verify the production deployment ID, Git SHA and public aliases before smoke
   testing the real domains.

## Rollback

The pre-release rollback target is
`dpl_FxhsmUJUvp5AGiKXQBZ7FDhX28Hy`, commit
`9c6c14c5fa813330e9fb8a78e777ce47e647467a`. If production identity, routes,
conversion, localization, Opening Database, navigation or engine smoke tests
fail, stop traffic to the candidate and use the authorized Vercel rollback to
that exact READY deployment. Verify both public aliases after rollback.
