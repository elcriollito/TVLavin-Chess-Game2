# Human feedback validation

This note records the reproducible checks added after the PR #67 human play session. It does not replace another human feel check on the protected preview.

## Drag boundary measurement

The comparison used Chromium, the same `/online` harness, viewport, pointer path (17 pointer events from `e2` to `e4`) and an intentional 3.5-second move-response delay. A canonical poll returned version 1 while the version-2 move was pending. The delay is a controlled test condition, not a network ping estimate.

| Boundary | Before (`26c8011e`) | Candidate, median of 3 runs |
| --- | ---: | ---: |
| Pointer events / visual writes | 17 / 16 | 17 / 16 |
| Geometry reads in `pointermove` | 0 | 0 |
| Cursor-to-piece lag p50 / p95 | 0.2 / 1.2 ms | 0.2 / 1.2 ms |
| Frame interval p50 / p95 | 16.7 / 16.8 ms | 16.7 / 16.7 ms |
| Pointer-up to destination presentation | 3.9 ms | 3.7 ms |
| Controlled HTTP completion | 3506.9 ms | 3516.6 ms |
| Drag-attributable long tasks | 0 | 0 |
| Old poll visibly restored `e2` before commit | **Yes** | **No** (3/3) |

The shared board already met the Quiet Drag pointer path: original node, exact grab offset, pointer capture, frame-coalesced `translate3d`, one visible piece and no movement-path geometry reads. The online integration defect was the state boundary after release: every snapshot cleared `pendingMove`, so an older canonical poll could restore the pre-move FEN and unlock the board before the move response arrived.

The candidate keeps the optimistic piece presentation while the server remains authoritative. A snapshot at or below the submitted base version cannot clear the pending move or re-enable input. A later canonical version resolves the pending move; a rejection restores the newest known canonical state. Drop projection and its canonical acknowledgement are explicitly non-animated.

HTTP confirmation and opponent delivery remain separate measurements. The local regression controls HTTP timing; opponent WebSocket receipt must be checked on the exact protected preview with the hosted two-account Realtime test.

## UI behavior covered

- Invitation card persists across New Game, Games and Players, keeps one DOM identity for the same invitation ID, and disappears after response, local expiry or invalidation.
- Outgoing invitations show `Waiting for …`; challenge and rematch controls prevent duplicate requests.
- Visible turn prose is removed. `#turn-copy` remains an `aria-live` screen-reader status while the running clock remains the visual signal.
- Games has separate History and Open games views. The latter is an honest unsupported empty state; see [Open games: contract boundary](open-games-scope.md).
- Missing player ratings render as `Casual`, never the literal `null`.
- Custom `Minutes` and `Increment (seconds)` fields share dimensions on desktop and stack with the same dimensions at 340 px.
