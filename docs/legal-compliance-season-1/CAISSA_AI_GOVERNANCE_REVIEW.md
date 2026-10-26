# CAISSA AI Governance Review

**Verified:** 2026-10-25
**Baseline:** `d7c48e52465b8764d102313c03cf639c38b3db6f`
**Decision:** local engine analysis and ordinary Scanner recognition may continue with accurate limitations; external generative AI, community-data training, and any materially new AI use remain activation-gated.

This is technical and regulatory issue-spotting, not legal advice. It does not certify compliance with an AI, privacy, consumer-protection or intellectual-property law.

## System boundary

| Capability | Current evidence | Data movement | Governance classification |
|---|---|---|---|
| Stockfish 18/19 and other local chess engines | Browser Worker/WASM assets are publicly served and used for play, analysis, Scanner follow-up and Mentor study evaluation | Positions and engine output remain in the browser unless the user deliberately submits or saves them elsewhere | Local deterministic software, not external generative AI; GPL/provenance duties still apply |
| Authored Mentor lessons, templates and local analysis | Static lessons, prompt templates, local Stockfish evaluation and client-memory conversation helpers exist | No provider call merely from opening the page or using a local lesson | Ordinary authored/local product logic |
| Scanner recognition | Public-beta status reports model `caissa-piece-classifier-v0.5-occupancy-recovery`; hosted ONNX inference is active | A canonical image representation is sent to CAISSA's Vercel recognition endpoint; ordinary recognition does not by itself authorize training or source-image retention | Narrow automated recognition; disclose transmission, fallibility and human-review requirement |
| Scanner feedback and image evidence | Account-gated correction/image paths, private Supabase storage and human certification states exist | Corrections and, only when separately chosen, source images may be stored for review | Optional contribution workflow; consent, rights, retention and deletion controls are incomplete |
| Shared generative Mentor | Authenticated `/api/mentor/chat` supports a server-held Together.ai key only when two exact feature gates and the key are present | Prompts, conversation context and optional chess evidence are sent through Vercel to Together.ai | Code exists; production activation and provider-account settings were not proven |
| BYO generative Mentor | Client/server allowlists contain Together.ai, Meta Llama, OpenAI and Anthropic endpoints/models | The submitted API key and prompt payload pass through CAISSA's Vercel function to the selected fixed provider endpoint | Code path exists; production feature-gate state was not proven; key handling and provider terms require review |
| Local LLM adapter | A localhost LM Studio-style endpoint is declared in client code | Intended for the user's local machine | Development capability; no production activation established |

## Prompt and data flow

The external Mentor request can contain:

- a CAISSA system instruction identifying the assistant as a concise chess-learning aid;
- the user's current message;
- up to ten recent user/assistant messages retained only in page memory on the Mentor page;
- when the user chooses a context-aware review, FEN, side to move, mode, SAN, classification, evaluation, mate value and principal variation;
- a user-approved prepared prompt containing imported PGN moves or a study position; and
- request metadata such as provider, model, token limits and usage data.

The browser sends this payload to `api/mentor/chat.js`. The server validates an allowlisted provider/model and forwards the messages to a fixed provider endpoint. Shared mode is Together.ai-only and is fail-closed behind `MENTOR_AI_ENABLED`, `MENTOR_SHARED_AI_ENABLED`, an allowlisted model and a server key. BYO mode transmits the user's key through the CAISSA server; source intends it to be request-memory-only and avoids logging it, but runtime/proxy/provider logging was not independently verified.

The economic reservation path can persist an encrypted, short-lived result for replay and records provider/model/usage/duration/result metadata. Exact production TTL, key management, provider retention, provider training use, abuse-monitoring retention and deletion controls were not verified. Therefore no public notice should promise that external prompts are never retained or never used for provider improvement unless current contracts and account settings substantiate that statement.

## User disclosure requirements

Before any external generative request is available, the interface and Privacy Policy should state, in context:

1. that the action uses an external generative-AI provider rather than only a local chess engine;
2. the current provider and model, or a stable way to identify them when selection is available;
3. what will be transmitted, including chat text, chess positions, PGN/game context and engine evidence;
4. that users must not submit secrets, sensitive personal information, private third-party communications or content they lack authority to share;
5. material provider retention/training/transfer terms and links, including the difference between shared and BYO modes;
6. whether and how CAISSA stores results, usage and conversation state;
7. that output can be inaccurate, fabricated, non-unique or unsafe and must be checked; and
8. how to report a harmful response and request deletion where available.

Opening Mentor, loading a local lesson, importing a PGN locally or running Stockfish must not be described as an external AI request. The current UI's “Shared AI” and “Local Game Review” distinction is a useful start, but it does not identify the provider, payload categories, retention or model provenance.

## Scanner training governance

Ordinary recognition, correction feedback, image evidence and training permission are separate events:

- **Recognition:** perform inference and return an unverified board. This is not consent to persist the source image or use it for training.
- **Correction feedback:** optionally retain corrected board/FEN and technical evidence under a disclosed improvement purpose.
- **Image evidence:** optionally retain the source image only after a separate affirmative choice and rights representation.
- **Certification:** a human reviewer determines whether evidence is accurate, authorized and eligible. User correction alone is not certification.
- **Training permission:** only an approved, versioned export manifest containing records with valid purpose-specific consent, rights and retention state may enter a training run.

Current public image upload can occur before consent is bound to feedback, has no feedback capability requirement and lacks orphan cleanup. This defeats a reliable consent chain even though later feedback attachment checks image consent. The public dataset was empty at the production review, but 96 historical private-beta objects remained. No automatic training path or online model update was found.

Source-image rights require more than the submitter's ability to upload. The contributor should represent that they created the image or have authority to license the relevant use and that it does not improperly contain third-party personal or protected material. Platform screenshots and the two reference-only/unverified piece-set families remain excluded from training or redistribution until their rights status is resolved.

## Model and data provenance

The deployed Scanner manifest records:

- model version `caissa-piece-classifier-v0.5-occupancy-recovery`;
- ONNX artifact SHA-256 `FFF4C633613997C7C29ACD31FB233CF9A2150D173AAB4E38E0BF650644485211`;
- source-state and TorchScript hashes;
- preprocessing version, input/output shapes, class order and occupancy threshold.

This is strong artifact identity, but a complete model card still needs the approved dataset manifest, record-level rights/consent lineage, train/validation/test split, evaluation limits, intended/prohibited uses, release approver and revocation cutoff. Protected validation/test images must never be promoted into training.

The generative Mentor model allowlist is code-level provenance, not operational proof. Provider/model IDs can be deprecated or silently served under changed terms. Each activation or model change needs a dated provider contract/DPA and model-card review plus an exact production configuration readback.

## Law, contract, policy and recommendation separation

| Type | Present conclusion |
|---|---|
| Law | Accurate claims and privacy disclosures may be required under applicable consumer/privacy law. COPPA applies if CAISSA is child-directed or has actual knowledge of under-13 collection. EU AI Act duties depend on territorial and role facts not established here. No finding classifies current chess analysis or Scanner as a prohibited or Annex III high-risk use. |
| Provider contract/product rule | AI-provider terms, DPA, retention/training settings, acceptable-use rules and age eligibility must be verified for the exact account and model before activation. Clerk's under-16 restriction separately controls accounts that reach generative features. |
| CAISSA product policy | Do not accept under-13 accounts, use a provisional 16+ account rule, keep community Scanner training frozen, distinguish local from external processing, and require human review of AI/Scanner output. |
| Recommendation | Maintain evaluations, red-team cases, prompt-injection defenses, incident handling, cost controls, model/data cards, change logs and a kill switch even when not independently mandated by a named statute. |

## Activation gates

### External generative Mentor

- Prove the production feature flags, provider, model, account settings, DPA/subprocessors, region, retention and training-use terms.
- Publish provider/payload/storage disclosures and a just-in-time notice before Send.
- Confirm account age eligibility and prohibit use by unauthorized minors.
- Review prompt-injection and untrusted PGN metadata handling; keep system and authority boundaries server-owned.
- Establish harmful-output reporting, incident escalation, abuse controls, evaluation thresholds and rollback.
- Ensure credits are accurately described as internal access state, not a purchased product, unless the commerce gate separately passes.
- Re-review territorial obligations before deliberate EU/UK or youth offering.

### Scanner community training

- Bind consent and policy version before or atomically with upload; require a feedback-bound upload capability and delete abandoned objects.
- Approve retention, deletion, withdrawal and model-version lineage rules.
- Verify contributor/source-image rights and exclude uncertain platform screenshots and reference-only artwork.
- Freeze a reproducible dataset manifest and protected benchmark; document evaluation and bias/error limits.
- Obtain human data-owner and counsel approval for the precise dataset/model release.

### Material model or purpose change

Any new provider, model family, fine-tuning, prompt logging, persistent memory, voice/image generation, user profiling, automated moderation/enforcement, public accusation, companion/dependence framing or decision affecting access/rights requires a new impact review before activation.

## Unverified matters

- Production Mentor environment variables, provider account, model actually served and whether any user request has occurred.
- Provider-side prompt/output retention, training use, abuse review and deletion behavior.
- Exact production result TTL and encryption-key rotation evidence.
- Record-level consent/rights eligibility for the historical Scanner corpus.
- Territorial facts for EU/UK AI/privacy law and audience facts for child-specific obligations.
- No private prompts, provider dashboards, transaction records or Scanner image contents were inspected.
