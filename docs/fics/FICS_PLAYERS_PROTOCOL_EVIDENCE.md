# FICS Players Protocol Evidence (RD-009)

Date captured: 2026-09-10

Starting checkpoint: `1ac06ca348746a7ca8f827c464a567cd02dfc82e`

Scope: evidence and characterization only; no Players production parser or UI

## Capture method and safety

Four successful, isolated guest sessions connected directly to
`freechess.org:5000`. A fifth guest-authentication attempt timed out before any
command was sent. Commands were allowlisted and serialized one at a time. No
registered credentials, challenges, messages, observations, games, seeks, or
state-changing commands were used.

The repository gateway was not used as the evidence boundary because
`gateway/fics-local-node/fics-gateway.cjs` trims each non-empty line before
emitting a separate WebSocket `raw` message. That is adequate for the current
console but cannot preserve the original TCP chunking or leading/trailing
spacing required by RD-009. Authentication traffic and unrelated remote text
were excluded. Active handles in the committed fixture are deterministic,
length-preserving pseudonyms; server help examples are retained as published
documentation examples.

The sanitized evidence is in
`tests/fixtures/fics/players/rd009-live-sanitized.json`.

## Commands and observed samples

| Command | Retained roster samples | Server-documented meaning | Observed result |
| --- | ---: | --- | --- |
| `who` | 2 | all logged-in users; terse; sorted by Blitz by default | `173 of 173` twice |
| `who f` | 2 | free users, meaning not playing a game | `119 of 173`, then `117 of 173` |
| `who a` | 2 | available users, meaning open and free | `82 of 173` twice |
| `who v` | 1 | all users in verbose, one-row-per-user format | `175 Players Displayed` |
| `who av` | 1 | available users in verbose format | `82 Players Displayed` |
| `who U` | 1 | unregistered users | `57 of 175` |
| `who R` | 1 | registered users | `118 of 175` |

At the shared 175-user snapshot, `who U` plus `who R` equals the `who v`
total. Counts changed naturally between repeated `who f` samples. No user was
manipulated to produce variation.

## Recommended canonical Players command

Use **`who v`** for the initial read-only Players directory. It is explicitly
documented by FICS, returns all logged-in users, has one player per framed row,
and includes the fields needed for a useful directory: handle, three ratings,
on-time, idle time, playing game number, open/unrated-only/unregistered flags,
and observing state. `who` is valid and more compact, but its three-column
terse layout supplies only the selected rating and a compressed status marker.
`who a` is not a general directory because it deliberately excludes unavailable
and playing users.

RD-010 should not infer untruncated annotations from the verbose User column.
One live row ended with a clipped multi-code suffix at the fixed column width.
The base handle remained visible, but the final annotation delimiter did not.
Treat suffixes as bounded display evidence and normalize only complete,
documented codes.

## Verified response grammar

### Terse `who`

- No header was observed.
- Each entry is `<rating><status><handle><zero-or-more handle codes>`.
- Up to three fixed-width entries appear on a line.
- The selected rating is Blitz unless another order/rating flag is supplied.
- The terminal line is
  `<displayed> players displayed (of <total>). (*) indicates system administrator.`
- The response then reaches `fics%`.

### Verbose `who v`

- Starts with a `+---...---+` border and a header containing User, Standard,
  Blitz, Lightning, On for, and Idle.
- Each user occupies one bordered row.
- The left field can contain a game number and the documented `X`, `u`, `U`,
  and `o` flags before the handle.
- Ends with `<displayed> Players Displayed`, a closing border, then `fics%`.

The TCP stream used LF followed by CR between displayed lines. Responses often
started with that line-break sequence. No query command echo was observed.

## Response boundaries and correlation

`fics%` is not sufficient by itself: three unsolicited post-authentication
administrative/welcome notices were observed before the first query, and each
was followed by a prompt. No unrelated text was observed inside the captured
command responses, but the protocol does not identify prompts by command.

The safe RD-010 strategy is:

1. allow only one in-flight Players query;
2. bind it to the authenticated session generation and a client request token;
3. select the expected grammar from the exact typed command;
4. recognize the verbose header/border (or a valid terse entry/zero-count
   footer) as response start;
5. require the documented count footer and then `fics%` as completion;
6. classify non-matching asynchronous lines separately without treating their
   prompts as completion;
7. reject overlap, session-generation changes, malformed/truncated responses,
   and unexpected response families.

A timeout may terminate a failed request, but must never be the successful
completion signal.

## Transport/frame observations

FICS output crossed TCP chunk boundaries. The two full terse samples arrived
as `1420 + 2638` bytes and `2840 + 1218` bytes. `who a` arrived as two chunks;
`who v` arrived as `1420 + 12780 + 468` bytes; `who av` arrived as three chunks.
Therefore parsing must be incremental and cannot assume one response, row, or
footer per TCP/WebSocket frame. The current local gateway further transforms
TCP input into trimmed line-level WebSocket messages, so browser frame shape is
gateway shape, not FICS response shape.

## Field and marker classification

| Field or marker | Classification | Evidence |
| --- | --- | --- |
| username/handle | VERIFIED | help grammar and live terse/verbose rows |
| default Blitz rating | VERIFIED | `help who`; live numeric values |
| Standard/Blitz/Lightning ratings | VERIFIED | verbose help/header and live rows |
| `++++` | VERIFIED | unregistered/no rating; help plus live `who U` |
| `----` | VERIFIED | registered but unrated for that type; help plus live rows |
| `P`, `E` rating suffixes | VERIFIED BY SERVER DOCUMENTATION; NOT OBSERVED LIVE | `help who`, `help v_provshow` |
| blank terse status | VERIFIED | not busy; help and live rows |
| `^` | VERIFIED | involved in a game; help and live rows |
| `~` | VERIFIED BY SERVER DOCUMENTATION; NOT OBSERVED LIVE | running a simul |
| `:` | VERIFIED | not open; help and live rows |
| `#` | VERIFIED | examining; help and live rows |
| `.` | VERIFIED, WITH AMBIGUITY | inactive at least five minutes **or** busy; both meanings share one marker |
| `&` | VERIFIED | involved in a tournament; help and live row |
| verbose game number | VERIFIED | help and live rows |
| verbose `X` | VERIFIED | not open; help and live rows |
| verbose `u` | VERIFIED | open for unrated games only; help and live rows |
| verbose `U` | VERIFIED | unregistered; help and live rows |
| verbose `o` | VERIFIED | observing; help and live rows |
| On for / Idle | VERIFIED | help and live numeric/blank values |
| `*`, `C`, `U`, `SR`, `TD` codes | VERIFIED AND OBSERVED | server help and live samples |
| `B`, `T`, `CA`, `TM`, `FM`, `IM`, `GM`, `WIM`, `WGM` | VERIFIED BY SERVER DOCUMENTATION; NOT OBSERVED LIVE | complete `help who` pages |
| clipped multi-code suffix | OBSERVED; COMPLETE FINAL CODE UNKNOWN | one verbose row hit the fixed User-column width |

No unexplained status character appeared in the retained live samples. The
`.` marker must remain semantically ambiguous because the server explicitly
assigns it two meanings.

## Paging, truncation, and remaining limits

Server help documents explicit segmentation with `who #i#j` and shortcuts for
thirds. The live `who` and `who v` responses returned all 173/175 users without
automatic paging. `next` was required only for the help pager. No maximum
population, server-side hard truncation threshold, or behavior under concurrent
directory changes was established. The footer's displayed/total counts must be
retained and compared; a mismatch is evidence of filtering or segmentation,
not automatically transport truncation.

## RD-010 readiness

Evidence is sufficient for a bounded, read-only RD-010 directory based on
serialized `who v`, incremental buffering, footer-plus-prompt completion, and
truthful unknown handling. It is not sufficient for overlapping refreshes,
lossless interpretation of clipped annotation suffixes, or claims about
untested extreme directory sizes. Those paths must fail closed or remain
uninterpreted.

Players remains `Player directory unavailable.` until RD-010 is explicitly
approved.
