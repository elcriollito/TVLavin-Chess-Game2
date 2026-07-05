# Season 5.3 - CAISSA Academy Curriculum Preview

## Objective

Season 5.3 adds a visual curriculum preview to every CAISSA Academy faculty profile.

This phase does not implement lessons, engines, Stockfish, AI, LLMs, gameplay, progress tracking, or educational logic. It only presents the future program of study for each mentor.

## Curriculum Philosophy

The Academy should feel like a school. Faculty members already have identities; this phase gives each mentor a clear teaching program.

The curriculum previews answer a simple student question:

What will I learn with this teacher?

Each profile now contains a `Curriculum` section with five module-style lessons. Every module shows:

- lesson number
- lesson title
- `Coming Soon` status
- small educational icon treatment

## Faculty Curriculum

### Paul

- Lesson 1: Chessboard Basics
- Lesson 2: How Pieces Move
- Lesson 3: Captures
- Lesson 4: Check and Checkmate
- Lesson 5: Your First Complete Game

### Emily

- Lesson 1: Piece Safety
- Lesson 2: Opening Principles
- Lesson 3: Basic Tactics
- Lesson 4: Avoiding Blunders
- Lesson 5: Simple Planning

### Sophia

- Lesson 1: Pawn Structures
- Lesson 2: Planning
- Lesson 3: Weak Squares
- Lesson 4: Piece Coordination
- Lesson 5: Positional Evaluation

### Morphy

- Lesson 1: Development
- Lesson 2: Open Files
- Lesson 3: Initiative
- Lesson 4: Attacking the King
- Lesson 5: Classic Attacks

### Capablanca

- Lesson 1: King Activity
- Lesson 2: Opposition
- Lesson 3: Lucena Position
- Lesson 4: Philidor Position
- Lesson 5: Converting Advantages

### Tal

- Lesson 1: Sacrifices
- Lesson 2: Calculation
- Lesson 3: Initiative
- Lesson 4: King Hunts
- Lesson 5: Creative Chess

### CAISSA

- Lesson 1: Assessment
- Lesson 2: Adaptive Plan
- Lesson 3: Personalized Exercises
- Lesson 4: Progress Review
- Lesson 5: Custom Training

## Future Features Panel

The Academy now includes a small roadmap preview:

- Adaptive Training
- Training Games
- Interactive Lessons
- Progress Tracking
- Achievements

All items are marked `Coming Soon`.

## Future Lesson Architecture

Future implementation should keep curriculum content separate from execution logic.

Recommended direction:

- define lesson metadata first
- keep faculty identity separate from engine behavior
- map lessons to board positions only after the curriculum model is stable
- avoid introducing engines as opponents before the teaching model is clear
- keep progress tracking separate from lesson presentation

## Roadmap

### 5.4 - Learning Paths

Group faculty lessons into beginner, club, strategic, attacking, endgame, tactical, and adaptive tracks.

### 5.5 - Student Passport

Introduce a student-facing record for progress, completed lessons, and milestones.

### 5.6 - Engine Mapping

Map future lesson/faculty behavior to engine support safely and invisibly.

### 5.7 - Coach Conversations

Add guided educational dialogue after the learning model and curriculum structure are stable.

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
