# Play v2 iPad P1 remediation and Analyze diagnostic

Status: accepted P2 residual risk; iPad not yet integrally certified

Diagnostic contract: `PlayV2PhysicalIpadAnalyzeDiagnosticPolicy@1.1.0`

Closure disposition: `PlayV2IpadAnalyzeClosureDisposition@1.0.0`

## Local manual acceptance

The product owner accepted the localhost implementation for initial Black plus two Rematches, White, Random, explicit Flip, physical Player/CAISSA labels, clock ownership, Coach-to-Games/Bots isolation, closed initial diagnostic state, launcher/focus/Escape/Close/Start lifecycle, non-obstructive presentation, complete Analyze capture, `Surface: Analyze`, empty `missingRequiredEvents`, Copy/Download/Clear, one visible board, and zero overflow.

The targeted physical retest subsequently passed `IPAD-11.8.2-001` and `IPAD-11.8.2-003`. `IPAD-11.8.2-002` was not reproduced across four physical Analyze openings, portrait, landscape, return to portrait, and ordinary Safari chrome. The original intermittent collapse was physically real. Its initial classification was provisional P1, its root cause remains unresolved, and no responsible owner or callback order has been demonstrated. No specific Inline Analyze runtime or CSS fix was implemented.

A formal severity review applied the definitions owned by `PlayV2PhysicalDeviceQAPlan@1.0.0`. The observed failure affected one post-game Inline Analyze presentation intermittently; it did not prevent starting or completing a game, corrupt GameRecord or PGN, affect active-game clocks or promotion, or establish repeatable overflow hiding required controls. The behavior therefore matches the plan's P2 rotation/layout and intermittent-control category more closely than its P1 release-blocker cases. The release owner explicitly accepted the residual risk after the bounded evidence below. This disposition preserves rather than rewrites the original physical finding.

## Final bounded physical soak

The final instrumented physical soak retained 28 complete Analyze generations without reproducing the collapse, overflow or any diagnostic geometry violation:

| Orientation | Evidence SHA-256 | Complete generations | Viewport | DPR | Analyze board | Result |
| --- | --- | ---: | --- | ---: | --- | --- |
| Landscape | `AC62C691CC5DBAA51B0B47D3AB388F53C9B421FBED7C35E2AE3F50BEEC752ACE` | 15 | 1194 × 740 | 2 | 420 × 420 | No collapse, overflow or violation |
| Portrait | `F3A33439B2E26DDB631650C1190ED1DF599BDA1EFED5D00EE4E5D8F3DF668591` | 13 | 834 × 1100 | 2 | 420 × 420 | No collapse, overflow or violation |

The four targeted openings and 28 complete soak generations are bounded mitigation evidence, not proof that recurrence is impossible and not evidence of a product fix. The source JSON remains externally controlled and is not part of this repository.

## Absolute orientation ownership

The resolved color of the current game session is the sole initial orientation input. `BoardAdapter.setOrientation()` applies `white` or `black` absolutely when a session starts. The physical bottom edge follows the effective board orientation and owns the matching semantic color label and clock; the opposite semantic pair occupies the top edge. Relative `flip()` remains available only for an explicit user action, swaps that physical presentation, and does not change White/Black identity or initialize a session. Requested and resolved color, labels, clocks, coordinates, tap-to-move, Rematch, New Game, Random, and mode transitions must remain aligned with those owners.

## Coach presentation isolation

When the shell leaves Coach, the Coach panel owner resets its assistance presentation and the shell clears the shared active-game live region before rendering Games or Bots. Coach controls are subsequently hidden by composition ownership. Configuration remains governed by the native Coach contract; no educational product surface is admitted.

## Gated physical Analyze diagnostic

Route: `/play/beta/qa/ipad-analyze-diagnostic`

Admission requires both process gates:

- `CAISSA_PLAY_V2_BETA_STAGE=internal`
- `CAISSA_PLAY_V2_PHYSICAL_QA=ipad-analyze-diagnostic`

Every other stage, missing capability, query, fragment, non-allowlisted descendant, direct generated-document request, Web Storage, or History API manipulation fails closed. The only authorized paths are the base Games route plus fixed `/bots` and `/coach` descendants. The current route owner generates those paths, preserves the double gate and diagnostic UI/capture, and never navigates to `/`, Classic, or an ordinary beta descendant. Players remains fail-closed. The generated entry is absent from navigation and public-release inputs. Normal Play does not load its CSS, policy, boot code, or recorder.

The recorder is opt-in and memory-only. A 512-entry ring buffer stores monotonic elapsed time, sequence, non-identifying generation/lifecycle state, current mode/surface, viewport and scroll geometry, visibility/inert state, bounded element rectangles and computed sizing, visible/mounted board counts, document overflow, event attribution, and local violation codes. Eviction increments `recordsDropped`; exports identify `ringBufferCapacity`, retained/dropped counts and first/last retained sequence.

Completeness does not depend on the evictable ring. A separate bounded `requiredEventEvidence` map retains at most 16 attributed Analyze generations. Each generation stores only first/last sequence, booleans for `analyze-open`, `AnalyzeSection.onEnter`, visible host and visible inner board, plus one minimal visible-board geometry snapshot. A new capture and Clear both erase this evidence. Back to PostGame followed by Analyze creates a distinct generation. It does not duplicate the event log and remains bounded, volatile and non-persistent.

Stop, Copy and Download each construct one atomic export snapshot. The UI verdict is rendered from that same snapshot, so UI and JSON cannot disagree. The snapshot records `verdictSequence` and monotonic `verdictElapsedMs`, never wall-clock time. It does not record FEN, PGN, moves, evaluations, identity, IP, SSID, cookies, storage, network details, certificates, PIDs or local paths. It performs no network transport and does not modify measured geometry.

Controls are `Start capture`, `Stop capture`, `Copy diagnostic JSON`, `Download diagnostic JSON`, and `Clear`. They live in a modal diagnostic dialog opened only by explicit activation of a compact launcher. The route always initializes with the dialog closed, focus outside it, capture stopped, and an empty volatile buffer. Starting capture closes the dialog before reproduction and returns focus to the selected Play mode; only the launcher remains available to reopen it above Inline Analyze. Escape and Close return focus to the launcher. The dialog is therefore not open over the product during capture, and neither state participates in product layout or changes board geometry. Refresh, route re-entry, and Back/Forward do not restore dialog or capture state. Opening the route does not start capture or a Worker.

The launcher reports the current owner surface as Play, PostGame, or Analyze. An export is `complete` only when one attributed generation contains an actual `analyze-open`, the real `AnalyzeSection.onEnter` call, and visible Analyze host and inner board evidence. Stopping earlier remains valid diagnostic evidence but is explicitly exported as `partial`, includes `missingRequiredEvents`, and displays `Analyze was not captured`.

Geometry violations are applicable only while Analyze is the active observable surface. Historical geometry may still be recorded during exit or after PostGame restoration, but it carries `geometryApplicability.applicable: false` and cannot emit zero-size, square, host divergence, multiple-board, Back-boundary or overflow violations. Zero size remains a violation when Analyze should be observable.

Square tolerance is derived rather than device-specific: `max(2 / devicePixelRatio, 2 / visualViewport.scale, 1% of the larger board dimension)` CSS pixels. This covers device-pixel quantization, visual-viewport scaling and proportional subpixel rounding. A smaller/larger ratio below `0.75` is separately classified as a material strip. Thus 417×420 under zoom is accepted while zero height and substantial flattening remain detectable.

Browser same-origin evidence compares every request origin to the active document's exact `location.origin`. This admits the authorized HTTP loopback runner and private HTTPS gate without accepting arbitrary origins or changing runtime behavior.

## Future physical procedure

1. Start the private, loopback-backed environment with both gates and complete laptop-side isolation checks.
2. Open the diagnostic route on the iPad and select **Start capture**.
3. Collapse the diagnostic drawer, complete a game, open PostGame, then activate Analyze.
4. Rotate only as needed to reproduce the observed portrait collapse.
5. At the first collapse, reopen the launcher, select **Stop capture**, and perform no other test cases. Confirm the export says `complete`; otherwise preserve it only as partial evidence and do not infer an Analyze result.
6. Copy or download the sanitized JSON and provide it for root-cause analysis.
7. Clear the buffer and execute the complete server, proxy, firewall, certificate, device-profile, and temporary-artifact rollback.

## Versioned closure disposition

The original closure clause stated: "The diagnostic does not correct Analyze. `IPAD-11.8.2-002` remains unresolved until a physical trace demonstrates the responsible owner and callback order." That investigative requirement remains historical context but is superseded for closure by `PlayV2IpadAnalyzeClosureDisposition@1.0.0`; it is not silently ignored.

`IPAD-11.8.2-002` preserves the original physically observed intermittent portrait collapse. No specific Inline Analyze runtime or CSS fix was implemented, and the root cause and responsible callback order remain unknown. Following four targeted physical openings and a final instrumented soak of 28 complete Analyze generations without reproduction, the issue is reclassified from provisional P1 to P2 residual risk. Closure does not mean fixed or root-cause resolved. Explicit release-owner risk acceptance has been recorded and the original evidence remains preserved. The issue must reopen immediately as P1 if the collapse recurs, becomes repeatable, blocks recovery, loses or corrupts GameRecord, PGN or completed-game state, hides essential controls persistently, affects active gameplay, or appears outside post-game Inline Analyze.

iPad certification may proceed only after every other required device-available case is disposed and independently reviewed. Certification must disclose this residual risk and must not claim an Inline Analyze fix or known root cause.

Current states:

- `IPAD-11.8.2-001: PHYSICALLY PASSED`
- `IPAD-11.8.2-003: PHYSICALLY PASSED`
- `IPAD-11.8.2-002: CLOSED AS ACCEPTED P2 RESIDUAL RISK — HISTORICAL PHYSICAL FINDING PRESERVED; NOT FIXED; ROOT CAUSE UNKNOWN`
- `IPAD: NOT YET INTEGRALLY CERTIFIED — REMAINING REQUIRED PHYSICAL CASES PENDING`
