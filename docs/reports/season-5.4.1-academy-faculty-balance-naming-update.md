# Season 5.4.1 - Academy Faculty Balance & Naming Update

## Objective

Season 5.4.1 adjusts the CAISSA Academy faculty catalog before publishing Season 5.4.

This is a UI, data, and content update only. It does not add engines, AI, Stockfish, backend storage, progress logic, or educational execution.

## Naming Updates

The first three faculty members were renamed:

- Paul -> Daisy
- Emily -> Mya
- Sophia -> Alex

Their existing levels and teaching roles remain in place:

- Daisy: approximately 800
- Mya: approximately 1200
- Alex: approximately 1600

## Faculty Balance

The previous catalog jumped from the 1600 range directly to Morphy at approximately 2000.

Season 5.4.1 adds a new intermediate mentor:

## Sophia

- Title: Advanced Club Mentor
- Approximate level: approximately 1800
- Best for: 1500-1900
- Specialty: Calculation and practical decision-making
- Teaching style: Precise and practical

### Training Focus

- Candidate moves
- Calculation discipline
- Converting advantages
- Practical defense
- Time-pressure decisions

### Favorite Openings

- Ruy Lopez
- Queen's Gambit
- Sicilian Defense

### Quote

"Strong players calculate with purpose."

### Curriculum

- Lesson 1: Candidate Moves
- Lesson 2: Calculation Trees
- Lesson 3: Practical Defense
- Lesson 4: Converting Advantages
- Lesson 5: Playing Under Pressure

All lessons remain marked `Coming Soon`.

## Final Faculty Order

The visible catalog is now ordered by level:

1. Daisy
2. Mya
3. Alex
4. Sophia
5. Morphy
6. Capablanca
7. Tal
8. CAISSA

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
- backend
- progress storage
- engine behavior
- AI behavior
- core application logic

## Validation

Required validation:

- `node --check js/academy-section.js`
- `git diff --check`
- local smoke for `/?section=academy`
- verify visible faculty names:
  - Daisy
  - Mya
  - Alex
  - Sophia
  - Morphy
  - Capablanca
  - Tal
  - CAISSA
- verify Paul and Emily no longer appear as visible faculty names
- verify Sophia appears with approximately 1800 level
- Production Validation Suite
