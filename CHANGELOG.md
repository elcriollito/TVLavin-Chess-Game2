# CAISSA Changelog

## Introduction

This changelog tracks official CAISSA Chess releases and platform milestones. It is not intended to list every individual commit. Instead, it summarizes stable release-level changes, major features, infrastructure milestones, notable fixes, and known limitations that matter to users, maintainers, and future contributors.

## Versioning Policy

CAISSA uses semantic-style release numbers:

```text
Major.Minor.Patch
```

Examples:

- `1.2.0`: stable minor release with new platform capabilities.
- `1.2.1`: patch release with fixes or small hardening improvements.
- `1.3.0`: next minor release with new documented scope.
- `2.0.0`: major release with substantial product or architecture expansion.

General meaning:

- Major: large platform shifts, major architecture changes, or major user-facing release eras.
- Minor: meaningful feature batches or stable subsystem milestones.
- Patch: focused bug fixes, compatibility fixes, validation updates, or documentation corrections.

## CAISSA Chess v1.2 - Foundation Release

CAISSA Chess v1.2 is the first documented stable platform release. It represents the point where CAISSA moved from a collection of strong features into a production-ready chess platform with live online play, game review, engine workflows, opening research, infrastructure, validation, and project documentation.

### Added

- Play: main browser chess surface with board controls, engine play, move history, PGN actions, hints, undo/resign controls, opening book display, and ECO-aware Opening Coach.
- Analyze: game fetching, PGN loading, selectable fetched games, move navigation, Stockfish analysis, annotations, mentor feedback, review summary, critical moments, evaluation bar, and board flip.
- Arena: engine-vs-engine matches, custom FEN/manual setup, infinite analysis, evaluation panel, move list, and graph layout.
- Opening Database: opening exploration, shard-backed statistics, depth limits, fast lookups, and build/QA tooling.
- FICS Gateway: secure Cloudflare Worker WSS gateway bridging browser WebSocket traffic to FICS TCP.
- Style12 parser: live FICS board-message parser for structured game state.
- Live Board: FICS positions converted to FEN, synchronized with chess.js, and rendered on the graphical board.
- Guest Login: default low-friction FICS connection mode.
- Registered Login (Beta): optional FICS username/password login with secure prompt handling and failure-state cleanup.
- Room Tables: compact FICS lobby with waiting seeks, active games, Sit/Watch actions, time controls, ratings where available, cancel/unseek support, and watch switching.
- Promotion Selector: visual promotion picker for live FICS graphical moves.
- Computer Marker `(C)`: compact BabasChess-style marker for likely computer/engine FICS accounts.

### Improved

- Production Hardening: reviewed FICS state transitions, reconnect/disconnect behavior, login failure states, watch switching, promotion safety, UI stability, and responsive layout behavior.
- Browser Compatibility Audit: reviewed CSS, JavaScript APIs, HTML forms/buttons, focus behavior, mobile constraints, and FICS browser assumptions.
- Production Validation Suite: added repeatable production checks for guest login, lobby, watch, Style12 updates, promotion safety, console, disconnect, and reconnect.
- Repository Documentation: added formal architecture and history documents to guide future cleanup and development.

### Fixed

- Action column regression: restored visible Sit/Watch/Cancel actions in the FICS Room Tables lobby.
- Registered login failure states: improved invalid-login cleanup, retry behavior, password clearing, and guest-mode recovery.
- Promotion workflow: replaced default queen-only behavior with a selector while preserving optimistic move handling and Style12 confirmation.
- Watch switching: allowed users to move between observed games cleanly.
- Disconnect cleanup: cleared stale observing/game state on disconnect and reconnect.
- Engine flow isolation: stabilized Engine vs Engine and Arena engine callbacks against stale or invalid best moves.
- Opening Database memory pressure: capped practical exploration depth and added guardrails around heavy branches.
- Analyze synchronization: stabilized move navigation, analysis status, evaluation mapping, and review summaries.

### Infrastructure

- Cloudflare Gateway: production WSS endpoint for FICS at `fics-gateway.caissa-chess.org`.
- Vercel Deployment: production web deployment for `www.caissa-chess.org`.
- Validation Suite: lightweight production validation script in `scripts/production-validation-suite.cjs`.
- Wrangler Configuration: worker projects documented and validated for FICS gateway and downloads/opening database infrastructure.

### Documentation

- `PROJECT_ARCHITECTURE.md`: production architecture reference covering subsystems, repository structure, infrastructure, tooling, experimental areas, development rules, and roadmap snapshot.
- `PROJECT_HISTORY.md`: historical narrative describing CAISSA's evolution, design philosophy, lessons learned, and future vision.

### Known Limitations

- Registered FICS login remains Beta pending wider real-user validation across more accounts and failure conditions.
- Manual Safari and Mobile Safari testing is still recommended because local validation has primarily covered Chromium-based flows.
- Live engine `(C)` marker validation depends on real FICS lobby data; local simulation has covered known engine-like names.
- FICS promotion testing may be hard to reproduce live on demand because it requires reaching an actual promotion position.
- OpeningDB v4 subsharding and node API work remain research/experimental until formally accepted.
- Repository cleanup is still pending; generated logs, tmp artifacts, and research files should be archived or cleaned only in dedicated cleanup phases.

## Future Releases

### CAISSA Chess v1.3

Planned direction:

- Repository Governance
- Cleanup
- Documentation
- CAISSA Classic preparation
- Clearer separation of production code, infrastructure, tooling, and research artifacts
- More formal worker ownership and operations docs

### CAISSA Chess v2.0

Potential major-release direction:

- Spectator TV
- Friends
- Tournament Center
- Live Opening Coach
- Expanded community features
- Classic chess-room themes
- Stronger cross-browser and mobile validation
- Deeper integration between live play, analysis, openings, and coaching
