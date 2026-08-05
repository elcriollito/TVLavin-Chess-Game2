# Play v2 Physical Promotion QA

Status: internal QA infrastructure; unavailable unless explicitly enabled

Contract: `PlayV2PhysicalPromotionQAPolicy@1.0.0`

Route: `/play/beta/qa/promotion`

## Purpose and boundary

This harness closes the declared physical-promotion evidence gap without adding a public position editor or a second chess runtime. It is not a product route, must not appear in navigation or public discovery, and makes no public-readiness claim.

The server admits the route only when both `CAISSA_PLAY_V2_BETA_STAGE=internal` and `CAISSA_PLAY_V2_PHYSICAL_QA=promotion` are present in its process environment. Missing, disabled, invite-only, public-beta, or normal production configuration returns the runtime-free unavailable document. Query strings, fragments, route descendants, direct generated-document requests, Web Storage, and History API manipulation cannot grant access.

Closing either environment gate is the operational rollback. No commit reversal is required.

## Authoritative owners

The harness orchestrates, but does not replace, the production Play v2 owners:

- Games creates and resets the real game session.
- `chess.js` loads the allowlisted legal position and remains the move authority.
- the current BoardAdapter supplies orientation and tap-to-move;
- the existing promotion modal and `handlePromotion` complete the move;
- ClockService and GameLifecycle retain clock and lifecycle ownership;
- GameRecord and PostGame retain completion and record ownership.

Opening the harness starts no case and no Worker. A case uses human mode so no engine Worker is required. The harness accepts no user-supplied FEN, PGN, command, credential, or arbitrary position. It uses eight versioned internal fixtures: White and Black promotion to Queen, Rook, Bishop, and Knight.

## Physical procedure

Run on loopback only:

```powershell
$env:CAISSA_PLAY_V2_BETA_STAGE='internal'
$env:CAISSA_PLAY_V2_PHYSICAL_QA='promotion'
node server.js
```

Open the promotion QA route on the loopback-only server. For each listed case, choose **Start case**, use tap-to-move on the displayed source and destination squares, select the required piece in the real promotion modal, and verify the harness result. Choose **Finish in PostGame**, confirm resignation, verify the real PostGame, and proceed to the next case. Repeat relevant cases with the browser viewport at 390×844 and 844×390.

Stop the loopback server and clear both environment variables after the session. Do not expose the route over LAN or a public tunnel.

## Evidence rules

Physical evidence must distinguish modal observation from automated coverage. SAN/PGN, selected piece, orientation, one-board containment, clock, lifecycle, and Worker state are checked per case. A result is not physically accepted until the real modal and tap-to-move interaction are observed on the named device. BLOCKED and NOT EXECUTED results remain visible; automation never converts them into a physical PASS.

## Localhost manual acceptance

The product owner manually accepted the loopback harness on 2026-08-05. This is harness acceptance only and is not physical iPhone evidence.

All eight fixed cases passed: White and Black promotion to Queen, Rook, Bishop, and Knight. The real promotion modal, selected piece and destination, verified result, single-board presentation, White/Black orientation, clean next-case reset, and absence of pre-start auto-play, echo, duplication, overflow, glitches, and errors were observed. Queen and Rook reached the real PostGame after explicit completion; Bishop and Knight reached the expected automatic insufficient-material final state. The 390×844 and 844×390 layouts both passed.
