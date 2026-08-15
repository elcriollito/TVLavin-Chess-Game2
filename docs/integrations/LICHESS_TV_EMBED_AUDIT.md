# Lichess TV official embed and large-screen integration audit

**Audit:** LTV-0.1

**Observed:** 2026-08-15 02:57 EDT / 06:57 UTC

**Verdict:** **CONDITIONAL GO** for one official, automatic Top Rated iframe. Do not build a selector, API client, proxy, scraper, player, or CAISSA-owned broadcast system.

## 1. Executive verdict

Lichess officially documents an embeddable Lichess TV iframe. With no channel path, it automatically displays the Top Rated game selected by Lichess. It is useful at 320 px mobile width, scales sharply to a large monitor/TV presentation using ordinary container dimensions, needs no script or data connection in the CAISSA parent, and can run with the bounded sandbox `allow-scripts allow-same-origin`.

The result is conditional because CAISSA cannot inspect provider readiness, game availability, clock state, or game changes across the origin boundary. `iframe.onload` proves only that a document loaded; even an invalid channel's Lichess 404 document produces a completed iframe navigation. LTV-0.2 must therefore use truthful parent-owned loading/timeout/fallback language, never claim that a game is ready, and retain a visible official Lichess link.

The first version should expose **Top Rated only**. A local channel selector adds state, URL validation, accessibility, failure, and test surface without improving the core always-available proposition. The official link lets users reach Lichess's own channel selection.

## 2. Preflight and protected state

Preflight matched the requested baseline exactly:

- branch: `main`;
- HEAD and `origin/main`: `3bbe07766041b81c2a59fc3e8939ad2a83f1d236`;
- divergence: `0 0`;
- staged files and pending commits: none.

The pre-existing user-owned `package.json` FICS-lab scripts, `tools/fics-lab/`, brand-navigation browser-harness correction, both uncommitted Firefox diagnostic reports, and ignored FFX evidence were identified and preserved. No Playwright version, timeout, retry, browser revision, product/runtime file, public route, navigation contract, CSP, sitemap, inventory, dependency, or generated public artifact was changed.

## 3. Official evidence and iframe contract

The authoritative source is the official Lichess [Developers page, “Embed Lichess TV in your site”](https://lichess.org/developers#embed-tv). It supplied this contract on the observation date:

```html
<iframe
  src="https://lichess.org/tv/frame?theme=brown&bg=dark"
  style="width: 400px; aspect-ratio: 10/11;"
  allowtransparency="true"
  frameborder="0">
</iframe>
```

For a channel, the official example is:

```text
https://lichess.org/tv/rapid/frame?theme=brown&bg=dark
```

The no-channel URL returned HTTP 200 without redirect. The full [Lichess TV page](https://lichess.org/tv) returned HTTP 200 but sends `X-Frame-Options: DENY`; it is not the embed target. The `/tv/frame` response did not send that denial header and rendered successfully cross-origin. The documentation itself is the authorization to embed; no account or additional authorization is described.

Lichess explicitly states that omitting the channel shows the **top rated game**. This selection is automatic and provider-owned; CAISSA must not promise a particular rating, player, clock, variant, or uninterrupted availability.

### Documented parameters

| Input | Official values |
| --- | --- |
| `theme` | `blue`, `brown`, `green`, `ic`, `purple` |
| `pieceSet` | `cburnett`, `merida`, `alpha`, `pirouetti`, `chessnut`, `chess7`, `reillycraig`, `companion`, `riohacha`, `kosal`, `leipzig`, `fantasy`, `spatial`, `celtic`, `california`, `caliente`, `pixel`, `firi`, `rhosgfx`, `maestro`, `fresca`, `cardinal`, `gioco`, `tatiana`, `staunty`, `cooke`, `monarchy`, `papercut`, `governor`, `dubrovny`, `shahi-ivory-brown`, `icpieces`, `mpchess`, `kiwen-suwi`, `totoy`, `horsey`, `anarcandy`, `xkcd`, `shapes`, `letter`, `disguised` |
| `bg` | `light`, `dark`, `system` |
| channel | a path key corresponding to a channel exposed by the official `/tv` page |

The observed official channel keys were `best`, `bullet`, `blitz`, `rapid`, `classical`, `chess960`, `kingOfTheHill`, `threeCheck`, `antichess`, `atomic`, `horde`, `racingKings`, `ultraBullet`, `bot`, `computer`, and `crazyhouse`. These are observations of the official channel page, not a CAISSA-owned permanent registry. LTV-0.2 should not encode them because the first release has no selector.

No autoplay, sound, board orientation, coordinates, control, or fullscreen iframe parameter is documented. No minimum dimension is stated beyond the official 400 px example and `10/11` aspect ratio. Unknown query values returned a rendered HTTP 200 frame in the bounded observation, apparently falling back, but that behavior is undocumented and must not become a contract. `/tv/not-a-channel/frame` returned a Lichess 404 page and no board. `/tv/rapid/frame` returned HTTP 200 and a Rapid game.

## 4. Product recommendation

Ship one automatic Top Rated presentation in LTV-0.2:

- fixed allowlisted frame URL: `https://lichess.org/tv/frame?theme=brown&bg=dark`;
- no local channel selector or URL configuration;
- one parent-owned “Open Lichess TV on lichess.org” link;
- no API, polling, WebSocket, postMessage bridge, account, proxy, or provider script in the CAISSA document.

This is the least-maintenance experience and answers the product requirement directly. A later channel selector should require separate evidence of user value and a literal allowlist; it is not necessary for launch.

## 5. Proposed CAISSA placement

- route: `/watch/lichess-tv`;
- label: `Lichess TV`;
- category: `Analyze & Watch`;
- position: immediately after `Spectator TV` and before `Live Blitz`.

Proposed sequence:

1. Insights
2. Analyze
3. Spectator TV
4. Lichess TV
5. Live Blitz
6. Live Tournaments
7. Game Replayer
8. Arena

This keeps CAISSA's native spectator surface first, then the automatic external live channel, followed by the existing ChessBase watch/replay gateways. The current canonical owner is `js/caissa-primary-navigation.js`, contract `CaissaGlobalNavigationOrderPolicy@1.8.0`. LTV-0.1 did not change it. LTV-0.2 must advance and reconcile that contract through its canonical generators and focused tests.

## 6. Responsive and large-screen measurements

The temporary shell used a normal responsive container capped at 900 px and the official `10/11` iframe ratio. It did not transform-scale or inject iframe CSS.

| Viewport | iframe | visible board | Parent horizontal overflow | Internal overflow | Observation |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | 900×990 | 888×888 | none | none | Excellent distance readability; page scrolls vertically because the test cap ignores viewport height |
| 1440×1000 | 900×990 | 888×888 | none | none | Excellent board/player/clock legibility; vertical page scroll |
| 1024×768 | 900×990 | 888×888 | none | none | Too tall for the viewport; requires a height-aware width cap |
| 768×1024 | 707×777 | 696×696 | none | none | Clear tablet layout; no document vertical scroll in the minimal shell |
| 390×844 | 359×395 | 344×344 | none | none | Names, ratings, clocks, and board remain legible |
| 320×700 | 294×324 | 272×272 | none | none | Usable lower bound, though player metadata is necessarily compact |

The frame preserved pointer geometry and square alignment at every size inspected. It showed player names, ratings, clocks, last-move highlighting, and the board without clipping. The frame contained no visible buttons; its single observed link wrapped the game information and targeted the official Lichess TV page in a new browsing context. No piece movement, game action, login, chat, or competitive interaction was performed.

A large-screen presentation is viable using only normal sizing. LTV-0.2 should cap width by both available inline space and available viewport height, for example the conceptual relationship `min(100%, (100dvh - page chrome) × 10 / 11, large-screen cap)`. Exact tokens must follow the page shell. A roughly 700–850 px board is preferable on 1080p because it leaves room for CAISSA heading, attribution, fallback, and navigation without forcing a scroll. Do not use CSS transforms. This evidence does not establish remote-control navigation, smart-TV browser support, kiosk mode, or fullscreen.

## 7. Security, CSP, privacy, and sandbox

### Parent policy

The only new parent CSP permission required is the exact origin in `frame-src`:

```text
frame-src ... https://lichess.org;
```

Do not add wildcards or add Lichess for this feature to `script-src`, `worker-src`, or `connect-src`. The current global policy already mentions `https://lichess.org` in `connect-src` for unrelated existing functionality; LTV must not broaden or depend on that permission. Assets observed inside the isolated provider frame came from `https://lichess.org` and `https://lichess1.org`, including a same-origin Lichess feed request. Nested-frame resources are governed by Lichess's document, not by the CAISSA parent's resource directives, so `lichess1.org` must not be added to CAISSA CSP.

### Minimum compatible sandbox

Recommended:

```html
sandbox="allow-scripts allow-same-origin"
referrerpolicy="no-referrer"
```

The empty sandbox displayed the server-rendered snapshot but blocked scripts. `allow-scripts` without `allow-same-origin` also failed to issue the live feed request in the observation. Only `allow-scripts allow-same-origin` produced the provider feed request and changing clocks. `allow-popups` is not essential because CAISSA owns a separate official fallback link; omitting it contains the frame's `_blank` link. Forms, top navigation, downloads, clipboard, autoplay, and fullscreen are unnecessary. No `allow` permissions attribute is required.

The combination of scripts and same-origin is necessary for this provider functionality, but the frame remains cross-origin from CAISSA. LTV-0.2 must keep a literal `https://lichess.org/tv/frame?...` source and never accept arbitrary URLs or same-origin CAISSA content in this sandbox.

With `referrerpolicy="no-referrer"`, the observed frame navigation sent no `Referer`. In a fresh isolated browser context, the audit observed no Lichess cookies and no local/session-storage keys after the frame loaded. No permission prompt was observed. These are point-in-time observations, not a guarantee that provider privacy behavior will never change. CAISSA must not pass authentication, account, billing, Premium, analytics, local-storage, or personal state into the frame and must not create a postMessage bridge.

## 8. Truthful loading and failure model

CAISSA can own only parent-observable states:

- **loading:** iframe created and awaiting its load deadline;
- **document loaded:** `load` fired, phrased as “Lichess TV frame loaded,” not “game ready”;
- **timeout:** no load event by a bounded deadline; retain the iframe or replace it according to an explicit controller rule and show fallback;
- **blocked/unavailable:** browser/CSP/network failure inferred by timeout or an explicit local test path, never by reading provider DOM;
- **retrying:** dispose the one old iframe, its listeners, and its timer, then create exactly one new iframe;
- **official fallback:** always-visible link to `https://lichess.org/tv`.

Cross-origin isolation prevents CAISSA from truthfully distinguishing an available game, a static initial snapshot, provider 404, provider error UI, game transition, or content-level outage. An iframe `load` fires for an HTTP error document as well as a game document. There should be no invented “ready” protocol, polling, hidden health request, or provider DOM access.

Bounded failure observations established that an unknown channel returns a 404 document, blocked scripts leave a non-live snapshot, no-referrer remains compatible, and the valid Rapid channel works. LTV-0.2 tests should simulate offline, aborted frame, delayed frame, HTTP error, CSP denial, and retry locally through request interception rather than repeatedly loading Lichess.

## 9. Attribution and copy

Recommended visible copy:

> Watch the Top Rated game selected by Lichess. Lichess operates the service and controls the players, ratings, clocks, game selection, and availability; CAISSA Chess provides an independent gateway.

Official link: **Open Lichess TV on lichess.org**

Fallback: **Lichess TV is not available here right now. Open the official Lichess TV page.**

Do not call the service “CAISSA TV,” say CAISSA transmits the game, conceal Lichess branding, or promise a specific rating or continuous availability.

## 10. SEO and accessibility proposal

- H1: `Watch High-Rated Chess Live`
- SEO title: `Watch Lichess TV Live | CAISSA Chess`
- meta description: `Watch the Top Rated live chess game selected by Lichess through an independent gateway on CAISSA Chess.`
- introduction: `Follow the Top Rated game selected by Lichess in a responsive live board, with a direct link to the official service.`
- iframe title: `Lichess TV Top Rated live chess game`
- official link accessible name: `Open Lichess TV on lichess.org`
- retry button: `Retry Lichess TV frame`
- status container: visible text with `role="status"` and non-interruptive `aria-live="polite"` for loading/document-loaded changes;
- error container: visible text with `role="alert"` only after timeout/blocking is established locally.

Use one H1, normal DOM text, a unique title/description, self-referencing canonical, and indexable content. Do not add meta keywords, hidden SEO text, keyword stuffing, ownership claims, competitor keywords, or `noindex`.

## 11. Isolation requirements

Focused static and browser tests must prove that `lichess.org/tv/frame`, Lichess TV controllers, and LTV-specific DOM are absent from `/play`, `/yahoo-classic`, `/fics`, Endgame Trainer, Playchess, Fritz, ChessBase Tactics, Live Blitz, Game Replayer, Live Tournaments, Interactive Diagrams, and shared application entrypoints. The only permitted public iframe occurrence is the literal new route. Shared navigation may contain the internal CAISSA route after contract adoption, never the provider URL.

Tests must also prove one iframe, exact origin/path/query, sandbox/referrer policy, no parent Lichess scripts, no LTV parent polling/connect code, truthful state copy, one bounded retry lifecycle, visible attribution/fallback, responsive containment at all six viewports, CSP exactness, canonical/SEO/accessibility, route occurrence once in sitemap/inventory, and deterministic generator output.

## 12. Known limitations and LTV-0.2 gates

Known limitations:

- parent cannot verify a live game or interpret provider errors;
- provider content, channel inventory, selection, ratings, clocks, and availability can change independently;
- live updates require both `allow-scripts` and `allow-same-origin`;
- the iframe's internal official link is intentionally popup-contained unless the sandbox is broadened (not recommended);
- 320 px works but is visually compact;
- large-screen evidence covers normal desktop rendering, not TV remotes, fullscreen, or every smart-TV engine;
- invalid query fallback is undocumented and must not be relied upon;
- provider cookies/storage were absent in this isolated observation but require re-verification at release acceptance.

LTV-0.2 gates:

1. create only `/watch/lichess-tv` using the existing credited gateway and shared-sidebar patterns;
2. use one literal Top Rated URL and no selector/configuration surface;
3. add only exact `https://lichess.org` to `frame-src`, with no LTV-driven parent script/connect/worker expansion;
4. use `sandbox="allow-scripts allow-same-origin"`, `referrerpolicy="no-referrer"`, and no feature permissions;
5. implement truthful load/timeout/retry ownership with one iframe/listener/timer lifecycle;
6. preserve visible attribution and an always-available official link outside the sandbox;
7. adopt the navigation destination and contract through canonical owners/generators;
8. prove responsive and height-aware sizing at all audited viewports without transforms or overflow;
9. pass isolation, CSP, security, privacy, SEO, accessibility, public-release, supply-chain, and deterministic-output tests;
10. re-observe the official documentation, exact frame response, channel-free Top Rated behavior, storage, and sandbox compatibility immediately before release.

## 13. Broadcast boundary

Lichess TV is an automatic or channel-specific live-game surface. Lichess Broadcast embeds are event/round-specific and require separate editorial, availability, and time-state decisions. Broadcast configuration is explicitly deferred to **LBC-0.1 — Lichess Broadcast Embed Audit**. No broadcast endpoint, event selection, round identifier, or UTC state belongs in LTV-0.1 or LTV-0.2.

## 14. Files changed, tests, and Git state

The only intended repository change is this report: `docs/integrations/LICHESS_TV_EMBED_AUDIT.md`. Temporary scripts, screenshots, and JSON measurements were created only under `C:\Temp` and are not repository artifacts.

Research/tests performed:

- official Developers, `/tv`, default frame, Rapid frame, invalid-query, and invalid-channel HTTP inspection;
- official channel-key inventory observation;
- six-viewport Chromium measurement and screenshots;
- restrictive sandbox matrix and live-update/feed comparison;
- referrer, request origin, cookie, local storage, session storage, iframe navigation, controls, link, overflow, and response observation;
- repository navigation/CSP/gateway ownership inspection;
- focused repository integrity, navigation, security, supply-chain, public-release, credential-shape, and public-resource-isolation checks recorded at completion.

No external account, login, chat, challenge, game, move, provider state mutation, push, deployment, tag, or dependency change was made.

**LTV-0.1 COMPLETE — LICHESS TV CONDITIONAL GO**
