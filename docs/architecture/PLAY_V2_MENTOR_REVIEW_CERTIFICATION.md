# Play v2 Optional Mentor Review Certification

Season 11.6.2 adds an optional, secondary `Review with Mentor` action after a finalized game. `PlayV2MentorReviewBoundary@1.0.0` remains QA-only and `publicReady: false`.

## Current Mentor audit and isolation

The existing `mentor-foundation`, `mentor-analysis`, `mentor-critical-moments`, `mentor-guided-replay`, `mentor-knowledge`, and `mentor-summary` groups remain prohibited. They own or depend on educational Mentor, Academy/Knowledge, Guided Replay, Training Memory/Mastery, or recommendations. Analyze remains external and independently owned. The dependency-free `native-mentor-review` group reuses only finalized GameRecord validation, local PGN/SAN parsing through Chess, and the provider-neutral board adapter.

## Handoff, workspace, and analysis

The session-scoped, 15-minute, 128-bit opaque token never enters the URL. The handoff accepts one completed immutable GameRecord, rejects missing, malformed, expired, active, and duplicate inputs, preserves `recordId`, and is consumed on exit. It creates no history, identity bridge, upload, analytics, Memory, or Mastery record.

The separate workspace owns one noninteractive review board, completed move list, First/Previous/Next/Last controls, move selection, neutral critical markers, concise status, and Back to PostGame. It owns no clock, opponent, Worker, engine endpoint, or Play lifecycle. Local deterministic analysis has one owner, one reviewed position at a time, a declared 1000 ms bound, generation-based stale rejection, cancellation on navigation and exit, four finite templates, and at most five critical markers.

Critical moments are deterministically limited to completed moves containing a capture or check. Labels remain neutral; no Great, Brilliant, Best, or Excellent classification exists. Explanations identify `CAISSA automated local analysis` and make no human, learning, mastery, or recommendation claim.

## Human-review packet

Pending human review: `Review with Mentor`; the automated-review disclosure; initial-position, material-change, king-safety, and position-change explanations; move-count announcements; bounded failure text; and `Back to PostGame`. No named reviewer has approved these strings. Physical-device and named-screen-reader review are also pending.

## Failure, accessibility, and privacy evidence

Automated coverage includes missing/incomplete/malformed records, expired and duplicate handoffs, session capacity failure, stale analysis, rapid navigation, Back, browser Back, refresh without a session, and board/navigation bounds. Parser and board failures return bounded reason codes and consume the session. No external engine is required; failures never load educational fallback.

The workspace provides a title, disclosure, labeled board and move list, keyboard-operable 44 px controls, current state, polite announcements, focus transfer, forced colors, reduced motion, and 320/768/1440 px reflow. Chromium automation is complete; WebKit automation, physical devices, zoom at physical rendering, and named screen readers remain gates.

No FICS, external analysis, remote upload, identity access, cookies, analytics transport, or persistent review history was added. Locally accepted for QA-only use after the recorded test suite passes; not public-ready and standalone educational Mentor remains unchanged.
