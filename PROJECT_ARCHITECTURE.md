# CAISSA Project Architecture

Status: Production architecture reference

This document describes the current CAISSA Chess repository before structural cleanup. It is intended as a stable map of the system, not a cleanup plan or migration patch.

## 1. Project Overview

CAISSA Chess is a production chess platform with a browser-first client and several supporting services for play, analysis, online chess, opening research, and deployment validation.

Major subsystems:

- Web Client: the main single-page CAISSA application in `index.html`, `app.js`, `styles.css`, and supporting modules under `js/` and `css/`.
- Play Page: local chess play, engine play, opening book display, ECO-aware opening coach, move navigation, PGN export, and related board controls.
- Analyze: online game fetching, PGN loading, move navigation, Stockfish review, annotations, mentor summaries, review summary, critical moments, evaluation bar, and board flip controls.
- Arena: engine-vs-engine matches, custom FEN/manual setup, infinite analysis, match controls, evaluation display, graph, and move list.
- FICS Client: browser UI for Free Internet Chess Server play through a secure WebSocket gateway, including guest/registered login, lobby, live Style12 board rendering, graphical moves, promotion selector, PGN download, sounds, and room tables.
- Opening Database: opening exploration, shard-backed statistics, ECO integration, memory-safe depth limits, and related tooling.
- ECO Chess Opening Codes: ECO opening page/data source used by Play and other opening-aware features.
- Game Library and Mentor: supporting user workflows for saved positions/games and contextual chess guidance.
- Cloudflare Gateway and Workers: FICS WebSocket-to-TCP gateway plus downloads/opening database worker infrastructure.
- Production Validation Suite: lightweight post-deploy checks for FICS guest login, lobby, watch, Style12, promotion safety, console, disconnect, and reconnect.

## 2. Repository Architecture

Current high-level structure:

- `index.html`: primary application markup and section containers.
- `app.js`: main Play page and shared app orchestration logic.
- `styles.css`: main global and section styling.
- `js/`: feature modules for Analyze, Arena, FICS, navigation, auth, ECO, opening database, engine adapters, and supporting UI modules.
- `css/`: feature-scoped stylesheets, including FICS, ECO, Opening Database, auth, sync, DOS chess, and tool pages.
- `api/`: Vercel/serverless API endpoints used by production flows.
- `public/`: public static data/assets, including generated opening/ECO artifacts.
- `data/`: local/generated datasets and opening-related source data. Some subtrees are intentionally ignored.
- `scripts/`: build, QA, upload, benchmark, and validation scripts.
- `docs/`: subsystem reports, stable-candidate notes, pipeline documentation, and validation suite docs.
- `downloads-worker/`: Cloudflare Worker for CAISSA Vault/downloads and opening database related endpoints.
- `gateway/fics-cloudflare-worker/`: Cloudflare Worker proof/production gateway project for FICS WebSocket-to-TCP bridge.
- `server/`: local Node server and gateway helpers.
- `tools/`: standalone data-fetch or utility tools.
- `engine/`, `stockfish-worker.js`, `js/engine/*`: engine-related client/worker assets.
- `assets/`, `img/`, favicon/icon files: production media and branding assets.
- `tmp/`, `logs/`: local generated artifacts, smoke outputs, browser profiles, and logs. These are not production source.

The current repository contains both production code and active tooling/research artifacts. Future cleanup should separate these concerns without deleting useful history prematurely.

## 3. Production Components

Production-critical files and directories:

- `index.html`
- `app.js`
- `styles.css`
- `js/analyze-section.js`
- `js/fics-client.js`
- `js/fics-style12.js`
- `js/caissa-arena.js`
- `js/opening-database.js`
- `js/eco-page.js`
- `js/engine-adapter.js`
- `js/engine-registry.js`
- `css/fics-client.css`
- `css/opening-database.css`
- `css/eco-page.css`
- `api/`
- `public/`
- `vercel.json`
- `package.json`
- `package-lock.json`
- `downloads-worker/worker.js`
- `downloads-worker/wrangler.toml`
- `gateway/fics-cloudflare-worker/src/`
- `gateway/fics-cloudflare-worker/wrangler.toml`

Production validation and deployment-sensitive assets:

- `tools/validation/production-validation-suite.cjs`
- `docs/operations/production-validation-suite.md`
- `.vercel/` local link state, if present
- `.wrangler/` local Cloudflare state, if present
- Wrangler configs in worker projects

These paths should not be moved, renamed, or cleaned without a focused review and validation pass.

## 4. Infrastructure

### Cloudflare FICS Gateway

The FICS gateway bridges browser WebSocket traffic to FICS TCP:

- Browser connects to `wss://fics-gateway.caissa-chess.org/ws`.
- Cloudflare Worker accepts the browser WebSocket.
- Worker opens outbound TCP to `freechess.org:5000`.
- Worker relays FICS text protocol traffic in both directions.

Relevant project:

- `gateway/fics-cloudflare-worker/src/worker.js`
- `gateway/fics-cloudflare-worker/src/gateway-utils.js`
- `gateway/fics-cloudflare-worker/wrangler.toml`
- `gateway/fics-cloudflare-worker/scripts/`
- `gateway/fics-cloudflare-worker/test/`

The gateway supports health checks, origin allow-listing, rate limits, idle/session timeouts, and validation scripts.

### Downloads Worker

The downloads worker supports CAISSA Vault/downloads and related R2-backed APIs. It also contains ongoing OpeningDB node lookup work.

Relevant files:

- `downloads-worker/worker.js`
- `downloads-worker/wrangler.toml`
- `downloads-worker/DEPLOYMENT.md`
- `downloads-worker/package.json`
- `experimental/canary/wrangler.canary.toml` for canary experimentation

This worker is infrastructure-sensitive and should be handled separately from client UI work.

### Vercel Deployment

The public web application is deployed through Vercel.

Relevant files:

- `vercel.json`
- `.vercelignore`
- `api/`
- root static assets and client files

Local `.vercel/project.json`, when present, is environment-specific. It should not be relinked or used for manual deployment unless the target production project has been confirmed.

### Wrangler Configuration

Cloudflare Worker deployment uses Wrangler configs located under worker-specific directories. These files may include custom domains, worker names, R2 bucket bindings, Durable Object bindings, and observability settings.

Wrangler-related local state should be treated as deployment-linked and not cleaned casually.

## 5. Development Tooling

### OpeningDB Builders

Opening database tooling lives primarily in `scripts/`:

- `scripts/build-openingdb-index.js`
- `scripts/build-openingdb-games-index.js`
- `experimental/openingdb-v4/build-openingdb-v4-sub.js`
- `scripts/build-opening-book.js`
- `scripts/build-eco-position-map.js`
- `scripts/write-openingdb-manifest.js`
- `experimental/openingdb-v4/finalize-openingdb-from-raw.js`

These scripts generate or transform opening datasets and manifests. Some output directories are intentionally ignored because generated datasets can be large.

### QA Scripts

QA and verification scripts include:

- `scripts/qa-openingdb-v3.js`
- `experimental/openingdb-v4/qa-openingdb-v4-sub.js`
- `experimental/node-api/qa-openingdb-node-api.js`
- `tools/gamesearch/qa-gamesearch-index.js`
- `scripts/verify-known-lines.js`

These should be run when touching opening database generation, shard loading, or node API behavior.

### Production Validation Suite

The Production Validation Suite is a lightweight post-deployment smoke test:

- `tools/validation/production-validation-suite.cjs`
- `docs/operations/production-validation-suite.md`

It validates the live CAISSA FICS workflow without changing production behavior:

- Guest login
- Lobby
- Watch
- Style12 board updates
- Promotion selector safety while observing
- Raw console command response
- Disconnect
- Reconnect

### Benchmarks

Benchmark/probe scripts support OpeningDB and R2 validation:

- `scripts/benchmark-openingdb-ab.js`
- `experimental/canary/probe-openingdb-node-canary.js`

Benchmark output belongs in `tmp/` or archived reports, not mixed into feature commits.

### Utility Scripts

Other scripts support uploads, indexing, scraping, and pipeline maintenance:

- `scripts/upload-openingdb-shards-r2.js`
- `experimental/openingdb-v4/upload-openingdb-subshards-r2.js`
- `scripts/upload-openingdb-games-r2.js`
- `tools/gamesearch/upload-gamesearch-index-r2.js`
- `tools/`

Utility scripts should be committed only with matching documentation or validation evidence.

## 6. Experimental / Research

The repository currently includes ongoing or dormant experimental areas:

- OpeningDB v4 subsharding
- OpeningDB node API
- Canary downloads worker config
- R2 probing and upload smoke artifacts
- FICS gateway worker project and validation scripts
- Browser profile directories generated during UI validation
- Temporary production snapshots under `tmp/`

Known related paths:

- `docs/research/openingdb/openingdb-v4-sub-rfc.md`
- `experimental/openingdb-v4/build-openingdb-v4-sub.js`
- `experimental/openingdb-v4/plan-openingdb-v4-sub.js`
- `experimental/openingdb-v4/qa-openingdb-v4-sub.js`
- `experimental/canary/probe-openingdb-node-canary.js`
- `experimental/openingdb-v4/upload-openingdb-subshards-r2.js`
- `experimental/canary/wrangler.canary.toml`
- `tmp/`
- `logs/`

No deletion is recommended in this document. Experimental material should first be classified, archived, or moved to an explicit research area in a later cleanup phase.

## 7. Future Repository Organization

A cleaner long-term layout could separate production, infrastructure, tooling, generated data, and research:

```text
/
  app/
    index.html
    styles/
    js/
    assets/
  api/
  workers/
    fics-gateway/
    downloads/
  scripts/
    openingdb/
    gamesearch/
    validation/
    deployment/
  docs/
    architecture/
    operations/
    reports/
    research/
  data/
    source/
    generated/
  tmp/
  logs/
```

Possible principles for future organization:

- Production client code should be visually separate from one-off experiments.
- Worker projects should be self-contained and documented.
- Generated datasets and browser profiles should remain ignored.
- Research artifacts should be archived before deletion.
- Build/QA/upload scripts should live near their domain.
- Deployment-sensitive configs should be documented and reviewed before changes.

This is a proposal only. No structural movement is part of Phase 3.5A.

## 8. Development Rules

Repository principles:

- One feature or bugfix per commit.
- No mixed-purpose commits.
- Do not stage unrelated dirty files.
- Do not include local config, logs, caches, browser profiles, or generated temp output in production commits.
- Run `git diff --check` before committing.
- Run relevant `node --check` commands for modified JavaScript files.
- Run the Production Validation Suite before production deployment when client/FICS behavior changes.
- Archive before delete.
- Separate production code from tooling and research.
- Treat `.vercel/`, Wrangler configs, worker configs, and credentials as deployment-sensitive.
- Do not use local Vercel deploy unless the target project is verified.
- Keep Play, Analyze, Arena, FICS, Opening Database, workers, and tooling changes scoped to their owning task.

## 9. Roadmap Snapshot

### Completed

- Production Play page with opening book, ECO-aware coach, move list sync, and stable board layout.
- Analyze v1.2 production-ready workflow with game fetching, annotations, review summary, critical moments, mentor panel, navigation, evaluation bar, and validation reports.
- Arena engine match stabilization, custom FEN/manual setup, infinite analysis, evaluation graph, and layout improvements.
- FICS production gateway, secure WSS integration, guest and registered login, live Style12 board rendering, graphical move submission, promotion selector, room tables, watch switching, unseek/cancel, sound toggle, player bars, PGN download, and compact computer markers.
- Production Validation Suite.
- Browser and production hardening audits.

### Current

- Repository cleanup and architecture audit.
- Documentation-first structural planning.
- Classification of dirty/untracked local artifacts before cleanup.

### Pinned

- Do not break production FICS.
- Preserve Vercel production deployment path.
- Preserve Cloudflare gateway and downloads worker deployment configs.
- Keep OpeningDB tooling available until v4/subsharding decisions are finalized.
- Keep production validation repeatable before future deployments.

### Future

- Formalize worker project ownership and location.
- Decide whether FICS gateway remains in this repo or moves to a separate repository.
- Archive or formalize OpeningDB v4/subsharding research.
- Clean generated browser profiles, logs, and temporary R2 outputs after approval.
- Improve documentation around deployment, worker operations, and data pipelines.
- Expand cross-browser validation coverage beyond Chromium where practical.
