# CAISSA Future Feature Legal Gates

**Verified:** 2026-10-25  
This document is a pre-launch checklist, not a statement that future-feature laws apply today.

## Gate matrix

| Feature | Present status | Activation gates | Approval |
|---|---|---|---|
| Reopen account registration | Paused | Public reviewed policies; enforced age rule; consent/version evidence; account deletion/export runbook; Google OAuth validation | Product owner + privacy counsel |
| Accounts aged 13–15 | Not approved | Clerk written approval; VPC evidence if required by Clerk; youth impact assessment; parent/minor rights; data minimization | Clerk + child-privacy counsel |
| Under-13 accounts | Not authorized | Full COPPA program, direct notice, FTC-compliant VPC, parent controls, vendor support, deletion/security, child-directed design review | Child-privacy counsel |
| Public Scanner image intake | Technically implemented, empty public dataset | Consent-before-upload; orphan cleanup; rights representation; retention/deletion; age rule; reviewer operations | Privacy/data owner |
| Train Scanner model on community evidence | Not performed | Certified immutable dataset; rights/consent; revocation cut; benchmark isolation; model/data card; license/security review | Data owner + counsel |
| Shared generative Mentor | Code exists; live state unproven | AI disclosure; provider/DPA/retention review; prompt privacy; safety/accuracy limits; cost controls; incident path | Product/privacy owner |
| Human-like conversational Mentor | Planned at most | Above plus EU AI Act Article 50 analysis, Colorado 2027 conversational-AI review, minor safety and no companionship/dependence marketing | AI/privacy counsel |
| Premium subscriptions | Dormant | Business/tax identity; Stripe approval/KYC; price/renewal/cancellation/refund terms; privacy; receipts; support; accessibility | Counsel + tax professional |
| Credit packages | Dormant | Define non-cash/non-transferable value; expiry/refund; minors; accounting/tax; insolvency/closure; wallet security | Counsel + accounting |
| Recurring PayPal support | Not established | Authorization, amount/frequency/duration disclosure, simple online cancellation, ROSCA and Florida auto-renewal review | Consumer counsel |
| Paid-entry/prize tournament | Planned | Gambling/contest opinion; provider approval; official rules; geography/age; tax/prize/refund/fair-play/dispute controls | Gaming counsel |
| Public forums/chat | Planned | Code, reporting/block/mute, moderation, DMCA/CSAM, minor safety, retention, appeals, DSA review if targeted to EU | Trust & safety owner + counsel |
| Direct/private messages | Planned | Communications-law review; truthful access/scanning notice; grooming/spam/report controls; retention/legal process | Privacy/T&S counsel |
| User media/attachments | Limited Scanner storage today | Rights license; takedown; malware/content scanning; size/type controls; privacy/biometric/geolocation stripping | Security/privacy owner |
| Native desktop/mobile app | Not found | App-store terms/privacy labels; code signing/updates; telemetry; GPL source/notices; platform age ratings | Release owner + license counsel |
| Paid PGN/books/vault | Commerce off | Collection-level rights certification; consumer license; download entitlement; tax/refund; DRM/privacy | Content owner + counsel |
| Advertising/targeted personalization | Not found | Consent/opt-out, state-law thresholds, minor bans, vendor contracts, profiling impact, cookie controls | Privacy counsel |
| Deliberate EU/UK offering | Not established | Territorial analysis; controller identity; lawful bases/rights; processors/transfers; representative if needed; DSA/AI/accessibility classification | EU/UK counsel |

## Current PayPal support gate

The live support flow is not a future-only item. Until reviewed, use wording materially equivalent to:

> Support CAISSA Chess. CAISSA Chess is a personal project, not a charity or tax-exempt organization. Contributions are voluntary, are not tax-deductible as charitable contributions, and do not purchase features, services, membership or preferential treatment. Payments are processed by PayPal, whose terms and privacy practices apply.

Use “one-time voluntary contribution” only after confirming recurring payments are disabled. Do not issue charitable receipts or connect contributions to premium access, ratings, tournament entry or support priority. Florida charitable-solicitation classification deserves counsel review if any appeal suggests an educational, philanthropic or charitable purpose. See [Fla. Stat. Ch. 496](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0496/0496.html), [PayPal User Agreement](https://www.paypal.com/US/legalhub/paypal/useragreement-full?locale.x=en_US) and [PayPal AUP](https://www.paypal.com/us/legalhub/acceptableuse-full).

## Subscription and auto-renewal requirements

Before recurring subscriptions:

- clearly disclose price, frequency, term, material conditions, trial conversion, renewal and cancellation before consent;
- obtain affirmative, unambiguous consent separately from unrelated terms;
- send durable confirmation and receipt;
- provide cancellation at least as easy as enrollment;
- honor refund/chargeback and support obligations;
- retain consent and cancellation evidence;
- review federal ROSCA and [Florida's automatic-renewal statute, §501.165](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.165.html).

The FTC's 2024 negative-option amendment was vacated, and the pre-amendment rule was restored in 2026. Do not cite the vacated “click-to-cancel” amendment as current law; easy cancellation remains the prudent product requirement and other statutes/contract rules still apply.

## Tax and entity readiness

No audit evidence establishes a current company or taxable-sales classification. Before commercialization:

1. choose the operating/legal name and business form with Florida and tax professionals;
2. determine whether a fictitious-name registration is required;
3. obtain tax identifiers and provider KYC as necessary;
4. classify digital subscriptions, downloads, credits, contributions and prizes under Florida and other applicable tax rules;
5. configure nexus monitoring, receipts, refunds, books and 1099-K reconciliation;
6. never assume that absence of a tax form makes receipts non-taxable.

## Accessibility release gate

Use WCAG 2.2 AA as the common engineering target:

- complete keyboard-only and screen-reader journeys for sign-up/sign-in, chessboard moves, dialogs, purchases and cancellation;
- provide focus visibility/order, status announcements, text alternatives, error identification and adequate contrast;
- test mobile/touch targets and orientation;
- caption owned video and provide equivalent text for essential visual instruction;
- publish no conformance claim without a representative manual audit and defect plan.

## Gate evidence template

Every activation decision should record:

- feature/version and owner;
- jurisdictions intentionally served;
- users, age bands and data categories;
- provider approvals and contracts;
- legal rule versus provider contract versus internal policy;
- required public disclosures and consent evidence;
- security/accessibility test results;
- rollback/kill switch;
- human approver and date;
- unresolved limitation and next review date.

