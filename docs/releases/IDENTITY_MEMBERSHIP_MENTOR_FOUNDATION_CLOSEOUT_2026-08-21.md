# CAISSA Chess

# Identity, Membership UX & Shared Mentor Economic Foundation

# Project Closeout — 2026-08-21

**PROJECT STATUS: COMPLETED / CERTIFIED**

This is the historical closeout for the Identity, Membership UX, and Shared Mentor Economic Foundation project. It records the certified end state and architectural intent at closeout; it is not a continuously rewritten status page. Start with [`../CURRENT_PROJECT_STATE.md`](../CURRENT_PROJECT_STATE.md) for the current repository entry point, then reconcile this record against current HEAD and Production before acting.

## Executive status

The project established or repaired Free account registration, cross-route authenticated identity, truthful membership and Pricing UX, the Floating Shared Mentor, Together/Llama 3.3 integration, reservation-based credit economics, encrypted result availability, durable delivery acknowledgement, maintenance/reconciliation, privacy-safe observability, and the final single-user Production canary.

The general Mentor reservation rollout remains **intentionally OFF**. Completing the foundation and its canary did not authorize a population-wide rollout.

## Certified Production snapshot

| Area | Final known state at closeout |
| --- | --- |
| Canonical site | `https://www.caissa-chess.org` |
| Shared provider | Together |
| Provider endpoint | `https://api.together.ai/v1/chat/completions` |
| Shared model | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| Shared output cap | 768 tokens |
| Default temperature | 0.7; a validated request may specify another value within the server bounds |
| Transport | Non-streaming; 20-second provider timeout |
| General reservations | OFF: the flag is absent or not exactly `true` |
| Economic maintenance | Enabled |
| Maintenance schedule | `17 4 * * *` (04:17 UTC daily) |
| Final MR1 candidates | release 0; consume 0; compensation 0; ACK review 0; cleanup 0 |
| Historical certified canary | `CONSUMED`; provider `SUCCEEDED`; result `SUCCESS`; `VALUE_DELIVERED` |
| Canary economics | One linked `-1` debit; zero compensation; final wallet 4 |
| Retained result | Expired encrypted payload cleaned; economic history retained |

No user ID, operation ID, credential, secret, chess content, or ciphertext belongs in this closeout.

The current source of truth for the request limits and Shared allowlist is [`../../api/_lib/mentor-request-policy.js`](../../api/_lib/mentor-request-policy.js); provider routing is in [`../../api/mentor/chat.js`](../../api/mentor/chat.js); the scheduled route is declared in [`../../vercel.json`](../../vercel.json).

## Identity and registration — completed

The durable registration path is:

```text
Clerk
  -> /auth/complete
  -> /api/user/sync
  -> public.users
```

Registration is independent of Premium purchase. A registered user may remain Free indefinitely. Guest and Registered Free are separate identity states, while the gameplay label **Player** describes a board role rather than membership identity. `public.users` is the durable source for the registered CAISSA account count.

The canonical auth runtime and identity renderer now persist authenticated identity across representative modern and legacy route families. Play, Arena, Endgame, and standalone surfaces converge on the same Clerk session/profile bootstrap and sidebar identity semantics instead of inventing route-local membership truth. Relevant ownership lives in [`../../js/caissa-auth.js`](../../js/caissa-auth.js), [`../../js/caissa-ui-auth.js`](../../js/caissa-ui-auth.js), and [`../../js/caissa-standalone-auth-runtime.js`](../../js/caissa-standalone-auth-runtime.js).

## Membership product model

The agreed conceptual hierarchy is:

```text
FREE — Play & Explore
  ⊂ SILVER — Improve
    ⊂ GOLD — Understand
      ⊂ PLATINUM — Master
```

Credits mean **Pay as you use**. They remain separate from membership wherever AI or server work has variable cost.

The complete authoritative Free/Silver/Gold/Platinum backend state and enforcement are **not implemented or certified**. Pricing presentation is not proof of paid-tier entitlements, and the legacy `premium` boolean is not a specific tier.

## Pricing and Free product philosophy

The product rule is:

> **FREE:** Your device works for you.
>
> **PREMIUM:** CAISSA works for you.

Where current repository support exists, local engine play, local Stockfish analysis and review, learning/endgame tools, public integrations, ECO/opening tools, Arena, and local library workflows remain Free. Shared Mentor and other materially variable-cost server AI/compute remain credit-based.

Pricing inventory distinguishes **Live Free**, **Credit-Based**, and **Coming Soon** so uncertified tier functionality is not advertised as live. The renderer is [`../../js/caissa-pricing-inventory.js`](../../js/caissa-pricing-inventory.js).

## Floating Mentor — completed

The released foundation includes:

- a persistent Floating Mentor shell;
- a desktop drawer and mobile bottom sheet;
- a clear distinction between Shared AI and Local Game Review;
- no provider call merely from opening, minimizing, or reopening the shell;
- authenticated Shared requests and the Play fair-play boundary;
- repaired long-response containment and correct conversation scroll ownership;
- certified mobile and desktop composition; and
- render-to-confirm delivery acknowledgement with a fresh auth token and bounded idempotent retry.

The client owner is [`../../js/mentor/mentor-floating-shell.js`](../../js/mentor/mentor-floating-shell.js); the server confirmation owner is [`../../api/mentor/result/[operationId]/confirm.js`](../../api/mentor/result/[operationId]/confirm.js).

## Provider investigation and final contract

| Model | Finding | Decision |
| --- | --- | --- |
| Kimi K2.5 | Previously configured; retired/removed from Together serverless | Do not restore |
| Kimi K2.6 | Catalog-visible, but direct inference returned `model_not_available` for the Production credential/project | Removed from the CAISSA Shared allowlist |
| Llama 3.3 | Direct health check used the canonical `.ai` endpoint, returned HTTP 200 and the expected schema/marker under a Production-equivalent contract | Final Shared model |

Do not restore K2.5 or K2.6 without a new, explicit provider availability and compatibility review.

## Economic architecture — completed

The final charge and delivery sequence is:

```text
AUTHENTICATE
  -> RESERVE
  -> PROVIDER ATTEMPT
  -> ENCRYPT RESULT
  -> VALUE_AVAILABLE
  -> CONSUME
  -> LINKED DEBIT
  -> RETURN RESULT
  -> CLIENT ACK
  -> VALUE_DELIVERED
  -> NORMAL TTL CLEANUP
```

`VALUE_AVAILABLE` is the economic chargeable boundary. `VALUE_DELIVERED` is durable client acknowledgement. Missing ACK does not by itself invalidate a legitimate debit after value became available.

The durable foundation includes:

- the physical `users.credits` wallet;
- append-only `credit_events`;
- `credit_reservations`;
- bounded `economic_usage_events`;
- encrypted, short-lived `mentor_operation_results`;
- safe operation inspection and bounded recent-operation discovery;
- idempotent delivery confirmation;
- reconciliation, maintenance, and result TTL cleanup; and
- privacy-safe aggregate inspection.

While a hold is active:

```text
available credit = wallet - active reservations
```

The detailed component contract and emergency-OFF runbook are in [`../architecture/mentor-economic-foundation.md`](../architecture/mentor-economic-foundation.md). Its opening statement that the source is “not released” is historical drift: later commits and the certified Production canary superseded that sentence. Its fail-closed controls, privacy boundary, maintenance guards, and OFF procedure remain useful, subject to reconciliation against current HEAD.

## Incident and repair history

| Incident | Evidence and repair |
| --- | --- |
| Legacy debit before provider failure | One historical request debited a credit before the provider failed. An explicit ledgered `+1` compensation restored the wallet while preserving the original debit. |
| Provider-failure reservation canary | `RESERVED -> provider FAILED -> RELEASED`; wallet unchanged and no linked debit. This proved the new failure invariant. |
| Together model availability | K2.5 was retired and K2.6 could not infer for the Production credential/project. Shared Mentor migrated to Llama 3.3. |
| Missing delivery ACK | The browser rendered an answer but did not call the existing confirm endpoint, leaving `VALUE_AVAILABLE`. FIX1 connected render to fresh-token confirmation and added bounded idempotent retry. |
| Incorrect maintenance compensation | Expired `VALUE_AVAILABLE` without ACK was treated as compensable. FIX2 retained the chargeable boundary and classified missing ACK for review/reconciliation, not automatic refund. |
| Historical operation reconciliation | REC1 moved `VALUE_AVAILABLE -> VALUE_DELIVERED`; the wallet and single debit remained unchanged, with no compensation. |
| Maintenance restoration | MR1 restored corrected maintenance and cleaned exactly one expired delivered payload with no economic mutation; all candidate counts reached zero. |

Historical ledger entries must never be deleted merely to make a balance look cleaner.

## Authoritative milestone commits

These commits exist in the current history at closeout:

| SHA | Subject |
| --- | --- |
| `fa03c80ee575d1a437c338e82878f6a49f44d837` | `feat(mentor): add economic reservation foundation` |
| `13980498ba0b5ad686d445535ceeae9f8ce72322` | `feat(mentor): harden reservation canary controls` |
| `4975850b342ea8be7f3d676bdca17e552bbc4d24` | `fix(mentor): add safe operation inspection RPC` |
| `1fbec5e694de0a996d3eb5e3b8678904fc05a59b` | `feat: add discoverable Mentor launcher to Play` |
| `53c593c57832907717aaa3e1b9d275faa99281e1` | `fix: restore Mentor auth handoff on Play` |
| `8a68fedba5bb565062d80874047fa0b2beb8d0c5` | `fix(mentor): align Kimi K2.6 Together request contract` |
| `a1ee840a3d899072b58200e33396a6543bdf75cd` | `fix(mentor): migrate shared provider to Llama 3.3` |
| `947f84a536bcca4534c157d19cac3d1c9db8fb27` | `feat(mentor): add bounded recent operation discovery` |
| `c2f9aa27d2ea91384ec8810b22578836e629a31d` | `fix(mentor): contain long responses in floating shell` |
| `e7ba267091943a5d5c3ab3b897d09cb14499b80b` | `fix(membership): unify free identity and truthful pricing` |
| `b750f91def8b8c9fcdd6faac74d0eae2dadb1baa` | `fix(auth): hydrate every standalone sidebar` |
| `0e5ad3bd4a1be9d29be9310c0cccc88c9b6c4f1b` | `fix(auth): persist sidebar identity across routes` |
| `e386134048ccc6fd00cbb647c5f5fbf1e320f273` | `fix(mentor): confirm durable delivery after render` |
| `6e1a07440bf1a4c517ef5d283614b436057531c8` | `fix(mentor): align maintenance with value availability` |

## Security and privacy contract

Economic telemetry and state do not need prompt, response, FEN, PGN, moves, email, username, raw IP, raw URL, provider payload, API key, or bearer token. Encrypted Mentor content is short-lived retention data; economic truth is bounded metadata, state, and quantities.

The server is authoritative for membership/tier state, credit mutations, reservations, provider/model selection, delivery-confirmation ownership, and maintenance execution. Browser telemetry is not billable economic truth.

## Intentionally Disabled / Not Rolled Out

### GENERAL MENTOR RESERVATIONS: OFF

This is intentional, not a defect. R2 certified one controlled user and the architecture; it did not authorize general rollout.

Any future rollout requires an explicit Product Owner decision covering population, credit allowance, request limits, provider costs, monitoring, rollback, and membership/credit interaction.

## Future backlog

### High / important

1. **SEC-005 — Clerk Production migration.** Production still uses a Clerk Development instance and retains related blob-worker/CSP debt. Never replace `pk_test` with `pk_live` in isolation; identity migration must follow the coordinated plan in [`../security/SEC-005_CLERK_PRODUCTION_MIGRATION_PLAN.md`](../security/SEC-005_CLERK_PRODUCTION_MIGRATION_PLAN.md).
2. **Authoritative membership-tier backend.** Implement durable Free/Silver/Gold/Platinum state, enforcement, Stripe/billing integration, and entitlement rollout.
3. **Account Center.** Profile, Membership, Billing, Credits/Usage, Security, Privacy/Data, Export, and Delete Account/Danger Zone.
4. **Mentor general rollout.** Reservations remain OFF pending a dedicated economics, limits, monitoring, and rollback season.

### Medium / technical debt

- immutable release-baseline re-certification;
- pre-existing responsive Play readiness timeout;
- legacy/non-blocking resource 404 cleanup;
- unrelated Node `url.parse()` deprecation warning;
- Supabase informational advisor notices where still applicable; and
- normal auth and traffic monitoring.

### Product / analytics

- a registered-user dashboard/counting UI backed by `public.users`; and
- Free-to-paid conversion reporting after paid tiers exist.

## CAISSA Mentor Intelligence / Chess Expert Agent

This is an approved direction for a future project, not an implementation in this closeout.

```text
Mentor Router
  -> deterministic board/rules tools
  -> motif detection
  -> Stockfish grounding
  -> ECO/opening knowledge
  -> endgame knowledge
  -> structured chess facts
  -> LLM explanation
```

Suggested stages are MIA-0 ChessQA raw-model baseline, MIA-1 deterministic chess tools, MIA-2 Stockfish grounding, MIA-3 chess knowledge/RAG, MIA-4 tool router/agent, MIA-5 ChessQA certification, and MIA-6 later training or distillation only if evidence justifies it.

Benchmark hygiene is mandatory: do not train on public ChessQA test answers and then represent that score as independent evaluation. Maintain source-disjoint and private holdouts.

## Recommended future order

1. Plan and execute SEC-005 / Clerk Production migration.
2. Establish the authoritative membership-tier backend.
3. Build Account Center, privacy, export, and deletion controls.
4. Make a separate Mentor rollout decision with economics and limits.
5. Re-certify an immutable baseline and clear smaller debt.
6. Begin CAISSA Mentor Intelligence / Chess Expert Agent work.

This order prevents paid entitlements or expanded Mentor economics from depending on an identity authority that is still scheduled for coordinated migration.

## Do Not Assume

- Pricing UI does not mean Silver/Gold/Platinum backend enforcement is live.
- The legacy `premium` boolean is not equivalent to a specific paid tier.
- Reservations OFF is intentional and does not mean the Mentor architecture failed.
- Do not restore Kimi model IDs without a current Together review.
- Do not change Clerk Development keys to Production keys in isolation.
- Do not use browser telemetry as billable economic truth.
- Do not bypass `VALUE_AVAILABLE` as the charge boundary without an explicit new economic architecture decision.
- Do not delete historical ledger events to “clean up” balances.
- Do not create parallel auth, provider, reservation, or membership systems before auditing existing ownership.
- Do not treat the stale “not released” sentence in the older economic document as newer than this closeout, current HEAD, or Production evidence.

## New-session bootstrap

Before starting new CAISSA work:

1. Read [`../CURRENT_PROJECT_STATE.md`](../CURRENT_PROJECT_STATE.md).
2. Read this closeout and any newer closeout referenced there.
3. Inspect current HEAD and recent git history.
4. Inspect Production configuration relevant to the requested task.
5. Reconcile documentation against current code.
6. Treat repository and current Production truth as authoritative when newer than this historical closeout.
7. Preserve unrelated Product Owner worktree changes.
8. Do not automatically reactivate intentionally disabled systems.
