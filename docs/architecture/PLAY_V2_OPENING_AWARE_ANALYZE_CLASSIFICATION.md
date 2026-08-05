# Play v2 Opening-Aware Analyze Classification

Status: local implementation; manual and physical retest required. `publicReady` remains false.

## Evidence and policy ownership

`AnalyzeOpeningEvidence@1.0.0` recognizes Book only from the repository-generated, same-origin `public/data/eco/eco_position_map.json`. That map is deterministically derived from `public/data/eco/eco_codes.json`, `public/data/eco/eco_details.json`, and `data/eco/known-lines.json` using the normalized post-move position and a 64-bit FNV-1a key. No remote explorer, API, CDN opening data, query-selected provider, PGN upload or runtime fallback is used.

The lookup requires a legal SAN/UCI move, completed local dataset load, current GameRecord ID and analysis generation, a trusted source and a valid ECO record. Recognition is bounded to 20 plies. Position matching permits a verified transposition; move number alone does not. Leaving a recognized position ends Book status until a later position independently matches trusted local evidence. Generic `A00` names are insufficient unless an explicit repository-owned known line supports them.

`AnalyzeReviewPolicy@1.1.0` gives complete Book evidence precedence over ordinary centipawn thresholds. Book means only “recognized repository continuation”; it is not “best”, an engine choice, mistake-free or winning. Book has no glyph, engine recommendation or accuracy contribution. The presentation may show played SAN, opening name, ECO code and the fixed same-origin `/eco/{CODE}` continuation.

Forced-mate loss or a normalized loss of at least 2.50 pawns overrides Book as Blunder. Illegal, malformed, stale, missing, contradictory or incomplete opening evidence never produces Book. The existing 0.50/1.00/2.50-pawn thresholds are unchanged.

## Stable engine comparison

Every move is attributed to its pre-move FEN, played SAN/UCI, GameRecord, ply and analysis generation. Before/after samples must be completed searches at the same requested depth, from the same active generation and normalized to the mover’s perspective. Mate uses the existing signed normalization. Null, partial, stale or depth-incompatible samples produce `Analysis unavailable`; they are never coerced to zero or included in accuracy.

## Data limits and follow-up

Coverage is limited to the locally generated position map and its 20-ply beta window. A recognizable opening name outside a trusted continuation is not enough. Dataset absence fails closed and normal engine classification resumes only when comparable engine evidence exists.

Chromium/WebKit automation covers the canonical `e4`, `d4`, `c4` and `Nf3` first moves; Open Game, French, Sicilian, Queen’s Gambit, Indian, English and Réti/flank families; the final supported ply; deviation; transposition; malformed/stale/contradictory evidence; catastrophic override; accuracy exclusion; ECO links; responsive containment; and Back restoration. Manual localhost acceptance and physical iPhone retesting remain required, including regression of `IPH-11.8.1-008`.
