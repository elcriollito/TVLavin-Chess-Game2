# AUTH-004 Legal Blocker Analysis

**Verified:** 2026-10-25  
**Scope:** analysis only. The existing authentication release candidate was not modified.

## Bottom line

The AUTH-004B draft is useful prepublication work, but it is not ready to publish or use to reopen registration. It omits the live PayPal support flow, uses a 13+ posture that conflicts with Clerk's current under-16 contract restriction absent VPC, contains provisional retention statements that are not operationally implemented, and leaves operator identity, liability, governing law, policy-change and appeal decisions unresolved.

Google OAuth has a narrower true blocker set than the whole legal roadmap. Future community, subscription, tournament, model-training and comprehensive accessibility work should not be mislabeled as Google OAuth blockers.

## Dependency matrix

| Target | True blockers | Required but can follow separately | Not a blocker |
|---|---|---|---|
| Publish Privacy Policy | Accurate live data/provider inventory; controller/operator presentation; contact; age rule; Scanner image/retention truth; PayPal disclosure; effective date; rights/request method | Self-service account center; final global-law coverage; DMCA registration | Forums, paid tournaments, under-13 launch, native apps |
| Publish Terms | Operator/contracting-party presentation; 16+ account rule under current Clerk terms; acceptable use; IP/user-content license; AI/Scanner limits; live PayPal wording; liability/governing-law/dispute review | Full community appeals tooling if clearly gated; subscription terms while sales disabled | Future premium, prize tournament and DM features |
| Google OAuth branding submission/publication | Public accurate homepage and Privacy Policy on verified domain; accurate app name/logo/support contact; requested scopes match actual need; authorized domains/redirect URIs; data-use/deletion/revocation explanations | Public Terms is strongly recommended and may support trust/Clerk consent, but Google policy's core privacy requirement is distinct | Scanner model governance, GPL cleanup, WCAG-wide audit, tournament rules |
| Clerk Google Sign-In | Production Clerk/Google credential and redirect match; OAuth path cannot bypass enforced age rule; public policies; session/account support; legal-consent decision | Account self-service improvements; expanded vendor register | Paid-commerce gates |
| Reopen sign-up | All applicable OAuth/Clerk items; reviewed policies; minimum age enforcement; consent/version record; privacy request/account closure operator workflow | Automated self-service export/deletion if manual process is truthful and reliable | Forums, subscriptions, under-13 support |
| Scanner public recognition | Truthful raw/unverified notice; inference privacy description; security/cost controls proportionate | Whole-account deletion automation | Payment/community work |
| Scanner image feedback | Above plus consent-before-upload, rights representation, retention/deletion, eligible account age, reviewer operations | Future model training system | Premium/subscription work |
| Existing active services | Publish legal baseline, correct PayPal wording, incident/privacy request contacts | Broader governance roadmap | Future-only product policies |

## Findings in the AUTH-004B candidate

### Strong foundations

- Registration remains paused.
- Proposed age screen is neutral and stores an age band rather than full birth date.
- Drafts are explicitly marked prepublication.
- Source notes identify unresolved retention, operator identity/address, liability, governing law, policy changes and appeals rather than silently inventing answers.

### Blocking mismatches

1. **Age:** 13+ is not approvable under the current Clerk contract without the required under-16 consent evidence or written provider resolution.
2. **Payment:** the drafts describe the product as free/no paid services but do not explain the active PayPal contribution flow. “No subscription” can remain true; “no payment processing” cannot.
3. **Retention:** the draft cannot promise deletion schedules or account deletion mechanisms that do not exist.
4. **Scanner:** upload can occur before image consent is bound. Policy wording must reflect actual processing or the code must be corrected before publication.
5. **Operator identity:** “CAISSA Chess” is the public brand, but counsel must decide the legally sufficient contracting/controller identification without unnecessarily exposing personal information.
6. **Google facts:** actual branding/verification/scopes/redirects and revocation configuration need an external console check; repository text is not sufficient.

## Minimum publishable policy decisions

### Privacy Policy

- State who operates the service using counsel-approved wording and the official privacy contact.
- Enumerate Clerk, Google, Supabase, Vercel, Cloudflare, PayPal and activated AI providers by role.
- Distinguish local-only chess data, server processing, persisted account data, private Scanner images and operational logs.
- State current account minimum age truthfully.
- Describe actual retention criteria and manual request handling; do not promise nonexistent self-service or absolute deletion.
- Explain international processing without claiming GDPR applicability or compliance unless the territorial analysis is complete.
- Describe cookies/local storage/session technology and provider links.

### Terms

- Personal-project identity and eligibility.
- Acceptable use, fair play, usernames and prohibited conduct.
- User-content rights representation and limited license for requested processing.
- Scanner correction/image purposes and no automatic training promise.
- AI and engine output limitations.
- Voluntary PayPal contribution: non-charitable, non-tax-deductible, no benefits; PayPal terms apply.
- No active subscription/credit sale; future sales require new terms and affirmative activation.
- Warranty/liability, termination, changes, governing law and dispute terms reviewed by counsel.

## Google-specific acceptance criteria

- Homepage, Privacy Policy and support contact load without authentication from the verified production domain.
- Branding exactly matches the user-facing app and does not imply Google endorsement.
- Only scopes used by the product are requested; displayed consent-screen scopes match the implementation.
- Authorized origins/redirects contain only controlled HTTPS domains and no stale development URI in the production connection.
- Policy describes Google data use, sharing, retention/deletion and revocation consistently with the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
- Sign-in failure, unlink/revocation and account closure are documented and tested.
- Age enforcement happens before or as part of first account establishment and cannot be bypassed through OAuth callback/user sync.

## Release decision

| Action | Decision |
|---|---|
| Publish current AUTH-004B drafts unchanged | **BLOCKED** |
| Reopen registration under 13+ rule | **BLOCKED** |
| Prepare counsel-reviewed 16+ policy drafts | **APPROVED AS DOCUMENT WORK** |
| Submit/publish Google OAuth | **BLOCKED pending Google-specific acceptance evidence and public policy URL** |
| Keep sign-in for existing accounts | **RISK-ACCEPTANCE DECISION**, not automatically blocked by this audit |
| Keep anonymous chess tools available | **NOT BLOCKED** by AUTH-004 |
| Keep Scanner recognition beta | **NOT BLOCKED**, subject to truthful notice/security controls |
| Accept/promote Scanner image feedback | **BLOCKED pending consent/retention/lifecycle controls** |

No policy was published, no Clerk or Google configuration was changed, and no authentication release-candidate file was edited.

