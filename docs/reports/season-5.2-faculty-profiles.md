# Season 5.2 - CAISSA Academy Faculty Profiles

## Objective

Season 5.2 turns the Academy faculty cards into complete mentor profiles.

This phase is identity and UX only. It does not implement engines, Stockfish, AI, LLMs, training games, lesson execution, or gameplay.

## Design

The Academy should feel like a chess school, library, or university. The faculty should read as mentors with teaching personalities, not as engine difficulty presets.

Each faculty card now supports an expandable native profile using HTML `details` and `summary`. This avoids new JavaScript, avoids modal complexity, and preserves keyboard accessibility.

## Profile Fields

Each profile includes:

- Name
- Avatar placeholder
- Title
- Approximate level
- Specialty
- Description
- Best For
- Training Focus
- Favorite Openings
- Teaching Style
- Quote
- Status

## Faculty Profiles

### Paul

- Title: Friendly Beginner
- Level: approximately 800
- Best for: New players
- Training focus: Rules, piece movement, basic mates
- Favorite openings: Italian Game, London System
- Teaching style: Patient

Quote: "Every master started with the first move."

### Emily

- Title: Club Coach
- Level: approximately 1200
- Best for: Club players
- Training focus: Piece safety, tactics, development
- Favorite openings: Italian, Scotch, Queen's Gambit
- Teaching style: Encouraging

Quote: "Good habits win more games than lucky tactics."

### Sophia

- Title: Strategic Mentor
- Level: approximately 1600
- Best for: 1200-1800
- Training focus: Planning, pawn structure, piece coordination
- Favorite openings: English, Catalan, Queen's Gambit
- Teaching style: Analytical

Quote: "Great chess begins with understanding."

### Morphy

- Title: Attack Instructor
- Level: approximately 2000
- Best for: attacking players
- Training focus: Initiative, development, open games
- Favorite openings: King's Gambit, Evans Gambit
- Teaching style: Aggressive

Quote: "Attack while your opponent is unprepared."

### Capablanca

- Title: Endgame Professor
- Level: approximately 2200
- Best for: technical players
- Training focus: Simplification, technique, king activity, endgames
- Favorite openings: Queen's Gambit, Ruy Lopez
- Teaching style: Minimalist

Quote: "The simplest move is often the strongest."

### Tal

- Title: Tactical Wizard
- Level: approximately 2500
- Best for: creative attackers
- Training focus: Sacrifices, initiative, combinations
- Favorite openings: Sicilian, King's Indian
- Teaching style: Creative

Quote: "There is always another sacrifice."

### CAISSA

- Title: Adaptive Academy
- Level: Variable
- Best for: students with a long-term study path
- Training focus: Adaptive learning
- Favorite openings: Dynamic
- Teaching style: Personalized

Quote: "Every player deserves a unique path."

## Profile Actions

Each profile displays disabled future actions:

- Start Lesson
- Play Training Game
- View Curriculum

Each action is labeled `Coming Soon`.

## Architecture

The implementation remains isolated to the Academy surface:

- `index.html` for profile markup
- `css/academy.css` for profile styling
- no new JavaScript
- no engine integration
- no network calls
- no authentication changes

The native expand/collapse behavior can later be replaced with a shared panel or route if profiles become deep product surfaces.

## Roadmap

### 5.3 - Engine Mapping

Map future faculty identities to safe engine behavior without exposing engines as opponents.

### 5.4 - Learning Paths

Define beginner, club, strategic, attacking, endgame, tactical, and adaptive paths.

### 5.5 - Student Passport

Track learning progress, completed lessons, and skill milestones.

### 5.6 - Coach Conversations

Introduce guided educational conversations after the faculty and curriculum model are stable.

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
