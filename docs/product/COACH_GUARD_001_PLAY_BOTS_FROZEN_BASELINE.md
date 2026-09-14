# COACH-GUARD-001: Play Game and Play Bots frozen mobile baseline

Status: established against live production on 2026-09-13.

Source of truth:

- origin/main: `1ec19ae9abcb3d5afee9c446e6eaaf871c895ab1`
- production deployment: `dpl_3jwY61V36cbACoJVauhYrt5rHG2G`
- production origin: `https://www.caissa-chess.org`

The executable Chromium and iPhone-equivalent WebKit geometry contract is stored in
`tests/browser/fixtures/play-bots-frozen-mobile-baseline.js` and enforced by
`tests/browser/play-bots-frozen-mobile-baseline.spec.js` at 390x844, 430x932,
844x390, and 932x430.

## Frozen Play Game ownership

The single board remains in `.caissa-simplified-shell__board-stage`. The mode
tabs remain between the board stage and the Games panel in portrait and at the
top of the context column in landscape. The Games panel retains its own ordered
HEAD, BODY, and FOOT. The setup disclosure owns the Welcome card, time-control
grid, Play As row, opponent-strength controls, and status. The Games FOOT owns
the primary Play action. The one floating Menu owner stays present and hidden
during setup.

## Frozen Play Bots ownership

The same single board owner is retained. The Bots panel retains its ordered
HEAD, BODY, and FOOT. The HEAD owns selected-bot identity; BODY owns category
tabs, bot cards, Time Control, and Play As; FOOT owns status and the primary
Play action. The existing review-navigation owner is not cloned or moved by
setup, and the one floating Menu owner stays present and hidden during setup.

## Coach isolation rule

Coach changes must be expressed through Coach mode predicates, Coach state
classes, Coach data attributes, or Coach-owned files. Do not change generic
mobile geometry, Games/Bots panel owners, Play/Bots Play As rules, shared board
placement, or Play/Bots review-navigation destinations. Shared shell edits are
permitted only when the Play and Bots frozen-baseline test remains green.

Protected direct owners:

- `js/play/games-panel.js`
- `js/play/bots-panel.js`
- Play/Bots sections of `css/play-simplified-shell.css`
- Play/Bots branches of `js/play/simplified-play-shell.js`
- `js/play/bots/bots-guided-review-presentation.js`
