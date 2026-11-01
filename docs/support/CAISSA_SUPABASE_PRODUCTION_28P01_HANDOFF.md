# CAISSA Supabase Production PostgreSQL `28P01` support handoff

**Status:** external support blocker; no further authentication attempts

**Prepared:** 2026-10-18

**Project:** `jczauvkfkweuvdpurpem`

This document contains only non-secret evidence already collected. It is not a
request to reset a credential and does not authorize a new connection.

## Observed endpoint and method

- Direct endpoint: `db.jczauvkfkweuvdpurpem.supabase.co`
- Port/database/user: `5432` / `postgres` / `postgres`
- TLS policy: `verify-full`
- Client path: a temporary GCP runner using modern PostgreSQL/Node client
  tooling.

Separate Session Pooler/Supavisor symptoms were investigated previously. They
must not be presumed to have the same cause as the Direct failure.

## Evidence chronology

The retained local attestations record Production authentication failures at:

- `2026-10-18T14:33:41.944Z`
- `2026-10-18T14:35:48.965Z`
- memory-only confirmation at `2026-10-18T14:57:31Z`

The server returned `SQLSTATE 28P01` (`password authentication failed for user
"postgres"`). The last method used a hidden local `SecureString`, encrypted SSH
stdin, and an in-memory Node PostgreSQL password. It did not use `PGPASSFILE`,
`PGPASSWORD`, command arguments, shell history, or application logs.

Synthetic transport tests covered boundary spaces, colons, and backslashes and
passed before the single real memory-only attempt. That attempt opened one
authentication connection, executed zero SQL statements, and performed no
automatic retry. Cleanup found no remaining authentication process, temporary
pgpass file, or synthetic container.

## Confirmed non-actions

- No backup was created or claimed.
- No restore was attempted.
- No user/account deletion began.
- No migration, grant, connection string, Vercel variable, API key, Staging
  credential, or Production dataset was changed by the diagnostic.
- No password or secret is recorded in this document.

## Support questions

Supabase Support should verify, without requesting the password value:

1. Whether the project accepted the most recent database-password rotation and
   propagated it to the Direct PostgreSQL role used by the endpoint.
2. Whether `postgres` login state, endpoint routing, or project credential
   metadata is stale or inconsistent.
3. Whether platform logs correlate the timestamps above with the expected
   Production project and role.
4. Whether Direct and Supavisor observations are independent incidents.
5. Which non-secret diagnostic or owner-side dashboard action is required next.

## Evidence still required

- Supabase ticket/reference ID and current response were not found in the local
  evidence set. Add them only from an authorized owner/support channel.
- A successful, owner-authorized Direct read-only authentication after Support
  remediation.
- A certified encrypted backup and isolated restore; these cannot begin before
  database authentication succeeds.

## Resume rule

Resume only after Support supplies a concrete remediation or diagnostic and the
owner authorizes one bounded connection attempt. The first attempt must again
use hidden memory-only transport, Direct TLS `verify-full`, one read-only
`SELECT`, no retry, and no backup or mutation until authentication passes.
