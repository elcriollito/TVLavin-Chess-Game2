# Play v2 iPad P1 remediation and Analyze diagnostic

Status: local implementation; physical retest required

Diagnostic contract: `PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.0.0`

## Local manual acceptance

The product owner accepted the localhost implementation for initial Black plus two Rematches, White, Random, explicit Flip, physical Player/CAISSA labels, clock ownership, Coach-to-Games/Bots isolation, closed initial diagnostic state, launcher/focus/Escape/Close/Start lifecycle, non-obstructive presentation, complete Analyze capture, `Surface: Analyze`, empty `missingRequiredEvents`, Copy/Download/Clear, one visible board, and zero overflow.

This is local manual acceptance only and is not physical iPad evidence. `IPAD-11.8.2-001` and `IPAD-11.8.2-003` require physical retest. `IPAD-11.8.2-002` remains unresolved; the diagnostic is ready to capture its physical cause. The iPad is not certified.

## Absolute orientation ownership

The resolved color of the current game session is the sole initial orientation input. `BoardAdapter.setOrientation()` applies `white` or `black` absolutely when a session starts. The physical bottom edge follows the effective board orientation and owns the matching semantic color label and clock; the opposite semantic pair occupies the top edge. Relative `flip()` remains available only for an explicit user action, swaps that physical presentation, and does not change White/Black identity or initialize a session. Requested and resolved color, labels, clocks, coordinates, tap-to-move, Rematch, New Game, Random, and mode transitions must remain aligned with those owners.

## Coach presentation isolation

When the shell leaves Coach, the Coach panel owner resets its assistance presentation and the shell clears the shared active-game live region before rendering Games or Bots. Coach controls are subsequently hidden by composition ownership. Configuration remains governed by the native Coach contract; no educational product surface is admitted.

## Gated physical Analyze diagnostic

Route: `/play/beta/qa/ipad-analyze-diagnostic`

Admission requires both process gates:

- `CAISSA_PLAY_V2_BETA_STAGE=internal`
- `CAISSA_PLAY_V2_PHYSICAL_QA=ipad-analyze-diagnostic`

Every other stage, missing capability, query, fragment, descendant, direct generated-document request, Web Storage, or History API manipulation fails closed. The generated entry is absent from navigation and public-release inputs. Normal Play does not load its CSS, policy, boot code, or recorder.

The recorder is opt-in and memory-only. A 512-entry ring buffer stores monotonic elapsed time, sequence, non-identifying generation/lifecycle state, current mode/surface, viewport and scroll geometry, visibility/inert state, bounded element rectangles and computed sizing, visible/mounted board counts, document overflow, event attribution, and local violation codes. It does not record FEN, PGN, moves, evaluations, identity, cookies, storage, network details, certificates, or local paths. It performs no network transport and does not modify measured geometry.

Controls are `Start capture`, `Stop capture`, `Copy diagnostic JSON`, `Download diagnostic JSON`, and `Clear`. They live in a modal diagnostic dialog opened only by explicit activation of a compact launcher. The route always initializes with the dialog closed, focus outside it, capture stopped, and an empty volatile buffer. Starting capture closes the dialog before reproduction and returns focus to the selected Play mode; only the launcher remains available to reopen it above Inline Analyze. Escape and Close return focus to the launcher. The dialog is therefore not open over the product during capture, and neither state participates in product layout or changes board geometry. Refresh, route re-entry, and Back/Forward do not restore dialog or capture state. Opening the route does not start capture or a Worker.

The launcher reports the current owner surface as Play, PostGame, or Analyze. An export is `complete` only when the buffer contains an actual Analyze surface transition, an `analyze-open` marker, the real `AnalyzeSection.onEnter` call, and a visible Analyze host and inner board. Stopping earlier remains valid diagnostic evidence but is explicitly exported as `partial`, includes `missingRequiredEvents`, and displays `Analyze was not captured`.

## Future physical procedure

1. Start the private, loopback-backed environment with both gates and complete laptop-side isolation checks.
2. Open the diagnostic route on the iPad and select **Start capture**.
3. Collapse the diagnostic drawer, complete a game, open PostGame, then activate Analyze.
4. Rotate only as needed to reproduce the observed portrait collapse.
5. At the first collapse, reopen the launcher, select **Stop capture**, and perform no other test cases. Confirm the export says `complete`; otherwise preserve it only as partial evidence and do not infer an Analyze result.
6. Copy or download the sanitized JSON and provide it for root-cause analysis.
7. Clear the buffer and execute the complete server, proxy, firewall, certificate, device-profile, and temporary-artifact rollback.

The diagnostic does not correct Analyze. `IPAD-11.8.2-002` remains unresolved until a physical trace demonstrates the responsible owner and callback order.
