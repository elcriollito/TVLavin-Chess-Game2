# Dependency and license advisory triage

Status: npm advisories `REMEDIATED LOCALLY`; broader license/artifact gaps remain `FUTURE ACTIVATION` or `COUNSEL REVIEW` and were not silently folded into a security upgrade.

## npm advisory resolution

| Chain | Baseline | Exposure classification | Local result |
|---|---|---|---|
| `cheerio -> undici` | `undici@7.29.1`; three reported advisories | Development/tooling path used by repository processing; not a browser bundle, but executed by trusted automation | exact same-major override `7.30.1`; audit clear |
| `@vercel/functions -> @vercel/oidc -> @vercel/cli-config -> zod` | `zod@4.1.11`; runtime transitive findings | Production dependency tree; vulnerable operation reachability was not established, but version is installed with server code | compatible override `4.6.6`; audit clear |

The registry's current `@vercel/functions` chain still pinned the older zod at review time, so a root override was required. `npm audit fix --force` and major upgrades were not used. Supply-chain tests require registry URLs, integrity hashes, exact policy versions and no runtime drift.

## Outstanding distribution/license evidence

These remain actionable from Legal Season 1 and were not fixed because they require rights/provenance decisions, artifact publication or a separately authorized release:

- Root `package.json` declares MIT but no repository-root `LICENSE` establishes the original CAISSA source grant/holder. Owner/counsel must choose the actual posture.
- `public/engines/fairy-stockfish/stockfish.wasm` is publicly conveyed even though its registry entry is disabled; exact binary hash/build/version/corresponding source is not established. Disablement is not GPL compliance. Map it and publish durable source/license evidence or remove it in an authorized release.
- Public Stockfish 18/19 WASM artifacts need durable exact-version corresponding-source/build links; Stockfish 19 evidence is stronger, Stockfish 18 remains weaker.
- `js/caissa-dos-chess.js` loads js-dos 8.3.20 from CDN while the lockfile records 8.5.3. Reconcile the actually conveyed GPL-2.0 version and corresponding-source/license delivery.
- Scanner artwork/piece-set catalog retains two reference-only/unverified entries. Do not train or redistribute them; preserve per-file author/source/license/attribution and fail closed.
- GNU Chess/DOS bundle and any distributed LGPL/MPL-covered output require version/source/notice confirmation.
- Eighty-two PGN albums remain uncertified for paid commercial delivery. Keep paid collections/books disabled.
- A consolidated `THIRD_PARTY_NOTICES`, public artifact-level notices/source links and takedown process remain outstanding.

## Acceptance gate

Before software/artifact distribution approval, every shipped binary must have an exact hash, version, license, source/build record and required notice; version drift must fail CI. Before model training or redistribution, every asset must have purpose-compatible rights and a protected split/lineage record. npm audit zero is not a license certification and does not close these items.
