# CAISSA Child Privacy Review

**Verified:** 2026-10-25  
**Current product position:** general-audience chess service; new registration paused; under-13 accounts are not authorized.

## Decision

The supplied provisional 13+ account rule is not ready for production. Clerk's current Standard Terms prohibit sending or storing personal information of users under 16 without evidence of verifiable parental consent. CAISSA has no production age screen, no stored age band, no parental-consent evidence system, and no account-wide deletion workflow.

Use **16+ for account registration** unless Clerk supplies written clarification/approval and a compliant process is implemented. Anonymous use of low-risk, non-account chess tools can remain available without inviting age disclosure, subject to data minimization and audience monitoring. Do not enable under-13 registration.

## Current controls and gaps

| Surface | Current evidence | Assessment |
|---|---|---|
| Clerk sign-up | Production `sign_up_mode` is restricted; `/signup` explains registration is paused | Strong temporary mitigation for new accounts |
| Existing accounts | 14 production account rows; no verified age attribute | Ages unknown; do not infer all are adults |
| Age screen | None in production; draft candidate proposes neutral age band | Missing. A neutral screen avoids encouraging circumvention, but it is not parental consent |
| Legal consent | Clerk legal-consent feature disabled; privacy/terms URLs unset | Missing policy acceptance/version evidence |
| Google OAuth | Enabled for sign-in | OAuth must not bypass the age rule; provider birthdate should not be requested unless necessary and approved |
| Anonymous play/tools | Many features work without account | Lower collection risk; hosting/security logs still exist |
| Online identity | Display names, ratings, presence and match records exist | Minor-safety rules and profile minimization needed before youth access/growth |
| Messaging/chat | Broad public community and DMs not active; some Classic/FICS interaction surfaces exist | Future gate; FICS is a third-party community context |
| Scanner feedback/images | Authenticated feedback and image upload paths exist | Child image contribution should remain unavailable unless age/consent/rights controls are resolved |
| Analytics/cookies | No broad advertising profile was established; Clerk/session and local state exist | Publish an accurate cookie/storage inventory; avoid targeted advertising to minors |

## Legal and contractual analysis

### COPPA

COPPA applies to an online service directed to children under 13, or a general-audience service with actual knowledge that it is collecting personal information from a child under 13. The audit did not establish that CAISSA is child-directed. Chess appeal alone is not dispositive; marketing, imagery, language, audience composition, store placement and actual knowledge matter.

If CAISSA learns an account user is under 13, do not simply preserve the account under a checkbox. Disable collection/account access as appropriate, minimize preservation, contact a verified parent only through an approved flow, and delete unless valid consent and an under-13 program exist.

A future under-13 program needs direct parental notice, verifiable parental consent, parental access/deletion, limited collection, reasonable security, retention limits and vendor capability. [FTC COPPA guidance](https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy) and the [COPPA Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312) are controlling federal sources.

### Clerk contract

Clerk's [Standard Terms](https://clerk.com/legal/terms) impose an under-16 personal-information restriction absent evidence of verifiable parental consent. This is more restrictive than the proposed 13+ rule and functions as the immediate launch gate even though COPPA's child threshold is under 13.

### Florida

[Florida Statutes §501.1735](https://www.flsenate.gov/Laws/Statutes/2026/501.1735) covers a social-media platform, online game or online gaming platform providing a service, game or feature likely to be predominantly accessed by children (under 18). It restricts unnecessary collection/retention, harmful or incompatible use, profiling, precise geolocation and dark patterns. Current applicability is **UNKNOWN**, because audience composition and “predominantly accessed” facts were not established.

Record audience evidence rather than declaring the statute inapplicable. Do not add engagement dark patterns, unnecessary notifications, precise location, targeted advertising or profiling for minors.

Florida §501.1736 has a narrower composite “social media platform” definition involving substantial under-16 use, algorithmic selection and listed engagement features. Current CAISSA facts do not show those predicates. Reassess if recommendation feeds, reactions, push notifications, autoplay or livestreaming launch.

### International

If GDPR applies, Article 8 sets 16 as the default age for a child's own consent to information-society services, while Member States may lower it to 13. The UK age is 13. These rules concern consent as a legal basis and do not override provider terms, child-directed design duties or the need for another lawful basis. Do not use a single global checkbox as a substitute for country-specific analysis.

## Recommended age flow

1. Before OAuth or account creation, present a neutral age-band screen: “Under 13,” “13–15,” and “16 or older.” Do not collect full date of birth unless a documented need outweighs the privacy cost.
2. Under current provider terms, only “16 or older” may continue.
3. “13–15” receives a clear unavailable message pending a verified consent program; do not create a Clerk user or store the attempted age with an identity unless counsel approves a minimal fraud-prevention record.
4. “Under 13” receives an unavailable message with no invitation to misstate age and no child email collection.
5. Store the minimum durable proof: age band, policy version, timestamp and method. Never expose it publicly.
6. Apply the same gate to password and Google OAuth paths.
7. Provide an operator procedure for incorrect age, suspected underage accounts and deletion.

## Future parental-consent gate

Before supporting anyone under 16:

- obtain Clerk's written confirmation that the proposed evidence and flow meet its contract;
- select an FTC-recognized VPC method appropriate to the processing risk;
- authenticate the parent separately and retain consent evidence without excessive identity data;
- provide parent notice, review, revocation and deletion controls;
- disable Scanner image contribution, generative AI, public profile discovery, chat and marketing by default unless separately justified;
- define school/teacher scenarios separately; a teacher's authority is not universal parental consent;
- complete a child-data impact assessment, vendor assessment and abuse-response plan;
- test that OAuth, invite, API and guest paths cannot bypass the age decision.

## Acceptance criteria

- New registration remains paused until a reviewed public policy set and age rule exist.
- Production has one enforced minimum age across Clerk, Google OAuth, server sync and user messaging.
- No full birthdate is collected without approved necessity and retention.
- No under-13 personal information is intentionally accepted.
- Existing accounts receive a proportionate age-confirmation/migration plan without public exposure.
- Policy text distinguishes current general-audience operation, actual knowledge and future child-directed features.

