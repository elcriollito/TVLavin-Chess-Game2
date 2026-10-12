# Private Realtime delivery

## Decision

CAISSA Online keeps two private invalidation emitters active after a canonical
move mutation:

1. The database trigger created by
   `20261005204209_caissa_online_native_v1.sql` calls
   `realtime.broadcast_changes()`.
2. After `caissa_online_commit_move` returns successfully, the server sends a
   compact private Broadcast through Supabase Realtime's REST batch endpoint.

Both emitters carry the game topic and canonical version. They do not carry or
mutate authoritative chess state. The browser treats every message as an
invalidation and performs an authenticated state read. Polling remains the
recovery path if WebSocket delivery is unavailable.

The browser runtime is pinned to `@supabase/supabase-js@2.93.1`. It supplies an
asynchronous access-token callback and awaits `realtime.setAuth()` before it
creates and subscribes the private channel. Refresh and reconnect call
`setAuth()` without freezing an earlier token value.

This is deliberate at-least-once delivery. The client rejects duplicate and
older versions, serializes resync work, and retains the newest version received
while a read is in flight. A Realtime message cannot apply a move, finish a
game, or update rating; those effects remain inside the idempotent database
transaction.

## Failure boundary

The canonical move commits before the REST Broadcast is attempted. The send is
bounded to five seconds. A timeout or non-202 response is logged as delivery
degradation and does not turn the already accepted move into an API failure.
The opponent can still recover through the database-trigger path or polling.

The REST emitter lives only under `api/` and reads its credential from the
server environment. The public configuration exposes only the publishable key;
the service-role credential is never serialized into a response or browser
module.

## Hosted observation and evidentiary limit

During the Staging closeout, authenticated participants reached `SUBSCRIBED`
and the database trigger inserted correctly correlated private messages, but
the expected WebSocket delivery was not observed on that path. That establishes
an observed delivery failure. It does **not** establish a root cause inside the
database trigger, WAL/publication processing, Realtime routing, or the hosted
service.

The server REST emitter restored correlated WebSocket delivery. Because the
underlying trigger-path cause was not isolated, the trigger remains in place
rather than being removed on an inference. Duplicate trigger/REST delivery is
safe under the version and resync rules above.

Supabase documents Broadcast over client, REST, and database paths, private
channel authorization through RLS, and the requirement to initialize Realtime
authorization before subscription:

- <https://supabase.com/docs/guides/realtime/broadcast>
- <https://supabase.com/docs/guides/realtime/authorization>

## Staging-only diagnostic ledger entries

The hosted investigation added two migration-history entries to Staging:

| Version | Name | Effect |
|---|---|---|
| `20261011213000` | `caissa_online_realtime_messages_publication` | Temporarily added `realtime.messages` to the general `supabase_realtime` publication after the delivery failure was observed. |
| `20261011214235` | `restore_supabase_realtime_publication_scope` | Removed that temporary membership and restored the pre-diagnostic general-publication scope. |

The second entry does not remove or change Supabase's dedicated
`supabase_realtime_messages_publication`. The pair has no intended net catalog
change, but both rows remain part of Staging's migration ledger and therefore
must appear as an explicit Staging-only exception in future ledger comparison.

These diagnostic SQL units are intentionally absent from this repository
update. They must not be replayed in Production, inferred as Product
migrations, deleted from Staging, or repaired in migration history without a
separate reviewed decision. A future `supabase migration list` or automated
push against Staging may report the two remote-only versions; that mismatch is
expected and must be adjudicated before using an automatic migration command.
The Product migration sequence in this change remains:

- `20261005204209_caissa_online_native_v1`
- `20261011150814_caissa_online_hardening_only_v3`

## Verification contract

Automated coverage must demonstrate:

- asynchronous token acquisition completes before private subscription;
- token refresh, reconnect cleanup, sign-out, and identity change cannot leave
  a duplicate subscription or stale token;
- duplicate and older Broadcast versions are ignored;
- a newer version received during a resync causes a trailing canonical read;
- REST rejection and timeout leave an already committed move successful;
- the REST wait is bounded and its payload is private and version-correlated;
- public configuration never exposes the server Broadcast credential.

Hosted evidence remains external to the repository. Backups, recovery keys,
Development account data, tokens, cookies, and storage state are not release
artifacts.
