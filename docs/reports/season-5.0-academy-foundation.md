# Season 5.0 - CAISSA Academy Foundation

## Objective

Season 5.0 creates the foundation for CAISSA Academy as a new first-class product surface inside CAISSA Chess.

Academy is not a place to play against Stockfish. It is a training and learning environment where future engines and assistants can behave like teachers rather than simple opponents.

## Architecture

The Academy foundation is implemented as an independent section:

- Navigation item: `Academy`
- Section id: `academySection`
- Navigation key: `academy`
- Direct route support: `/academy`
- Query route support: `/?section=academy`
- Isolated stylesheet: `css/academy.css`
- Lightweight section lifecycle module: `js/academy-section.js`

The section follows the existing CAISSA navigation pattern used by Play, Analyze, Arena, Spectator TV, and CAISSA Classic.

## What Was Added

- Academy navigation entry in the sidebar.
- New Academy landing section.
- Educational hero:
  - `Welcome to CAISSA Academy`
  - `Learn. Practice. Master.`
- Placeholder learning paths:
  - Training Bots
  - Opening Lessons
  - Endgame Lab
  - Tactics Arena
  - Game Review
  - Coach Mode
- Placeholder trainer cards:
  - Paul
  - Emily
  - Sophia
  - Morphy
  - Capablanca
  - Tal
  - CAISSA

## What Was Not Added

This phase intentionally does not add:

- chess engines
- Stockfish integration
- LLM integration
- bots
- account progression
- lesson logic
- adaptive training logic
- game analysis logic
- new FICS behavior

## Product Vision

CAISSA Academy should become a calm, structured learning center.

Future trainers should explain chess, guide practice, and help users improve. The experience should feel more like a chess school or library than an engine battle screen.

## Roadmap

### 5.1 - Training Bots

Introduce the first interactive teacher personalities and define the safe engine/teacher boundary.

### 5.2 - Coach Mode

Add guided explanations and teachable moments for positions and games.

### 5.3 - Opening Trainer

Create structured opening lessons and repertoire practice.

### 5.4 - Endgame Lab

Add practical endgame training positions and guided conversion practice.

### 5.5 - Adaptive Training

Use user progress and game history to recommend focused training paths.

## Validation

Required validation for this phase:

- `node --check js/academy-section.js`
- `git diff --check`
- browser smoke for `/?section=academy`
- browser smoke for `/academy`
- Production Validation Suite

## Production Safety

Academy is a new isolated surface. It does not modify Gateway, FICS, Style12, Replay, PGN, Authentication, Spectator TV, CAISSA Classic, Analyze, Arena, or OpeningDB.
