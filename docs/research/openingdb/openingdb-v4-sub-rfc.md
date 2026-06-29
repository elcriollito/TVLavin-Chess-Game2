# CAISSA OpeningDB Phase 2A RFC (v4_sub + Node API)

## 1) Summary

Phase 2A introduces:

- `v4_sub` storage format (sub-sharded OpeningDB files)
- `GET /openingdb/node?fen=...` API at edge worker

Goal:

- Reduce deep-line lookup latency
- Eliminate browser OOM risk from loading/parsing monolithic shard JSON
- Keep `v3_p60` fully coexisting and rollback-safe

Non-goals:

- No `v3_p60` rebuild replacement in this phase
- No Phase 2B blocked/range format yet

## 2) Root Limitation in v3_p60

Current lookup path downloads and parses full shard files (`00..ff`) that are large (~64MB each).  
Per deep move, dominant cost is network + `JSON.parse` of entire shard, while row transform/render is negligible.

## 3) Chosen Sub-Sharding Scheme

Chosen: 3-hex key prefix.

Rationale:

- Existing `fenHash` is 16 hex (`sha1(...).slice(0,16)`)
- Current shard key = first 2 hex (`00..ff`)
- New sub-shard key = first 3 hex (`000..fff`)
- Keeps fanout moderate and routing simple:
  - each old shard splits into 16 sub-shards
  - total max files: 4096
- 4-hex would further reduce file size but increases object count and operational overhead too much for quick-win phase.

## 4) v4_sub Output Format

Version name: `v4_sub`

Storage layout (R2 keys):

- `openingdb/subshards/v4_sub/{hhh}.json` where `{hhh}` is `[0-9a-f]{3}`
- `openingdb/subshards/v4_sub/index.json`
- `openingdb/subshards/v4_sub/meta.json` (optional diagnostics)

Example paths:

- `openingdb/subshards/v4_sub/71a.json`
- `openingdb/subshards/v4_sub/71b.json`
- `openingdb/subshards/v4_sub/3ef.json`

Each sub-shard JSON keeps existing node payload shape for compatibility:

```json
{
  "71a01234abcd5678": {
    "moves": [
      { "uci": "e2e4", "san": "e4", "games": 12345, "w": 52.3, "d": 28.1, "l": 19.6, "lastYear": 2025, "avgElo": 2370 }
    ]
  }
}
```

## 5) Manifest Compatibility Strategy

Keep top-level `openingdb/manifest.json` schema stable; extend only with optional fields:

```json
{
  "activeVersion": "v4_sub",
  "baseUrl": "https://downloads.caissa-chess.org/openingdb/shards/v4_sub",
  "format": "subshard-3hex",
  "nodeApi": {
    "enabled": true,
    "path": "/openingdb/node",
    "version": "v4_sub"
  }
}
```

Notes:

- `baseUrl` remains for backward compatibility with old clients.
- New UI path can prefer `nodeApi` when `useNodeApi=1` feature flag is enabled.
- `v3_p60` remains untouched and available.

## 6) Node API Contract

Endpoint:

- `GET /openingdb/node?fen=<FEN>&version=v4_sub`

Request behavior:

- Normalize FEN as existing logic (`board turn castling ep`)
- Generate variants in order:
  - `exact`
  - `no_ep`
  - `no_castling`
  - `board_only`
- For each variant:
  - compute `fenHash`
  - locate sub-shard by first 3 hex
  - lookup node by full `fenHash`
  - return first match

Success response (`200`):

```json
{
  "ok": true,
  "version": "v4_sub",
  "matchLevel": "exact",
  "fenHash": "71a01234abcd5678",
  "subShardId": "71a",
  "node": {
    "moves": [
      { "uci": "e2e4", "san": "e4", "games": 12345, "w": 52.3, "d": 28.1, "l": 19.6, "lastYear": 2025, "avgElo": 2370 }
    ]
  }
}
```

Not found (`404`):

```json
{
  "ok": false,
  "error": "Node not found",
  "version": "v4_sub"
}
```

Validation error (`400`):

```json
{
  "ok": false,
  "error": "Invalid fen"
}
```

Server error (`500`):

```json
{
  "ok": false,
  "error": "Lookup failed"
}
```

Edge cache:

- Cache key includes `version + fenHash + matchLevel`
- Response header target:
  - success: `Cache-Control: public, max-age=300`
  - not-found: `Cache-Control: public, max-age=60`

## 7) Coexistence and Rollback

Coexistence:

- Keep `v3_p60` active by default until canary passes.
- Deploy `v4_sub` objects in parallel path (`openingdb/subshards/v4_sub/...`).
- Add `node` endpoint without changing existing shard endpoints.
- UI uses node API only with feature flag (`useNodeApi=1`).

Rollback:

- Disable feature flag / stop using node API in UI.
- Optionally switch manifest `activeVersion` back to `v3_p60`.
- No deletion required.

## 8) Implementation Plan

Step 1: Tooling/build for `v4_sub`

- Add build/split script from existing finalized shards.
- Generate `subshards/v4_sub/{hhh}.json` + `index.json`.

Step 2: Worker endpoint

- Add `/openingdb/node` handler in `downloads-worker/worker.js`.
- Reuse existing hash + variant logic.

Step 3: UI feature flag

- Add `useNodeApi` flag in `js/opening-database.js`.
- When on, call `/openingdb/node`; otherwise keep current shard client path.

Step 4: QA local

- Compare node API vs existing client lookup on known lines.

Step 5: Canary deploy

- Deploy worker endpoint + v4_sub assets.
- Enable `useNodeApi` for canary sessions only.

Step 6: Benchmark

- Compare p50/p95 lookup latency and memory profile against `v3_p60`.

## 9) Targets

- p95 lookup latency < 1s (node API path)
- No browser OOM on deep line (~40 ply)

## 10) Risks

- Increased R2 object count (4096 sub-shards)
- Worker cold-start or cache miss spikes
- Consistency bugs between client hash normalization and worker hash normalization

Mitigations:

- Keep exact same hash/normalization implementation shared or duplicated verbatim
- Add deterministic QA vectors for exact/no_ep/no_castling/board_only
- Canary first, fallback always available

## 11) First Executable Task

Run planning tool (no production changes):

```bash
node scripts/plan-openingdb-v4-sub.js --in data/openingdb/shards_build/v3_p60 --version v4_sub
```

This outputs a concrete rollout plan file:

- `data/openingdb/subshards_build/v4_sub/plan.json`

