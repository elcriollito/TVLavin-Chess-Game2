# ChessBase Interactive Diagrams Worker containment decision

Decision date: 2026-08-15 UTC. Scope: ICD-0.2B.

## Decision

CAISSA accepts one provider-originated construction attempt for `/Common/Chess/Engine/Enginemin.js` per Interactive Diagrams wrapper initialization only when the diagram-specific Content Security Policy blocks it before a network response, body download, operational Worker, or engine message. The pilot does not request or expose an engine feature.

The official ChessBase editorial tutorial [Dynamic diagrams](https://en.chessbase.com/post/dynamic-diagrams-your-new-chess-publishing-tool) documents `data-buttons="0"` and says it disables diagram buttons. Its [Spanish equivalent](https://es.chessbase.com/post/dynamic-diagrams-your-new-chess-publishing-tool) documents the same contract. Chromium, Firefox, and WebKit rendered four configured diagrams with zero toolbar buttons, but CBReplay still attempted to construct `/Common/Chess/Engine/Enginemin.js`. No official setting that prevents this construction attempt was found.

Correct public description: **CAISSA disables diagram controls and blocks the provider's unsolicited engine Worker through the diagram wrapper's CSP.** `data-buttons="0"` does not mean that ChessBase has no engine or that CBReplay never attempts a Worker.

## Security ownership

`integrations/chessbase-interactive-diagrams.html` is a dedicated wrapper. Its source meta policy and its route-specific production header both declare `worker-src 'none'; child-src 'none'`. `child-src` supplies conservative legacy fallback without granting any source. The policy grants no self, Blob, data, ChessBase, or relative-path Worker source. The parent policy and `integrations/chessbase-pgn-replayer.html` remain unchanged.

The wrapper loads only the existing SRI-pinned CBReplay stylesheet, jQuery, and CBReplay script. It contains no authentication, account, analytics, user content, engine asset, engine stub, service worker, or arbitrary URL input. `data-buttons="0"` is assigned to every host before CBReplay initializes; `data-play`, hint, solution, and replay configuration are absent.

## Acceptance limits

For each new wrapper document:

- at most one Worker construction attempt;
- exact path ending `/Common/Chess/Engine/Enginemin.js`;
- an enforced `worker-src` or legacy `child-src` CSP violation;
- zero Worker response, transferred bytes, decoded bytes, messages, visible controls, or repeated attempt;
- visibility hide/restore creates no new attempt;
- Retry destroys the old wrapper and permits at most one new blocked attempt in the new document;
- leaving the route destroys the wrapper and produces no later attempt.

`/Common/Chess/Engine/Enginemin.js` must remain absent from Git, the public route inventory, rewrites, service-worker caches, supply-chain registration, and CSP allowlists. A direct local request must retain not-found behavior; no success stub or application-shell fallback is permitted.

## Monitoring and removal conditions

Cross-browser tests record Worker events, CSP violations, responses, and message activity. The pilot must be removed or redesigned if CBReplay makes more than one attempt per initialization, receives engine response bytes, creates an operational Worker, emits engine messages, retries after visibility changes, produces an error storm, exposes toolbar controls, or cannot remain usable under the blocking policy. Any provider hash change requires the existing SRI review process before release.
