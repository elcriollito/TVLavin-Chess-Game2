# Static HTML and Player Album Release Guard

Status: mandatory release procedure for `caissa-chess.org`.

## Why this guard exists

On 2026-08-23, production served byte-corrupted HTML on multiple rewritten routes. The affected files were syntactically present in Git, but their bytes no longer represented valid HTML. Browsers displayed binary-looking characters and entered Quirks Mode. A normal HTTP 200 check did not detect the incident.

The same release window exposed a separate Player-album failure: a Unicode title was copied into an HTTP response header without RFC 5987 encoding, which could produce an HTTP 500. A successful header-only request also does not prove that the Reader can parse a collection and open a game.

These are release-blocking conditions. Do not deploy around a failed guard.

## Rules that must not be bypassed

1. Never run binary transforms, encoding conversion, bit shifting, XOR, compression, or search-and-replace tools over tracked HTML unless the exact generated diff is reviewed before commit.
2. Never accept a large one-line deletion or a major byte-size change in an HTML file without explaining it in the change review.
3. Player filenames containing non-ASCII characters must use a safe ASCII fallback plus RFC 5987 `filename*=UTF-8''...`. Never place raw Unicode directly in a Node HTTP header.
4. An album is healthy only when the production Reader can locate its allowlisted file, parse a legal game with the vendored production parser, apply the first move, and change the board position.
5. No PGN collection may become a commercial entitlement merely because it is present in this free interim library. The existing commerce hard-disable remains authoritative.

## Required checks before every deploy

Run from a clean worktree based on the intended production commit:

```bash
git status --short
git diff --check
git diff --numstat origin/main...HEAD -- '*.html'
node --test tests/public-html-integrity.test.js
node --test tests/pgn-replayer/player-album-smoke.test.js
node --test tests/pgn-replayer/pgn-page-contract.test.js tests/pgn-replayer/pgnmentor-historical-library.test.js
```

Review every changed HTML file with `git diff --word-diff=plain`. A reviewer must confirm:

- UTF-8 decoding succeeds without replacement characters.
- The file begins with a valid HTML doctype.
- Expected structural elements still exist.
- Byte size and line count are plausible relative to the parent commit.
- No unexpected binary patch or nearly total file replacement appears.

## Player album release gate

The trusted catalog must contain exactly 82 unique internal IDs. For every ID, the automated audit must prove all of the following:

- the allowlisted physical file exists;
- `Event`, `White`, and `Black` headers can be found;
- the same vendored PGN parser and `chess.js` version used by the production Worker can parse a game;
- the opened game contains a main line;
- its first move has valid source and destination squares;
- applying that move changes the FEN.

Do not replace this with `HEAD`, Content-Length, or status-only checks. Those checks are useful transport evidence, but they do not open a game.

For a production spot check, use a large Unicode-named collection such as Svetozar Gligorić. Large albums are parsed completely before the first game appears, so keep the browser open until the success message replaces `Reading PGN locally…`. Record the elapsed time; a temporary loading state alone is not a failure.

## CSP and authenticated Reader check

The Reader needs two narrowly scoped Clerk allowances when a user is signed in:

- `worker-src 'self' blob:` for Clerk's blob Worker;
- `img-src 'self' data: https://img.clerk.com https://images.clerk.dev` for the profile image.

Keep `script-src` free of `unsafe-inline`, `unsafe-eval`, wildcards, and unapproved remote origins. Play retains its stricter route-specific Worker policy.

After deployment, verify the Reader both signed out and signed in. The console must not report CSP blocks for the PGN Worker, Clerk Worker, or Clerk profile image.

## Production verification

For each changed rewritten route:

1. Confirm HTTP 200 and `Content-Type: text/html`.
2. Confirm the response begins with a doctype and contains no binary/null bytes.
3. Open the route in a real browser.
4. Confirm `document.compatMode === 'CSS1Compat'`.
5. Confirm the primary page section is visible and interactive.
6. Check the console for site-origin errors; ignore only positively identified browser-extension noise.

For Player albums, run the 82-case local opening audit and then open at least one small and one large Unicode-named album through the deployed Reader.

## Stop and rollback conditions

Stop promotion or roll back immediately when any of these occurs:

- binary-looking text, Quirks Mode, missing doctype, or unexpected HTML size change;
- any Player album cannot be located or cannot open a legal game;
- the album endpoint returns 5xx;
- a CSP change blocks an application Worker or broadens script execution;
- the active Vercel deployment is not built from the reviewed commit.

Rollback to the last known-good deployment first. Diagnose from a separate clean worktree, preserve the original dirty worktree, and publish a minimal commit with its verification evidence.
