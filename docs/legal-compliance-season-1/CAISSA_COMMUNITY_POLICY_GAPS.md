# CAISSA Online Chess and Community Policy Gaps

**Verified:** 2026-10-25  
**Current posture:** Online chess and public identities exist at minimal production use; a full public forum, broad CAISSA chat and direct messaging are not established as active products.

## Current controls

- Server-authoritative chess legality and participant checks.
- Participant-scoped game and Realtime access.
- Rated guest play disabled.
- Public identity/display-name abstraction rather than exposing email or Clerk identifiers.
- Database-backed roles and reviewer/owner privileges.
- Feature flags and rollback procedures for Online/Play.

These controls do not replace user-facing rules, moderation procedures or privacy retention.

## Current gaps

| Gap | Risk | Classification | Minimum control |
|---|---|---|---|
| No unified community code | Inconsistent enforcement and user expectations | CURRENT RISK / REVIEW | Prohibited conduct, scope, sanctions and contact |
| No public fair-play procedure | Defamation and arbitrary-action risk | CURRENT RISK / REVIEW | Private evidence, human review, no public accusations, appeal |
| Display-name rules incomplete | Impersonation, hate, doxxing, trademark abuse | CURRENT RISK / REVIEW | Naming standard and rename/suspension tools |
| Reporting/blocking/muting not complete | Harassment exposure | FUTURE GATE for growth/chat | In-product report; block/mute; urgent escalation |
| Moderator permissions/evidence retention undefined | Excess access and inconsistent records | FUTURE GATE | Least privilege, audit logs, retention and training |
| Online guest cleanup absent | Persistent anonymous accounts/data | CURRENT RISK / REVIEW | Expiry and deletion job; abuse-resistant guest creation |
| DMCA process not established | Loss of §512(c) safe-harbor option for stored user material | CURRENT RISK / REVIEW | Takedown/counter-notice/repeat-infringer process; agent decision |
| CSAM escalation not documented | Mishandling and delayed statutory report after actual knowledge | CURRENT REQUIRED if actual knowledge occurs | Restricted escalation, preservation and NCMEC reporting procedure |
| Private-message design absent | Communications privacy and false “private” claims | FUTURE GATE | Access/scanning notice, retention, lawful disclosure, reporting |

## Proportionate community rules

Before expanding social features, publish rules that prohibit:

- harassment, threats, stalking, hate, sexual exploitation and encouragement of self-harm;
- doxxing, personal-data disclosure and account impersonation;
- cheating, engine assistance where prohibited, rating manipulation, collusion and evasion;
- unlawful, infringing, malicious or deceptive content;
- spam, credential theft, malware and off-platform payment solicitation;
- grooming or unsafe adult/minor contact;
- abuse of reports, appeals or moderator identities.

State that enforcement may include content removal, feature limits, game annulment, rating action, warning, suspension or account termination. Reserve flexibility without promising unlimited monitoring or perfect detection.

## Fair-play framework

1. Automated analysis creates a private signal, not a public verdict.
2. A qualified reviewer checks game context, statistical confidence, data quality and alternative explanations.
3. Evidence is minimized, access-controlled and retained for an announced period.
4. The user receives a meaningful notice unless doing so would compromise security or a lawful investigation.
5. A different reviewer handles a proportionate appeal.
6. Public profiles should not display “cheater” accusations. Publish aggregate transparency data only when de-identified and statistically responsible.
7. Prize/paid-entry cases require a stricter published rulebook and independent review.

## US intermediary, copyright and communications issues

- [47 U.S.C. §230](https://uscode.house.gov/view.xhtml?req=%28title%3A47+section%3A230+edition%3Aprelim%29%29) can protect a provider from being treated as publisher of third-party content and separately protects good-faith moderation. It is not blanket immunity and does not displace federal criminal law, intellectual-property law, ECPA or specified sex-trafficking claims.
- [17 U.S.C. §512](https://uscode.house.gov/view.xhtml?req=%28title%3A17+section%3A512+edition%3Aprelim%29) safe harbor is conditional on a designated agent, notices/counter-notices, expeditious response, repeat-infringer policy and other requirements. Failure to register does not itself prove infringement, but loses that statutory protection.
- A Copyright Office DMCA-agent filing can disclose the provider's legal name and street address. A professional third-party agent can reduce public agent exposure but does not automatically eliminate provider identity/address requirements. Review this before filing.
- Under [18 U.S.C. §2258A](https://uscode.house.gov/us/usc/119-118/t18/s2258A/), a covered provider with actual knowledge of apparent specified child-exploitation offenses must report to NCMEC as soon as reasonably possible. There is no general federal duty in that section to proactively monitor. Moderators should not redistribute or conduct amateur investigations.
- Private chat raises [18 U.S.C. §§2511 and 2702](https://uscode.house.gov/us/usc/119-121/t18/s2702/) questions about interception and disclosure. Explain automated/human access accurately and define emergency/legal-process handling.

## Tournaments and prizes

Free ordinary chess games are not classified as gambling merely because players compete. Before any entry fee, wager, prize pool, randomized promotion or sponsor contest:

- obtain Florida gaming/contest counsel review, including [Fla. Stat. §849.14](https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0849/Sections/0849.14.html) and, if chance promotions are involved, §849.094;
- obtain Stripe/PayPal written approval for the exact skill-game activity;
- publish eligibility, geography, rules, tie-breaks, anti-cheat, refunds, taxes, prize delivery and dispute process;
- exclude minors unless a specifically approved framework exists;
- geofence ineligible jurisdictions and keep player funds separate as legally required.

## Future launch checklist

### Public forum/chat

- Code of Conduct and Terms accepted with version evidence.
- Report, block and mute available before launch.
- Moderator roles, training, audit logs and least privilege.
- Appeals and emergency escalation.
- Copyright, CSAM and law-enforcement request runbooks.
- Minor-safety design and no targeted-ad engagement.
- Retention and deletion for content, reports and sanctions.
- DSA classification if deliberately offering a hosting/platform service in the EU.

### Direct messages

- Separate threat/abuse model, spam and grooming controls.
- Accurate privacy promise; no end-to-end-encryption claim unless technically true.
- Message access, automated scanning, report-copy and deletion rules.
- Rate limits, block controls and attachment restrictions.
- Clear minimum age and default protections for minors.

## Acceptance criteria

Community features remain feature-gated until a named human owner approves rules, tooling, staffing and incident paths. A static policy without operational moderation capacity is not sufficient.

