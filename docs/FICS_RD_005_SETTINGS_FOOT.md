# FICS-RD-005 Settings, FOOT, and Console

RD-005 reserves the workspace BODY for Tables, Players, Seek, or Game Mode. A
disconnected or failed connection no longer replaces primary content with a
connection explanation. Tables stays selected by default, Seek remains visible
but fails closed through canonical capabilities, and Players remains explicitly
unsupported.

## Settings ownership

`CaissaFICSShell` owns only whether the Settings drawer is open. It reparents the
existing gateway detail subtree and Session / Board subtree, including the
existing Sounds and Test Gateway buttons. It does not clone their IDs, handlers,
or data. The modal drawer is appended outside the inert application background,
contains keyboard focus, closes with Escape, and restores focus to its launcher.
Feature-flag rollback restores each moved node and its original sibling order.

## FOOT and Console

The permanent FOOT retains the existing connection owner, Guest/FICS Account
login, Connect, contextual Disconnect, concise status, and the one existing
Console. The Console is collapsed when the redesign mounts and after a newly
authenticated session. Expanding it reveals the same history and command input;
collapse never replaces either node.

The Console remains one bounded chronological buffer. Raw server text and
command echoes remain available, while canonical client transitions append
human-readable entries with subtle `CAISSA`, `FICS`, `COMMAND`, `GAME`, or
`ERROR` origins. These messages describe state already accepted by the client;
they never acknowledge a seek, game action, or observation beyond actual local
delivery evidence. The collapsed summary is recomputed from the frozen
presentation snapshot. Latency appears only when the canonical measured value
is finite.

## Space and responsive evidence

At 1600x1000 in the same 80-move Game fixture, the RD-004 FOOT measured 848 px
and the RD-005 FOOT measured 102 px, a 746 px (88%) reduction. BODY and notation
each increased from 632/430 px to 683/481 px, a 51 px gain, while the overall
workspace contracted from 1535 px to 840 px. The fixed drawer did not change
board or BODY width and the 390x844 check measured zero horizontal overflow.

The reproducible twelve-state capture and before/after geometry harness is
`scripts/fics-rd005-visual-qa.mjs`; generated evidence remains in the ignored
`test-results/fics-rd005-visual` directory.
