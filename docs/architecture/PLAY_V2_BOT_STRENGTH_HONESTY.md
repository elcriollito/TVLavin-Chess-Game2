# Play v2 bot strength and identity honesty

Season: **11.4.3**  
Contract: `PlayV2BotStrengthHonesty@1.0.0`  
Status: **accepted locally for internal, unrated Bots only**

## Contract and current presentation

The frozen contract requires `currentRatingStatus = unrated-calibration-pending`; numeric or certified Elo, federation ratings/titles, exact human strength, real-person replicas/identity/likeness, and depth-as-Elo are prohibited. Style requires calibration evidence, difficulty requires relative evidence, the four product-profile names are allowlisted, future rating activation requires versioned calibration, and analytics transport remains disabled.

Every card visibly and programmatically exposes `Unrated · calibration pending`. Beginner, Casual, Tactical, and Solid are fictional product profiles, not people. No identity, biography, photograph, likeness, flag, federation title, account, external profile, personal data, remote lookup, tracking, cookie, analytics transport, query-controlled profile/rating, FICS identity, or PGN upload is present.

## Complete focused claim inventory

The inventory searched Play v2 bot runtime, UI/accessibility strings, configuration, tests, browser tests, analytics vocabulary, and bot/readiness documentation for Elo/ELO, rating/rated, strength, human, the four profile names, master/grandmaster/professional/expert, personality, replica, estimated/approximate/certified, depth, and skill.

| Location / occurrence | Classification | Disposition |
| --- | --- | --- |
| Four names and IDs; short style taglines; relative difficulty bands | evidence-backed | Allowlisted and tied to `PlayV2BotPersonalityPolicy@1.0.0` evidence. “Forgiving” was removed as ambiguous. |
| Four `Unrated · calibration pending` labels and “not a human rating” disclosure | calibration-pending | Required visible and accessible public status. |
| `depth`, candidate count, loss boundary, error-rate threshold, engine preset IDs, Worker/Stockfish, `estimated`/`internally-tested` calibration tokens | internal technical configuration | Permitted only in runtime metadata, tests, and architecture evidence; never rendered as rating. |
| Fixed-seed, corpus, relative-order, legal-move, accessibility, and Worker assertions | test-only | Evidence and guards, not public claims. |
| Calibration measurements, future rating requirements, certification limitations, Elo/identity prohibitions | documentation-only | Governance record; not UI copy. |
| Games human-vs-machine wording, human-provider/FICS audit rows, unrelated CAISSA ratings, “master” inside unrelated filenames/technical vocabulary | false positive / out of focused scope | Unchanged; focused guards do not ban other products. |
| Numeric Elo, certified/federation/human-equivalent strength, named-player imitation, guaranteed mistakes, unbeatable/master/GM/pro strength | prohibited public claim | None remains. Runtime and static gates reject introduction. |

## Permitted claims

- Beginner: limited, controlled bounded inaccuracies, lowest relative difficulty.
- Casual: balanced recreational behavior and fewer controlled inaccuracies than Beginner.
- Tactical: prefers sound forcing candidates inside its safety boundary.
- Solid: prefers stable, lower-exposure candidates inside its safety boundary.

These are preferences or relative observations, never guaranteed decisions, human psychology, named-player imitation, or numeric ratings. Technical implementation details stay out of the Play UI.

## Future numeric-rating gate

No calibration is performed and no placeholder number exists. Before any number may display, all of the following require recorded evidence: versioned bot configuration; versioned engine and Worker; reproducible protocol; sufficiently large sample; opponent pool and rating provenance; specified time control; confidence interval or documented uncertainty; device/performance considerations; calibration date; expiration/recalibration policy; independent review; and explicit product approval. A future value must say `Estimated`, never certified Elo unless genuine recognized certification exists.

## Guards, accessibility, security, and acceptance

`bot-strength-honesty.test.js` is deliberately scoped to Play v2 bot files. It freezes all denials and the future gate, requires exactly the allowlisted identities and four disclosures, rejects rating/identity metadata and unsupported phrases, prevents numeric/depth-as-rating presentation, confirms policy ownership of style, and checks transport/storage/lookup absence. `bot-profile.js` additionally fails registration when this runtime policy rejects a profile.

Native radio cards retain keyboard operation, checked state, visible focus, forced-colors support, contrast, zoom/reflow, and a composed accessible name containing name, rating disclosure, style, and difficulty. The disclosure is visible text rather than color or tooltip. Automation is regression evidence only; no named screen reader or physical device is certified.

Season 11.4.3 is locally accepted after unit, static, Chromium, WebKit, personality, Worker, Games, boundary, deterministic-build, syntax, documentation, and changed-path checks. Bots remains internal and unrated; deployment, public beta, physical-device verification, and human-rating calibration remain gates.
