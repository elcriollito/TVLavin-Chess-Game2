# Season 6.4 - CAISSA Academy Academic Offices

## Objective

Season 6.4 adds visual Academic Offices to CAISSA Academy faculty profiles. The goal is to make future mentor conversations feel like visiting a professor's office, not chatting with a generic AI.

This phase is visual only. It does not connect AI, LLMs, chat, backend storage, message sending, or conversation history.

## Office Concept

Each mentor profile now includes an Academic Office panel with:

- Mentor office name
- Availability
- Office hours
- Office status
- Disabled question area
- Suggested popular questions
- Office notes

The office model establishes the future path:

Faculty Profile -> Academic Office -> Future Conversations

## Conversation Philosophy

The Academy should frame future interactions as academic mentoring:

- Students visit a mentor.
- The mentor has office hours.
- Questions are tied to the mentor's specialty.
- The interaction feels guided and educational.

This avoids presenting the feature as a generic chatbot.

## Office Statuses

The current visual statuses are placeholders:

- Available
- Preparing Lessons
- Reviewing Games
- Office Closed

No scheduling, availability logic, or presence system is implemented.

## Popular Questions

Each mentor has suggested questions aligned to their teaching identity. Examples include:

- Alex: positional play, pawn structures, long-term plans
- Capablanca: endgames, king activity, simplification
- Tal: sacrifices, safe attacks, combinations

All suggested questions are static placeholders.

## Future AI Integration

Future AI or LLM work should attach to this office metaphor rather than replacing it. A real implementation should require:

- Authentication context
- Consent and privacy rules
- Conversation persistence decisions
- Mentor-specific prompt boundaries
- Safety controls
- Clear separation between advice and engine analysis

None of that is implemented in Season 6.4.

## Roadmap

- 6.5 Interactive Mentor
- 6.6 Engine Mapping
- 6.7 Adaptive Academy
- 6.8 Office Appointments

## Not Implemented

This phase did not implement:

- AI
- LLMs
- Chat
- Message sending
- Backend storage
- Conversation history
- Appointment booking
- Real availability

## Not Changed

This phase did not modify:

- Gateway
- FICS
- Replay
- PGN
- Authentication
- CAISSA Classic
- Core gameplay logic

## Validation Plan

- `node --check js/academy-section.js`
- `git diff --check`
- Academy smoke test with `/?section=academy`
- Full Production Validation Suite
