# FICS-RD-006 Strict Workspace Contract

FICS-RD-006 makes the right workspace a literal three-child structure:

1. `header[data-fics-workspace-region="head"][data-fics-region-sizing="intrinsic"]`
2. `section[data-fics-workspace-region="body"][data-fics-region-sizing="flexible"]`
3. `footer[data-fics-workspace-region="foot"][data-fics-region-sizing="intrinsic"]`

The workspace uses `grid-template-rows: auto minmax(0, 1fr) auto`. BODY is the
only flexible vertical track and owns its own overflow. HEAD contains only the
Tables, Players, and Seek tablist. Preserved legacy room and side-panel nodes
remain in the hidden legacy game area; they are no longer descendants of BODY.

## BODY ownership

BODY renders exactly one product projection at a time: Tables, Players, Seek,
or Game Mode. Disconnected Tables shows only `No tables loaded.`. Disconnected
Seek retains the complete Create Table form with submit disabled by the
canonical capability projection. Players has the minimal truthful state
`Player directory unavailable.`. No player protocol, roster, challenge, or
profile behavior was introduced.

The former connection instructions and generic placeholder path were removed
from BODY. Connection availability guidance is written to the existing hybrid
Console through `CaissaFICSClient.announceWorkspaceAvailability(view)`. That
method checks canonical client authentication state and calls the one existing
`logToConsole` writer. It does not mutate connection, session, seek, game, or
message authority.

## FOOT and Settings ownership

FOOT retains the existing connection/login controls and the same Console
section. It does not contain gateway or session diagnostic nodes. The redundant
collapsed Console connection summary was removed, leaving one compact FOOT
state label when it is useful and the Console launcher. Disconnected and error
states use the visible login controls plus Console rather than duplicating a
status explanation.

Settings retains the physically reparented gateway URL/status/latency and
session/board controls. The nodes and their handlers are not cloned. Runtime
feature-flag rollback restores their legacy parents and the original Console
presentation.

## Measured layout

At 1600x1000, using the same local route and fixture for both revisions:

| State | RD-005 BODY | RD-006 BODY | RD-005 FOOT | RD-006 FOOT |
| --- | ---: | ---: | ---: | ---: |
| Disconnected Tables | 606 px | 697 px | 179 px | 88 px |
| 80-move Game Mode | 683 px | 683 px | 102 px | 102 px |

Disconnected BODY gained 91 px and FOOT lost 91 px. Game Mode geometry remains
stable, including its 481 px notation scroller. The 768x1024 tablet and 390x844
mobile checks both measured zero horizontal overflow. Mobile login radios are
16 px controls inside 44 px tap targets, and the Console launcher remains inside
the workspace boundary.

The reproducible capture harness is `scripts/fics-rd006-visual-qa.mjs`. It
captures the requested desktop states plus tablet and mobile workspace views,
loads the RD-005 CSS and shell from Git for same-run comparison, and records
measurements under ignored `test-results/fics-rd006-visual/`.
