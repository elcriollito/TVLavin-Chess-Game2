# Season 6.2 - CAISSA Academy Course Catalog

## Objective

Season 6.2 creates the official visual Course Catalog for CAISSA Academy. The Academy now presents courses offered by each faculty, establishing the academic hierarchy for future lessons.

This phase is structure only. It does not implement lessons, engines, AI, backend storage, progress, or course launch behavior.

## Academic Hierarchy

The Academy structure is now:

1. Faculties
2. Courses
3. Curriculums
4. Lessons

Courses act as the bridge between faculty organization and future lesson content.

## Course Catalog

### Faculty of Fundamentals

- Course 101 - Chess Fundamentals - Beginner
- Course 102 - Opening Principles - Beginner

### Faculty of Strategy

- Course 201 - Pawn Structures - Intermediate
- Course 202 - Planning in Chess - Intermediate

### Faculty of Dynamic Chess

- Course 301 - Attacking the King - Advanced
- Course 302 - Initiative - Advanced

### Faculty of Endgame Science

- Course 401 - Fundamental Endgames - Advanced
- Course 402 - Technical Conversion - Master

### Faculty of Adaptive Learning

- Course A1 - Personalized Learning - Adaptive

## Course Card Model

Each course card displays:

- Course ID
- Course name
- Difficulty
- Faculty
- Recommended Mentor
- Estimated Hours
- Status

All courses remain Coming Soon.

## Course Details

Each course includes placeholder details for:

- Description
- Objectives
- Prerequisites
- Curriculum
- Estimated Time
- Mentor

These are informational only and do not start lessons.

## Academy Integration

Student Journey now includes:

- Current Course: None

Learning Paths now include:

- Recommended Courses

This links paths, faculties, mentors, and future courses without adding runtime logic.

## Roadmap

- 6.3 Certification Program
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

## Validation Plan

- `node --check js/academy-section.js`
- `git diff --check`
- Academy smoke test with `/?section=academy`
- Full Production Validation Suite
