# SEC-013 — `sharp` GHSA risk acceptance

- Status: ACCEPTED — NOT PRODUCTION-REACHABLE
- Advisory: `GHSA-rgj7-g3m4-5g8c`
- Package: `sharp@0.35.3`
- Owner: CAISSA Release Engineering
- Recorded: 2026-09-10
- Review / expiry: 2026-09-24

## Scope and rationale

`sharp@0.35.3` is an exact-pinned direct development dependency. It is absent
from `npm ls --omit=dev`, and no FICS component, production runtime, server, or
API route imports it. Repository use is limited to maintainer-controlled
favicon generation from source-defined SVG buffers and tests that inspect
repository-owned images. CAISSA has no user-controlled HEIF/AVIF input path.

The advisory affects versions before `0.35.4` when processing untrusted image
input through the vulnerable upstream libheif functionality. Those
preconditions are not present in the current production application or FICS
release candidate. The finding is therefore classified as
**NOT PRODUCTION-REACHABLE** and does not require a dependency change in the
FICS release checkpoint.

## Invalidation conditions

This acceptance becomes invalid immediately if CAISSA introduces any of the
following:

- image uploads;
- user-controlled image processing;
- untrusted HEIF/AVIF processing; or
- a production server or API import of `sharp`.

Any invalidation requires a new reachability assessment before release.

## Non-blocking remediation

Upgrade the exact development dependency from `sharp@0.35.3` to
`sharp@0.35.4` or a later advisory-defined safe version in a separate,
isolated dependency checkpoint. Regenerate the lockfile and verify native
binary installation, favicon output, repository image-metadata tests, and the
release dependency gate. No dependency version is changed by this acceptance
record.
