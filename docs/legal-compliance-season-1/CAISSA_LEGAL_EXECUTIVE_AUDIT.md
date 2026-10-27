# CAISSA Legal & Compliance Season 1.0 - Executive Audit

**Audit date:** 2026-10-26 (America/New_York)
**Production baseline:** `main` at `6e912be5c314080be8944efde261b8dc133452a6`
**Current Vercel deployment:** `dpl_8nwALfzyrVugZeqksfiAwvUecgUJ`
**Operator facts supplied by owner:** personal, free project operated by an individual; no LLC/corporation; no active subscriptions or commercial revenue.
**Public contact:** `privacy@caissa-chess.org`

This is an engineering and governance audit, not legal advice or a legal certification.

## Outcome

The audit is complete enough for human review. Material legal and provider-contract questions remain; production was not changed.

The current public service can continue operating cautiously while registration remains paused, provided no unsupported compliance claim is made. Before Google OAuth or general registration is released, CAISSA needs truthful public Privacy and Terms pages, matching Google branding links, configured production OAuth credentials, and a decision on the conflict between the owner's provisional 13+ policy and Clerk's current prohibition on storing personal information of end users under 16 without evidence of verifiable parental consent.

Scanner recognition may remain a public beta, but optional image contribution and future training are not the same purpose. Current `main` permits authenticated image upload before consent is bound to feedback and lacks operational retention/deletion and durable quota controls. Privacy/Security Season 2 contains relevant remediation, but it is unmerged and unapplied and therefore is not credited as production control.

## Verified production facts

- The Accessibility 001B SHA remains the current production commit. The deployment ID in the original prompt was stale; the current ready deployment is listed above.
- `/`, `/scanner`, `/signin`, `/signup`, and `/help` returned 200. `/privacy` and `/terms` returned 404.
- `/signup` states that registrations are paused.
- Scanner status reports public beta, classifier `caissa-piece-classifier-v0.5-occupancy-recovery`, localizer v4, and JPEG/PNG/WebP support.
- Current public route contract: 78 destinations, 39 primary navigation entries, 18 redirects, and 5 protected route families.
- PayPal support has been removed from the current production flow. It is retired, not an active payment service, and must not be restored by this season.
- Production Supabase contained 14 user rows, private Scanner buckets, 96 historical private-beta image objects, and no public feedback images at inspection time.
- Clerk Production has restricted sign-up, Google enabled but without custom credentials, no configured Privacy/Terms URLs or legal-consent capture, and a seven-day maximum session lifetime.

## Current requirements and review items

| ID | Classification | Conclusion | Gate |
|---|---|---|---|
| LEGAL-001 | CURRENT REQUIRED / provider gate | Publish accurate Privacy and Terms pages before public OAuth/registration; current routes are 404. | AUTH-004 release |
| AUTH-001 | CURRENT RISK / REVIEW | The owner's provisional 13+ rule conflicts with Clerk's under-16 contractual restriction unless verifiable parental consent evidence or a written provider resolution exists. | Registration reopening |
| AUTH-002 | CURRENT REQUIRED / provider gate | Production Google OAuth needs valid custom credentials, matching redirect, production publishing status, verified-domain branding, and basic identity scopes only. | Google sign-in |
| DATA-001 | CURRENT RISK / REVIEW | There is no coordinated account access/export/deletion workflow across Clerk, Supabase, Storage and processors. | P0/P1 |
| SCAN-001 | CURRENT RISK / REVIEW | Current optional image upload is not atomically preceded by consent and can create orphan objects. | New image contribution |
| SCAN-002 | FUTURE ACTIVATION GATE | Raw feedback, certification, dataset export, training and model deployment require separate approvals and evidence. | Any training |
| SEC-001..005 | SECURITY FINDINGS | Current public services have resource-governance weaknesses described in the security review. | P0 hardening; no access-control bypass authorized |
| IP-001..004 | CURRENT RISK / REVIEW | Root licensing, consolidated notices, exact engine source correspondence and some dataset/media rights need closure. | Distribution/commercialization |
| A11Y-001 | BEST PRACTICE / applicability review | Accessibility 001B is released and tested, but it is not a whole-site WCAG conformance certification. | Continuous regression program |
| FL-001 | CURRENT RISK / REVIEW | Current free facts do not clearly establish a Florida fictitious-name filing duty; monetization or compensated services trigger re-review. | Human/counsel decision |

## Jurisdiction conclusions

- Florida's fictitious-name statute defines business around dealing in value or compensated services. The verified free/no-revenue facts materially narrow the present filing case; they do not create a permanent exemption.
- Florida's Digital Bill of Rights controller definition requires, among other elements, more than $1 billion in global gross annual revenue and specified business models. CAISSA does not meet that definition on verified facts.
- Florida breach law applies to defined commercial/governmental covered entities; applicability to this free personal project is fact-sensitive. Its requirements should still inform the incident plan without being represented as conclusively applicable.
- Florida section 501.1735 can cover an online game predominantly accessed by children under 18. Whether CAISSA is predominantly accessed by children is unknown; age-distribution evidence and counsel review are needed before dismissing it.
- COPPA applies to child-directed services and general-audience services with actual knowledge of under-13 users. CAISSA Junior cannot launch without a full child-privacy design.
- GDPR/UK GDPR applicability depends on offering to or monitoring people in those territories, not mere website accessibility. Geographic targeting and user facts are not established.

## Proportional roadmap

**P0:** publish accurate legal pages through AUTH-004; resolve the 13-15/Clerk contract gate; verify Google production configuration; adopt an operator incident/rights-request runbook; merge and deploy Scanner/security controls only through their own approved release process.

**P1:** establish retention/deletion criteria, processor register, consolidated third-party notices, exact engine provenance, community reporting/appeals, dependency triage, and recurring accessibility/security checks.

**P2:** enforce explicit activation gates for Junior, forums, paid services, prizes, external generative AI, community training data, desktop apps, partnerships and Market Reader.

## Human decisions

1. Obtain qualified advice on whether to keep 13+ while using a different provider/consent architecture, raise registered-account eligibility to 16+, or implement a verified parental-consent program for 13-15 with Clerk's written acceptance.
2. Approve the truthful Privacy and Terms drafts and operator description without publishing a residential address unless counsel determines one is required.
3. Decide whether current/future user-hosted material justifies a DMCA agent and repeat-infringer process.
4. Decide the original CAISSA source license and approve the copyright-holder identity used in a root license.
5. Approve retention/deletion criteria for historical Scanner beta evidence before any new training or broad image intake.

## Evidence and companion reports

All findings and source identifiers are indexed in [CAISSA_LEGAL_AUDIT_EVIDENCE_INDEX.md](CAISSA_LEGAL_AUDIT_EVIDENCE_INDEX.md). The package contains the 17 required reports. No policy publication, production deployment, migration, account change, secret change, model training, Clerk/Google/DNS mutation, or Market Reader modification occurred.

