# Season 10.8B — Verified Stop-Promotion Pilot

Season 10.8B adds a second hidden multi-move objective without changing the public trainer modes, pools, Knowledge release, scoring, or persistence.

## Reviewed contract

The immutable objective `stop-promotion@1.0.0` starts from `k7/8/8/8/p7/8/8/3K4 w - - 0 1`. White succeeds only by capturing the designated black a-pawn before promotion. Kc1 and Kc2 enter the two reviewed routes. Kd2 is explicitly an `objective-miss-while-drawing`; Ke1 and Ke2 are bounded objective failures.

The opponent follows `authored-deterministic-tree@1.0.0`. Every reply is embedded in the integrity-checked public artifact. Runtime network access, tablebase requests, engine execution, workers, random selection, and backend evaluation are prohibited.

## Release boundary

Private reviewer identity, rationale, review bindings, the 14-state graph, raw evidence, and authoring paths remain under `endgame-pools/private/`. The public runtime receives only:

- the bounded objective contract and two approved branches;
- explicit deviation classifications;
- approved hints and feedback;
- safe provenance and verification summaries;
- a compatibility fingerprint and SHA-256 digest.

The public artifact is immutable at `public/data/endgame-pilots/rule-square-a-pawn-catch-stop-promotion/1.0.0.json`; there is no `latest` alias.

## Runtime selection and isolation

The existing hidden gate remains `/endgame-trainer?trainerV2=1&multiMovePilot=1`. It continues to select the original promote pilot by default. Private QA selects this objective with:

`/endgame-trainer?trainerV2=1&multiMovePilot=1&pilot=rule-square-a-pawn-catch-stop-promotion@1.0.0`

The selector is an exact allowlist. Unknown values do not activate the pilot. Guided Study parameters retain precedence. The controller admits only `promote@1.0.0` and `stop-promotion@1.0.0`.

## State and result semantics

The existing session schema and single-board lifecycle are preserved. Legal covered off-route moves that remain stoppable restore the reviewed node. Kd2 ends with the truthful drawing-mission-miss result. Loss of the draw, an unstoppable pawn, promotion, or a bounded limit ends as objective failure. Uncovered or integrity-invalid states are neutral technical failures.

Only `independent-success`, `hint-assisted-success`, `objective-failure`, `objective-miss-while-drawing`, `technical-unavailable`, and `abandoned` are emitted. A third-stage next-move reveal removes independent-success eligibility. No learner record is persisted.
