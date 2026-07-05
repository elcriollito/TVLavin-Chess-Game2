# Season 6.3 - CAISSA Academy Certification Program

## Objective

Season 6.3 adds the visual Certification Program structure to CAISSA Academy. The Academy now presents certificates as the future bridge between completed courses and academic degrees.

This phase is visual and academic only. It does not implement real certificates, progress tracking, backend storage, AI, engines, PDF generation, downloads, or email delivery.

## Certification Philosophy

The Academy progression is now:

1. Faculty
2. Course
3. Certificate
4. Academic Degree

Certificates establish the future proof of completion for faculty programs while keeping the current product safe and placeholder-only.

## Certificate Catalog

### Fundamentals Certificate

- Faculty: Faculty of Fundamentals
- Required Courses: Course 101 - Chess Fundamentals, Course 102 - Opening Principles
- Recommended Mentor: Daisy, Mya
- Academic Level: Student
- Status: Coming Soon

### Strategy Certificate

- Faculty: Faculty of Strategy
- Required Courses: Course 201 - Pawn Structures, Course 202 - Planning in Chess
- Recommended Mentor: Alex, Sophia
- Academic Level: Club Scholar
- Status: Coming Soon

### Dynamic Chess Certificate

- Faculty: Faculty of Dynamic Chess
- Required Courses: Course 301 - Attacking the King, Course 302 - Initiative
- Recommended Mentor: Morphy, Tal
- Academic Level: Academy Fellow
- Status: Coming Soon

### Endgame Science Certificate

- Faculty: Faculty of Endgame Science
- Required Courses: Course 401 - Fundamental Endgames, Course 402 - Technical Conversion
- Recommended Mentor: Capablanca
- Academic Level: Academy Fellow
- Status: Coming Soon

### Adaptive Learning Certificate

- Faculty: Faculty of Adaptive Learning
- Required Courses: Course A1 - Personalized Learning
- Recommended Mentor: CAISSA
- Academic Level: CAISSA Master
- Status: Coming Soon

## Certificate Preview

The Academy includes a diploma-style preview with placeholder fields:

- CAISSA Academy
- Certificate of Completion
- Student Name
- Course / Program
- Faculty
- Mentor
- Date
- Status: Preview Only

This preview is not downloadable and does not generate a PDF.

## Student Journey Integration

The Student Journey passport now includes:

- Next Certificate: Fundamentals Certificate
- Certificate Status: Coming Soon

The existing Certificates Earned count remains 0.

## Academic Degrees Integration

Academic degrees now include visual certificate requirements where appropriate:

- Student requires Fundamentals Certificate
- Club Scholar requires Strategy Certificate
- Academy Fellow requires Endgame Science or Dynamic Chess Certificate
- CAISSA Master requires a future Academy capstone certificate

All requirements remain placeholders.

## Future Real Certificate Flow

A future real certificate system should require:

- Authenticated student identity
- Course completion records
- Progress validation
- Certificate issuance records
- Optional PDF generation
- Optional email delivery
- Revocation or correction workflow

None of that is implemented in this phase.

## Not Implemented

This phase did not implement:

- Real certificates
- Real progress
- Backend storage
- AI or LLM logic
- Engines or Stockfish
- PDF generation
- Email sending
- Download actions
- Course completion logic

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
- Course logic
- Progress logic
- Backend

## Validation Plan

- `node --check js/academy-section.js`
- `git diff --check`
- Smoke test `/academy`
- Smoke test `/?section=academy`
- Full Production Validation Suite
