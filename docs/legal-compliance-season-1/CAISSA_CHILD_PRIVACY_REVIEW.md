# CAISSA Child Privacy Review

**Verified:** 2026-10-26
**Owner policy:** accounts are provisionally 13+; under-13 accounts are reserved for a future CAISSA Junior program.
**Current fact:** registration is paused; no certified age gate exists.

## Findings

### AUTH-001 - Clerk under-16 contract conflict (material)

Clerk's terms updated October 1, 2026 prohibit sending or storing personal information of an end user under 16 without evidence of verifiable parental consent compliant with applicable law. The owner's 13+ policy therefore cannot be implemented for ages 13-15 through the current Clerk production instance unless CAISSA obtains a written provider resolution or runs a valid parental-consent program accepted by Clerk. This is a provider-contract gate distinct from COPPA's under-13 threshold.

### CHILD-001 - No production age control

No production neutral age screen or certified age-verification mechanism was found. Clerk legal consent is disabled; sign-up is restricted/paused. Policies must not claim age verification exists. Before registration reopens, define an eligibility decision and enforce it both before account creation and in server-side account provisioning.

### CHILD-002 - CAISSA Junior is future only

COPPA governs child-directed services and general-audience services with actual knowledge that personal information is collected from a child under 13. A checkbox alone is not a complete program. CAISSA Junior requires verifiable parental consent, direct parent notice, parent review/deletion controls, collection minimization, security, retention schedules, processor contracts and a child-safety design before activation.

### CHILD-003 - Florida users under 18

Florida section 501.1735 applies to an online platform, including an online game, likely to be predominantly accessed by children. It regulates unnecessary collection/retention, profiling, precise geolocation, dark patterns and reuse. Whether CAISSA meets the "predominantly accessed" condition is unknown. Counsel should review audience facts before registration expansion, community features or targeted youth marketing.

## Current account release options

| Option | Consequence | Recommendation |
|---|---|---|
| 16+ registered accounts; public anonymous tools remain available where appropriate | Aligns with current Clerk contract; excludes 13-15 accounts | Lowest-complexity interim path; counsel/owner approval |
| 13+ with a different architecture/provider that contractually permits it | Requires provider migration and privacy/security review | Consider only as separate project |
| 13-15 with verifiable parental consent and Clerk written acceptance | Significant identity, consent, deletion and support burden | Do not implement casually; counsel required |
| Maintain registration pause | Preserves existing accounts; no new signup | Safe temporary posture while AUTH-004 is resolved |

Do not silently change or delete existing accounts. Existing users' ages are unknown; establish a privacy-preserving remediation protocol rather than requesting dates of birth from everyone without need.

## Neutral screening design

If approved, ask only the minimum information needed, preferably an age band rather than date of birth. Do not bias the prompt toward an eligible answer. Separate the result from a public profile, restrict access, define retention, and ensure a failed eligibility result does not create a Clerk account or persist unnecessary information. Age estimation/verification technology requires separate privacy, security, accuracy and vendor review.

## Actual-knowledge response

When credible information establishes a user is under the permitted age: restrict further collection and public interaction; preserve only narrowly necessary security evidence; notify the designated operator; verify parent/user requests safely; delete or isolate information through Clerk, Supabase, Storage and processors according to counsel-approved rules; document the decision without storing excessive child data.

## CAISSA Junior mandatory checklist

- Written child-directed scope and age bands; qualified counsel approval.
- COPPA-compliant notice and verifiable parental consent before collection.
- Parent relationship, access, correction, deletion and consent-revocation workflows.
- No public profiles, messaging, image upload, community feedback, behavioral analytics or external AI by default.
- Data minimization, short retention and automatic deletion; no indefinite child records.
- Child-appropriate reporting, blocking, moderation and emergency escalation.
- Processor review: Clerk/provider acceptance, DPAs, child-data restrictions and subprocessor map.
- Security threat model, abuse testing, access logging and incident playbook.
- No advertising/marketing profiling or dark patterns.
- Accessibility and age-appropriate language review.

## Primary sources

- [FTC COPPA compliance guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- [FTC 2025 COPPA Rule amendments](https://www.ftc.gov/legal-library/browse/federal-register-notices/16-cfr-part-312-coppa-final-rule-amendments)
- [Clerk Standard Terms](https://clerk.com/legal/standard-terms)
- [Florida section 501.1735](https://www.flsenate.gov/Laws/Statutes/2026/501.1735)

