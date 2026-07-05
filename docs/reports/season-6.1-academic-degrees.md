# Season 6.1 - CAISSA Academy Academic Degrees

## Objective

Season 6.1 adds a visual Academic Degrees system to CAISSA Academy. The goal is to make student growth feel institutionally organized while avoiding any real progress logic, backend, certificates, engines, or AI.

This phase is visual structure only.

## Academic Degree Ladder

The Academy now presents six placeholder ranks:

- Novice
- Student
- Club Scholar
- Strategic Scholar
- Academy Fellow
- CAISSA Master

Each degree displays:

- Name
- Description
- Placeholder requirements
- Coming Soon status

## Student Journey Integration

The Student Journey passport now includes:

- Current Academic Rank: Novice
- Next Academic Rank: Student
- Progress: Coming Soon

The rank track now uses the same academic degree language, replacing the older generic level names.

## Faculty Profile Integration

Faculty cards now show a Recommended Academic Level:

- Daisy -> Novice
- Mya -> Student
- Alex -> Club Scholar
- Sophia -> Strategic Scholar
- Morphy -> Academy Fellow
- Capablanca -> Academy Fellow
- Tal -> CAISSA Master
- CAISSA -> Adaptive

This helps students understand which mentor best fits their current academic stage.

## Roadmap

- 6.2 Course Catalog
- 6.3 Certification System
- 6.4 Engine Mapping
- 6.5 Coach Conversations
- 6.6 Adaptive Academy

## Not Changed

This phase did not modify:

- Gateway
- FICS
- Replay
- PGN
- CAISSA Classic
- Core gameplay logic
- Engines or Stockfish
- AI or LLM integration
- Backend storage
- Real progress tracking
- Real certificate generation

## Validation Plan

- `node --check js/academy-section.js`
- `git diff --check`
- Academy smoke test with `/?section=academy`
- Full Production Validation Suite
