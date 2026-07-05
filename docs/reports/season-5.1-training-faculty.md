# Season 5.1 - CAISSA Academy Training Faculty

## Objective

Season 5.1 upgrades the Academy foundation from generic training placeholders into a professional Training Faculty catalog.

This phase remains UX, architecture, and catalog only. It does not implement engines, Stockfish, LLMs, game play, bots, or training logic.

## Architecture

The Academy remains an isolated product surface:

- section: `academySection`
- route: `/academy`
- query route: `/?section=academy`
- stylesheet: `css/academy.css`
- lifecycle module: `js/academy-section.js`

The faculty catalog is static presentation data embedded in the Academy section for now. Future phases can move this into a structured catalog module when trainer behavior exists.

## Catalog Update

The Academy now uses the term **Training Faculty** instead of **Training Bots**.

The change is intentional:

- trainers should feel like teachers, not engines
- each trainer has an identity and teaching purpose
- the Academy is positioned as a learning environment, not a bot arena

## Faculty

### Paul

- Level: Friendly Beginner
- Difficulty: approximately 800
- Specialty: Learning basics
- Recommended for: new players building confidence

### Emily

- Level: Club Coach
- Difficulty: approximately 1200
- Specialty: Fundamentals and tactics
- Recommended for: improving club learners

### Sophia

- Level: Strategic Mentor
- Difficulty: approximately 1600
- Specialty: Positional chess
- Recommended for: players learning plans

### Morphy

- Level: Attack Instructor
- Difficulty: approximately 2000
- Specialty: Initiative and attacks
- Recommended for: ambitious attacking players

### Capablanca

- Level: Endgame Professor
- Difficulty: approximately 2200
- Specialty: Simplification and endings
- Recommended for: players converting advantages

### Tal

- Level: Tactical Wizard
- Difficulty: approximately 2500
- Specialty: Sacrifices and combinations
- Recommended for: advanced tactical learners

### CAISSA

- Level: Adaptive Academy
- Difficulty: variable
- Specialty: Personalized training
- Recommended for: long-term guided study

## Visual Filters

The Academy now includes visual filter controls:

- All
- Beginner
- Intermediate
- Advanced
- Masters

These filters are presentation-only in this phase. No filtering logic was added.

## Future Placeholders Preserved

The following learning paths remain visible:

- Opening Lessons
- Endgame Lab
- Tactics Arena
- Game Review
- Coach Mode

All remain marked as `Coming Soon`.

## Roadmap

### 5.2 - Engine Integration

Define the first safe boundary between faculty presentation and chess engine behavior.

### 5.3 - Coach Conversations

Introduce teaching-oriented explanations and guided feedback.

### 5.4 - Adaptive Training

Recommend lessons and drills based on progress and game history.

### 5.5 - Academy Progress

Track completed lessons, skill areas, and long-term improvement.

## What Was Not Touched

This phase did not modify:

- Gateway
- FICS
- Style12
- Replay
- PGN
- Authentication
- CAISSA Classic
- Spectator TV
- Analyze
- Arena
- OpeningDB

## Validation

Required validation:

- `node --check js/academy-section.js`
- `git diff --check`
- smoke test for `/academy`
- smoke test for `/?section=academy`
- Production Validation Suite
