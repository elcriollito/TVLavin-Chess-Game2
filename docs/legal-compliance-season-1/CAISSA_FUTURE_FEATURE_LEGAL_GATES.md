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
| Shared generative Mentor | Public UI exists; server path exists; production generative activation/provider state unproven | Verify flags, key and allowlisted model; AI disclosure; provider DPA/retention/training review; prompt/context minimization; safety/accuracy evaluation; cost/abuse controls; incident/kill switch | Product/privacy owner |
| Human-like conversational Mentor | Planned at most | Above plus EU AI Act Article 50 analysis, Colorado 2027 conversational-AI review, minor safety and no companionship/dependence marketing | AI/privacy counsel |
| Premium subscriptions | Dormant | Business/tax identity; Stripe approval/KYC; price/renewal/cancellation/refund terms; privacy; receipts; support; accessibility | Counsel + tax professional |
| Credit packages | Dormant | Define non-cash/non-transferable value; expiry/refund; minors; accounting/tax; insolvency/closure; wallet security | Counsel + accounting |
| Reactivate PayPal support | Owner decided to retire the presently live Hosted Button; retirement not yet deployed or dashboard-verified | Fresh purpose/business/tax review; PayPal account approval; accurate contribution or sale classification; pricing/frequency/refund disclosure; privacy and records; no charitable/tax-deductibility claim without authority | Product owner + consumer/tax counsel |
| Paid-entry/prize tournament | Planned | Gambling/contest opinion; provider approval; official rules; geography/age; tax/prize/refund/fair-play/dispute controls | Gaming counsel |
| Public forums/chat | Planned | Code, reporting/block/mute, moderation, DMCA/CSAM, minor safety, retention, appeals, DSA review if targeted to EU | Trust & safety owner + counsel |
| Direct/private messages | Planned | Communications-law review; truthful access/scanning notice; grooming/spam/report controls; retention/legal process | Privacy/T&S counsel |
| User media/attachments | Limited Scanner storage today | Rights license; takedown; malware/content scanning; size/type controls; privacy/biometric/geolocation stripping | Security/privacy owner |
| Native desktop/mobile app | Not found | App-store terms/privacy labels; code signing/updates; telemetry; GPL source/notices; platform age ratings | Release owner + license counsel |
| Paid PGN/books/vault | Commerce off | Collection-level rights certification; consumer license; download entitlement; tax/refund; DRM/privacy | Content owner + counsel |
| Advertising/targeted personalization | Not found | Consent/opt-out, state-law thresholds, minor bans, vendor contracts, profiling impact, cookie controls | Privacy counsel |
| Deliberate EU/UK offering | Not established | Territorial analysis; controller identity; lawful bases/rights; processors/transfers; representative if needed; DSA/AI/accessibility classification | EU/UK counsel |
| Game-fetch worker | Source exists; configured `workers.dev` host did not resolve and no active custom route was found | Confirm deploy need; reject nonnumeric/cost-amplifying limits; cap count/bytes; authentication/rate limiting; bounded caches; production security review | Security/release owner |
| Position-stat worker | Source exists; no production route or frontend consumer was found | Confirm deployment/data size; replace all-shard memory cache with bounded/indexed design; abuse controls; load test in an authorized environment | Security/release owner |

## PayPal retirement and future reactivation gate

The live support flow is not a future-only item: on 2026-10-25 production `/support` still presented the Hosted Button. The owner has decided to discontinue it. This audit changed documentation only; it did not remove code, change PayPal, or inspect transactions.

Retirement requires a separately authorized release that removes the button/controller and related public copy/CSP allowances, followed by a human PayPal-dashboard deactivation of the hosted button or payment link. Preserve any records legally required for refunds, disputes, accounting, tax or legal hold. Acceptance requires both production verification and direct-link/dashboard verification; removing only the website embed is insufficient.

Do not claim that no payment ever occurred, that money was or was not revenue, or that a contribution was charitable or tax-deductible without transaction and professional review. If PayPal is ever reactivated, conduct a fresh gate using the matrix above. See [Fla. Stat. Ch. 496](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0400-0499/0496/0496.html), [PayPal User Agreement](https://www.paypal.com/US/legalhub/paypal/useragreement-full?locale.x=en_US) and [PayPal AUP](https://www.paypal.com/us/legalhub/acceptableuse-full).

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

