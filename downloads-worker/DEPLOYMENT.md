# CAISSA Downloads Worker — Candidate Runbook

## Current verified catalog state

The only R2 download observed as present on 2026-11-07 is:

| Slug | Version | Object key | Bytes | SHA-256 | Observed ETag |
|---|---:|---|---:|---|---|
| `caissa-book-creator` | `v0.2.0` | `apps/caissa-book-creator/v0.2.0/CAISSA-Book-Creator-v0.2.0-portable.zip` | 244,203,091 | `58e12d34644f223c905583318961c3d8dde33644445a78d750709a923ffa4b38` | `1c3e28de1490a11cf13e9f6453e396c7` |

The historical v1.0.0 ZIP, changelog and checksum URLs returned `404` during the audit. They are retained in code only as unavailable historical records, return `410`, and are excluded from `/catalog`. Do not advertise or redirect users to them.

## Integrity behavior

The candidate Worker fails closed unless the v0.2.0 R2 object's size, ETag and stored R2 SHA-256 checksum all match the reviewed values. Successful responses expose the verified SHA-256 in both `X-CAISSA-SHA256` and `Digest` headers.

This is a storage-replacement guard, not a substitute for Authenticode. Both executables in the current ZIP are unsigned, and the portable source/build inputs were not found. Portable certification therefore remains pending.

Cloudflare exposes `object.checksums.sha256` only when SHA-256 was supplied and validated during object upload. The currently public object must be confirmed to carry that checksum before this Worker candidate can be deployed. A missing checksum deliberately returns `503`; do not weaken the check. Never reuse an immutable-cached versioned key for different bytes.

## Candidate checks (read-only/local)

```powershell
node --check downloads-worker/worker.js
node --test tests/caissa-expansion-security.test.js
```

Expected catalog behavior:

```text
GET /catalog
  lists caissa-book-creator only

GET /download/caissa-book-creator
  200 only when size, ETag and stored R2 SHA-256 match the pinned values

GET /download/polyglot-book-creator
  410 Release artifact unavailable
```

To independently verify downloaded bytes on Windows:

```powershell
Get-FileHash -Algorithm SHA256 -Path ".\CAISSA-Book-Creator-v0.2.0-portable.zip"
```

The result must be:

```text
58E12D34644F223C905583318961C3D8DDE33644445A78D750709A923FFA4B38
```

## Promotion prerequisites

Do not deploy this candidate until the owner has approved the exact commit and all of the following are complete:

- Review the Worker diff and catalog response.
- Confirm the current R2 object still has the pinned size and ETag.
- Review the portable source, build provenance and open-source obligations, or keep the artifact explicitly uncertified.
- Review the Microsoft Defender evidence and complete the pending VirusTotal hash review.
- Run Worker tests in a non-production environment.
- Confirm rollback can restore the previous Worker version immediately.

## Production lock

`wrangler deploy`, R2 uploads/deletes, custom-domain changes, live redirects and public URL changes are not authorized by this candidate. This document deliberately contains no deployment command sequence that could be mistaken for approval.
