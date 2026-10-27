# CAISSA AI Governance Review

**Verified:** 2026-10-26

## System classification

| System | Category | Current governance conclusion |
|---|---|---|
| Stockfish/LC0/Fairy-Stockfish analysis | Local chess engine | Not generative AI; license, security and truthful-output limits apply |
| Scanner model v0.5 | Narrow board-recognition model | Automated prediction requiring Review/Edit; not general-purpose AI |
| Mentor/Coach local explanations and engine summaries | Local chess tooling | Do not imply a remote model receives data when it does not |
| External provider-backed Mentor paths | Generative AI integration | Activation/provider state not fully proven; AI-001 gate applies |
| Future Scanner training | ML development pipeline | SCAN-002 approval and dataset governance required |

## AI-001 - External generative AI activation gate

Before any prompt or account data is transmitted to a provider:

- identify the exact provider/model/region and current terms/DPA;
- disclose what is sent, retention, provider training/defaults, subprocessors and transfer basis where applicable;
- send only the minimum chess context; prohibit secrets, sensitive data and unnecessary identifiers;
- keep user-supplied API keys transient and route them only to the selected fixed provider endpoint;
- enforce authentication/consent as appropriate, per-user and project cost limits, timeouts, concurrency and a kill switch;
- separate provider output from engine calculation and label uncertainty;
- provide human review for safety/moderation/account decisions; never let a model autonomously sanction a user;
- test prompt injection, data exfiltration, output abuse and logging redaction;
- decide child eligibility separately; do not expose Junior accounts by default.

## Scanner governance

Recognition, optional feedback, private image storage, human certification, dataset export, training and deployment are separate purposes/actions. The current model must remain frozen unless a new approved release satisfies SCAN-002. Human Review/Edit and structural guardrails are mandatory product controls, not evidence that every result is correct.

## EU AI Act / international review

On current intended use, a chessboard recognizer and chess coach are not identified as an Annex III high-risk system or general-purpose model. Territorial application and provider/deployer roles remain fact-dependent. If CAISSA intentionally offers AI features in the EU, review transparency, AI literacy, technical documentation, provider obligations and prohibited practices against the then-current implementation. Do not market legal compliance based solely on this classification.

## Copyright and output

User prompts and imported chess/media content require rights. Provider output may be inaccurate and its ownership/licensing depends on provider terms and underlying material. Avoid generating or redistributing third-party branded artwork without permission. Keep model/data/code provenance and exact versions.

## Required documentation

- System card: intended use, users, inputs/outputs, limitations and prohibited uses.
- Provider record: terms date, model, region, retention/training setting, DPA and subprocessors.
- Data flow and logging/retention map.
- Evaluation for accuracy, safety, prompt abuse, accessibility and cost.
- Human oversight and incident/rollback owner.
- Versioned release decision and kill-switch test.

## Decision

Local engines and frozen Scanner inference may continue under current product controls. External generative AI expansion and community-derived training remain FUTURE ACTIVATION GATES, not current authorization.

## Primary sources

- [EU AI Act](https://eur-lex.europa.eu/eli/reg/2024/1689/oj)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- Provider terms and DPAs must be captured for the exact provider at activation time.
