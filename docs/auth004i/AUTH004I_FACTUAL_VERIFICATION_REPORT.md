# AUTH-004I factual verification report

Prepared: 2026-10-27  
Candidate base: `1a16a20b3677cba8c72578ad3409a43a845a9995`  
Certified runtime reviewed: `2e4e23b5c96e1724ae87735851ac9a7b77332b02`

This is a factual and technical review, not legal advice or a legal-compliance certification. No production system was changed.

## Verified processing

| Area | Verified current fact | Classification |
|---|---|---|
| Operator | CAISSA Chess is the service name of a free personal project individually operated by Alexander Lavin in Florida, United States; it is not a separate legal entity, LLC or corporation, and no active commercial revenue was identified. | FACT VERIFIED / OPERATOR APPROVED |
| Authentication | Clerk Production is configured for restricted sign-up. Email verification, session controls and CAPTCHA protections are configured. Google exists as a provider entry but its production custom credentials are not configured. | FACT VERIFIED |
| Google identity | The candidate requests only OpenID Connect identity scopes: `openid`, email and profile. Production activation remains a provider/configuration gate. | FACT VERIFIED / PROVIDER APPROVAL REQUIRED |
| Application data | Supabase project `jczauvkfkweuvdpurpem` is active in `us-east-1`. Browser access is deny-by-default on audited private tables; server service-role use is a privileged trust boundary. | FACT VERIFIED |
| Hosting and analytics | Vercel hosts the site and functions. The production-only analytics loader removes query strings and fragments and avoids known credential-bearing routes before loading Vercel Web Analytics. | FACT VERIFIED |
| Cloudflare | Cloudflare is used for authoritative DNS and selected gateway/download/security paths. The public privacy mailbox is routed without publishing its private destination. | FACT VERIFIED |
| Browser storage | Local/session storage is used for preferences, local profiles or legacy wallet state, navigation/onboarding, puzzle queues and temporary analysis/PGN handoffs. | FACT VERIFIED |
| CAISSA Online | Public nickname or fallback alias, rating/history, challenges, games, moves, clocks, results and game events can be stored. Email and private account name are not intended as public chess identity fields. | FACT VERIFIED |
| AI | The server can send prompts, message history and chess/engine context to Together AI, OpenAI, Anthropic or Meta's Llama API. A supplied provider key is forwarded for the request and is not intentionally stored in application database or browser storage. | FACT VERIFIED |
| Existing accounts | The 16+ decision governs new registration. Existing accounts are preserved; the code and draft do not infer or store a birth date for them. | FACT VERIFIED |

## Scanner truth

- Ordinary recognition sends the selected source image to a recognition function. Application code does not intentionally place that image in the Scanner database or evidence bucket.
- After recognition, the client submits a derived scan snapshot containing the image hash, proposed FEN, per-square predictions/confidence, orientation/localization diagnostics, client metadata and versions. This occurs independently of optional feedback.
- Optional feedback is account-gated, carries separate image/correction choices and starts `raw-unverified`. It is not automatically certified or used for training.
- The optional image upload and feedback-binding request are separate operations. A network interruption can leave a private, unbound image object. Stronger Privacy Season 2 binding and cleanup controls are not production behavior.
- Historical private-beta evidence remains quarantined. It must not be automatically certified, exported, trained on or deleted.

## External-source verification

- Florida Statutes §865.09 defines a covered “business” by dealing in a thing of value or rendering services for compensation. If the statute applies to use of a fictitious name, registration calls for the business mailing address and each registrant's name and address. The present free, uncompensated-project facts narrow but do not conclusively resolve applicability; this draft does not claim an exemption or publish an invented address.
- The approved legal operator identity and email contact satisfy the draft's factual identification goal. Whether another jurisdiction requires a postal notice address or a representative depends on applicability. For example, GDPR Article 13 requires the controller's identity and contact details when it applies, and Article 27 can require an EU representative when Article 3(2) applies unless an exception is met. CAISSA has not completed the jurisdiction-specific applicability analysis.
- Florida Digital Bill of Rights controller thresholds in §501.702 are not met on the verified project facts, but that does not answer every Florida privacy or consumer-protection obligation.
- Florida §501.1735 can apply to an online game likely to be predominantly accessed by children. Whether CAISSA meets that factual trigger is not established.
- FTC COPPA guidance permits a neutral age screen for a general-audience service, while actual knowledge of an under-13 user can trigger additional duties.
- Google requires an accurate homepage, privacy policy and terms URL on an authorized domain for an external production app; the privacy policy must explain access, use, storage and sharing of Google user data.

Official sources:

- https://leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0865/Sections/0865.09.html
- https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- https://wwwo.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.702.html
- https://www.flsenate.gov/Laws/Statutes/2026/501.1735
- https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- https://support.google.com/cloud/answer/15549049
- https://support.google.com/cloud/answer/13806988

## Evidence limitations

- Provider logs and every provider subprocessor were not opened record-by-record.
- No production data was opened, changed or deleted in this phase.
- No claim is made that staging controls or prepared migrations are active in production.
- This review cannot decide legal applicability, adequacy of remedies or contract enforceability.
