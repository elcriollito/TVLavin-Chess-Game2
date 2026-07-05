# Season 5.4 - CAISSA Academy Student Journey

## Objective

Season 5.4 adds the visual student experience for CAISSA Academy.

This phase does not implement real progress, backend storage, certificates, statistics, AI, engines, or educational logic. It presents the future student journey as a safe, static Academy surface.

## Vision

CAISSA Academy should feel like a chess school, not a list of bots. The student should be able to imagine a personal path through mentors, lessons, certificates, and achievements.

The Student Journey panel introduces a passport-style experience that frames Academy as a long-term learning institution.

## Architecture

The implementation remains isolated to the Academy UI:

- `index.html` for static Student Journey markup
- `css/academy.css` for isolated Academy presentation
- no new JavaScript
- no backend calls
- no localStorage/sessionStorage
- no authentication dependency
- no progress persistence

All values are placeholders until future phases introduce real data.

## Student Passport

The passport preview displays:

- Student Name
- Current User
- avatar placeholder
- Academy Level
- Current Mentor
- Current Goal
- Enrollment Date
- Status

Current placeholder values:

- Academy Level: Novice
- Current Mentor: No mentor selected
- Current Goal: Improve Tactical Vision
- Enrollment Date: Not enrolled yet
- Status: Academy Preview

## Academy Levels

The visual level track includes:

- Novice
- Student
- Club Player
- Advanced Student
- Expert Student
- Master Candidate
- Academy Master

Only `Novice` is visually active as a placeholder.

## Progress Preview

The progress section displays five placeholder counters:

- Lessons Completed: 0
- Courses Started: 0
- Training Games: 0
- Certificates Earned: 0
- Achievements: 0

No real progress is stored.

## Academy Timeline

The timeline preview includes:

- Joined CAISSA Academy
- Choose Your First Mentor
- Complete First Lesson
- Earn First Certificate
- Graduate Beginner Course

All items are marked `Coming Soon`.

## Certificates

The certificates panel shows:

- `No certificates earned yet.`
- a visual certificate preview marked `Coming Soon`

No certificate generation, storage, or issuance exists in this phase.

## Achievements

The achievements placeholders include:

- First Lesson
- First Victory
- Opening Student
- Endgame Explorer
- Tactical Mind

All are locked placeholders.

## Future Goals

The Recommended Next Step panel currently shows:

- Choose your first mentor
- Learning never ends.
- Coming Soon

## Roadmap

### 5.5 - Learning Paths

Define structured study tracks that connect mentors, curriculum modules, and student goals.

### 5.6 - Engine Mapping

Map future teaching behavior to engine support without exposing engines as simple opponents.

### 5.7 - Coach Conversations

Introduce educational dialogue once faculty, curriculum, and journey models are stable.

### 5.8 - Certificates

Add real certificate generation, progress requirements, and certificate display rules.

### 5.9 - Adaptive Training

Use student progress and game history to recommend personalized next steps.

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
- Faculty Profile behavior
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
