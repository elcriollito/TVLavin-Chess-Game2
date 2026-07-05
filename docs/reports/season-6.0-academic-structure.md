# Season 6.0 - CAISSA Academy Academic Structure

## Objective

Season 6.0 organizes CAISSA Academy as an academic institution. Mentors now belong to faculties, and faculties become the top-level educational structure above individual teachers and learning paths.

This phase is structural and visual only. It does not implement AI, engines, backend storage, real progress, course execution, or adaptive logic.

## Academic Philosophy

CAISSA Academy should feel like a chess university. Students should understand the school by academic departments first, then choose paths and mentors within those departments.

The structure is:

1. Academy
2. Academic Faculties
3. Learning Paths
4. Recommended Mentors
5. Future courses, lessons, exams, and certificates

## Faculty Organization

### Faculty of Fundamentals

- Color: Green
- Mentors: Daisy, Mya
- Purpose: Build solid chess foundations.
- Learning focus: rules, piece safety, first plans, simple tactics, and early confidence.

### Faculty of Strategy

- Color: Blue
- Mentors: Alex, Sophia
- Purpose: Planning, positional play and long-term thinking.
- Learning focus: pawn structures, coordination, candidate moves, and practical decisions.

### Faculty of Dynamic Chess

- Color: Red
- Mentors: Morphy, Tal
- Purpose: Initiative, attack and creative chess.
- Learning focus: activity, open lines, sacrifices, initiative, and attacking patterns.

### Faculty of Endgame Science

- Color: Purple
- Mentor: Capablanca
- Purpose: Master technical endings.
- Learning focus: simplification, king activity, conversion, and technique.

### Faculty of Adaptive Learning

- Color: Gold
- Mentor: CAISSA
- Purpose: Personalized learning paths.
- Learning focus: future adaptive plans, personalized review, and student-specific guidance.

## Educational Hierarchy

Learning Paths now show both:

- Recommended Faculty
- Recommended Mentor

This keeps the Academy organized at the institutional level while preserving the personal mentor experience introduced in Season 5.

## Future Expansion

The Academic Faculties layer prepares the platform for:

- Faculty-specific course catalogs
- Certification programs
- Exams and assessments
- Mentor-led lesson sequences
- Adaptive recommendations
- Engine and coach integrations in later phases

## Roadmap

- 6.1 Course Catalog
- 6.2 Certification System
- 6.3 Engine Mapping
- 6.4 Coach Conversations
- 6.5 Adaptive Academy

## Not Changed

This phase did not modify:

- Gateway
- FICS
- Style12
- Replay
- PGN
- Authentication
- CAISSA Classic
- Spectator TV
- Mentor Guidance logic
- Engines or Stockfish
- AI or LLM integration
- Backend storage
- Real progress tracking

## Validation Plan

- `node --check js/academy-section.js`
- `git diff --check`
- Academy smoke test with `/?section=academy`
- Full Production Validation Suite
