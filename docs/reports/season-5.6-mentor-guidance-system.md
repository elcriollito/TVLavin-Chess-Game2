# Season 5.6 - CAISSA Academy Mentor Guidance System

## Objective

Season 5.6 introduces the first visible mentor recommendation layer for CAISSA Academy. The goal is to make the Academy feel guided: students see which mentors fit a learning goal instead of only browsing a faculty catalog.

This phase is visual and rule-based only. It does not use AI, LLMs, engines, Stockfish, backend storage, analytics, progress tracking, or machine learning.

## Rule System

The Mentor Guidance System uses transparent static rules:

- Chess Fundamentals -> Daisy, Mya
- Openings -> Mya, Alex
- Positional Chess -> Alex, Sophia
- Calculation -> Sophia, Morphy
- Attacking Chess -> Morphy, Tal
- Endgames -> Capablanca, Alex
- Tournament Preparation -> Capablanca, Tal
- Adaptive -> CAISSA

The visible panel supports up to three recommendation roles:

- Primary Mentor
- Secondary Mentor
- Alternative Mentor

For Season 5.6, the featured visual recommendation is Positional Chess with Alex, Sophia, and CAISSA.

## Educational Philosophy

The recommendation experience is designed like academic advising, not a chatbot. The student sees the reason behind each recommendation in plain language.

The guidance model reinforces that faculty are mentors with teaching strengths:

- Daisy and Mya support fundamentals.
- Alex and Sophia support strategic growth.
- Morphy and Tal support calculation and attacking play.
- Capablanca supports endgame technique and tournament preparation.
- CAISSA is reserved for future adaptive guidance.

## Path Integration

Learning Path cards now use the explicit label "Recommended Faculty" so each path visibly connects to the faculty catalog. The guidance map reinforces the same relationships in a compact rule table.

## Future AI Integration

Future AI or adaptive systems may use the same conceptual interface, but they should remain explainable. Any future recommendation engine should preserve:

- Clear reasons
- Human-readable mentor roles
- Student control
- No hidden or opaque scoring in the UI

Season 5.6 deliberately avoids implementing that logic.

## Roadmap

- 5.7 Coach Conversations
- 5.8 Engine Mapping
- 5.9 Certificates
- 6.0 Adaptive Academy

## Not Changed

This phase did not modify:

- Gateway
- FICS
- Replay
- PGN
- Authentication
- CAISSA Classic
- Spectator TV
- Engines or Stockfish
- Backend storage
- Real progress logic

## Validation Plan

- `node --check js/academy-section.js`
- `git diff --check`
- Academy smoke test with `/?section=academy`
- Full Production Validation Suite
