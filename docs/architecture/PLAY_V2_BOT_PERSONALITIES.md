# Play v2 genuine bot personalities

Season: **11.4.1A**

Contract: `PlayV2BotPersonalityPolicy@1.0.0`

> Season 11.4.2A update: Native Bots now uses the locally certified
> `PlayV2BotWorkerReadiness@1.0.0` lifecycle. Profile selection remains passive;
> the Play action creates at most one canonical same-origin Worker, and every
> ownership exit terminates it. Calibration thresholds and unrated presentation
> are unchanged. See [`PLAY_V2_BOT_WORKER_READINESS.md`](./PLAY_V2_BOT_WORKER_READINESS.md).

> Season 11.4.3 adds `PlayV2BotStrengthHonesty@1.0.0`. It freezes rating,
> identity, likeness, and public-style boundaries and the future numeric-rating
> evidence gate. See [`PLAY_V2_BOT_STRENGTH_HONESTY.md`](./PLAY_V2_BOT_STRENGTH_HONESTY.md).

Status: **accepted locally for internal, uncertified Bots only**

## Ownership

The existing `EngineAdapter` remains the only engine/Worker owner. Its bounded attributed candidate operation temporarily requests MultiPV 2–5, collects the deepest scored line for each rank, restores MultiPV, and applies the existing cancellation generation barrier. The personality policy receives only that frozen candidate set. It creates no Worker, engine, session, clock, rules state, or game state. chess.js validates the allowlist and derives move features. The existing `app.js` opponent callback performs the isolation check and remains the one move-commit path.

## Frozen policy and predeclared thresholds

All profiles require legal moves, prohibit real-person simulation, certified Elo, numeric ratings before calibration, FICS/remote/Legacy fallback, arbitrary query configuration, and analytics transport. Acceptance thresholds were declared in the contract before final calibration: legal rate 100%; stale and duplicate commits zero; Beginner controlled-error rate at least 35%; Casual at most 30%; Tactical and Solid style advantage at least 20% on the targeted policy corpus; mate correctness 100%.

| Profile | Candidate budget | Selection | Loss boundary | Rating | Status |
| --- | --- | --- | ---: | --- | --- |
| Beginner | depth 3, 5 candidates | 60% seeded bounded variation | 260 cp | Unrated; calibration pending | internal |
| Casual | depth 7, 4 candidates | 10% seeded bounded variation | 100 cp | Unrated; calibration pending | internal |
| Tactical | depth 9, 5 candidates | most forcing safe candidate | 70 cp | Unrated; calibration pending | internal |
| Solid | depth 9, 5 candidates | least immediate forcing exposure | 55 cp | Unrated; calibration pending | internal |

Beginner and Casual are not human simulations. Tactical counts only checks, captures, and promotions; it does not claim named motif detection. Solid measures the opponent's immediate legal checks/captures after each candidate; it does not claim human positional understanding. Mate and immediate promotion override style. Negative mate candidates are excluded when a non-mated candidate exists. If scoring cannot safely distinguish, the best already-validated local candidate is used; no alternate provider/profile is substituted.

## Determinism and calibration

One non-identifying local seed is created per Bot game with `crypto.getRandomValues`; tests inject fixed bounded seeds. FNV-1a selection is reproducible and uses no `Math.random`. The versioned policy corpus is repository-owned synthetic material with FEN, side, category, expected property, fixed candidate evaluations, method, and limitation. It covers safe and unsafe forcing choices, stability, mate, and promotion. The existing independently constructed 17-position Stockfish corpus additionally covers development, six tactical positions, quiet play, defense, endgames, promotion, and ordinary sanity positions.

Final real Stockfish MultiPV evidence (17 positions, fixed profile seeds): Beginner 20/34, Casual 22/34, Tactical 22/34, Solid 24/34; legal failures 0; timeouts 0. Tactical scored 11/12 on tactical fixtures versus Casual 9/12. Solid scored 2/4 quiet and 4/4 defensive versus Tactical 0/4 and 2/4. The targeted fixed-candidate corpus proves Tactical chooses safe forcing play and rejects unsafe forcing play, Solid chooses the lower-exposure near-best move, every profile preserves mate/promotion, and 100 fixed seeds reproduce with greater Beginner error rate and average loss than Casual. These are local behavioral measurements, not Elo or production-Worker certification.

## Product, accessibility, security, and limitations

The internal panel shows exactly Beginner, Casual, Tactical, and Solid with `Unrated · calibration pending`, one short evidenced style phrase, difficulty, radio selection, time/color, and one `Play` action. It exposes no depth, MultiPV, score window, error rate, Worker URL, engine diagnostics, identity, biography, or numeric rating. Selection is labeled, keyboard/pointer/touch operable, programmatically checked, visibly focusable, and remains board-first across the existing responsive matrix.

The stack remains lazy and local. Selection starts no Worker. Start uses the existing single Worker/session/lifecycle; cancellation and route teardown retain existing ownership. There is no network/profile service, identity data, cookie, personal storage, PGN upload, query-controlled engine option, arbitrary Worker URL, FICS, education, Coach, Mentor mode, Players, or analytics transport.

Known gates: deployed production, physical devices, named screen readers, human-rating calibration, and public beta remain uncertified. The local production-equivalent Worker is certified, but actual deployment remains unverified. Bots is not public-ready.
