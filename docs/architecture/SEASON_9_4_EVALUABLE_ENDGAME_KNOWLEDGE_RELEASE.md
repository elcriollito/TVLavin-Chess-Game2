# Season 9.4 — Evaluable Endgame Knowledge Release

## Audit and coverage

The previous pinned release contained 17 units and 86 conventional learning objects, but only three exercises had enough information for deterministic runtime evaluation. Its 33 positions had valid FEN and principal ideas, while assessment descriptors lacked item prompts and answers, choice contracts did not exist, transfer was not item-level, and misconceptions were prose without response mappings.

Season 9.4 adds 34 item-level activities: one independent practice and one assessment for every unit. Sixteen independent items use exact SAN; Rule of the Square uses a bounded conceptual choice. Assessments use single-choice or plan-choice. Four items are explicitly transfer, covering Foundations, Transformations, Weaknesses, and Exchanges. Every choice assessment maps an explicit response to an existing authored misconception. Two move items include legal, educationally equivalent accepted alternatives.

The 86 conventional objects remain intact and readable; they are not automatically converted into evaluations.

## Contract and response types

Knowledge schema `1.1.0` adds `activityItems`; consumers retain support for historical schema `1.0.0`. Each item includes stable identity, source object, authored status, type, prompt, objective, position, attempt/hint/retry policy, deterministic answer, feedback, evidence mapping, transfer status, misconception mappings, and review-resolution requirements.

Supported responses are `exact-move`, `single-choice`, and `plan-choice`. Move sequence, ordering, free text, semantic grading, engine-generated alternatives, executable content, and runtime-generated answer keys are excluded.

Repository validation checks source and position references, unique item and choice IDs, evaluators, feedback/evidence/resolution fields, legal expected and alternative moves, authored misconception indices, mapping response IDs, resolution activities, and assessment no-reveal policy.

## Evidence, review, and persistence

Independent success yields `independent-success`; guided completion yields `guided-success`; assessment success yields `assessment-success`; independent transfer yields `transfer-success`. Only an explicitly mapped choice yields `misconception`. Repeated ordinary practice failure retains the existing remediation threshold.

Review resolution remains evidence-based. Launch, reading, and answer reveal do not resolve review. Misconception evidence carries its authored misconception ID as its matching criterion. Store and export remain schema v2 because retained evaluative events already represent the new identities and results. Consent, clearing, import/export, and storage-event synchronization remain unchanged.

## Runtime compatibility

The generic Season 9.3.4 runtime consumes schema 1.1 and keeps its schema-1.0 fallback. Library details derive Practice and Assessment actions from released eligibility. Guided Study renders move or stable-choice controls, selects the requested mode, prevents answer reveal during assessment, supports retry, and never trusts UI-submitted result status.

No per-unit UI logic, engine authoring, Mastery write, Recommendation mutation, Training Memory merge, cloud sync, or account dependency was introduced.

## Versioning and release

All unit IDs and slugs are preserved. Every unit increments content version and editorial date. Taxonomy remains `1.4.0`.

New release: `rel-58b238dfdda8f295fdab023cead6bf069aceefbee74a64a5cd71af2202480a84`.

Fingerprint: `da0b332b45933135eede26894ab8d23ece9f674299071bc8847e2da6a2811f37`.

The prior release `rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1` remains independently verifiable. Consumers pin the new release explicitly; no `latest` channel exists.

## Public boundary and Season 10

The public artifact contains immutable shards and generic runtime. Authored source, this document, tests, audit fixtures, and editorial diagnostics remain protected.

Season 10 has complete per-unit practice and assessment coverage. Sequence evaluation, ordering, richer staged guided items, additional transfer positions, and broader accepted alternatives remain future editorial work.
