# AUTH-004 Legal Blocker Analysis

**Verified:** 2026-10-25  
**Scope:** analysis only. The existing authentication release candidate was not modified.

## Bottom line

The AUTH-004B draft is useful prepublication work, but it is not ready to publish or use to reopen registration. It uses a 13+ posture that conflicts with Clerk's current under-16 contract restriction absent VPC, incorrectly says Google Sign-In is not active, says no payment processor is active while production still presents PayPal, contains provisional retention statements that are not operationally implemented, and leaves operator identity, liability, governing law, policy-change and appeal decisions unresolved.

The owner decided to discontinue PayPal after the draft was prepared. AUTH-004B must not anticipate removal until the separately authorized production release and PayPal dashboard deactivation are verified. This audit did not edit the AUTH-004 or AUTH-004B worktrees.

Google OAuth has a narrower true blocker set than the whole legal roadmap. Future community, subscription, tournament, model-training and comprehensive accessibility work should not be mislabeled as Google OAuth blockers.

## Dependency matrix

| Target | True blockers | Required but can follow separately | Not a blocker |
|---|---|---|---|
| Publish Privacy Policy | Accurate live data/provider inventory; controller/operator presentation; contact; age rule; Google status; Scanner image/retention truth; transition-accurate PayPal status; effective date; rights/request method | Self-service account center; final global-law coverage; DMCA registration | Forums, paid tournaments, under-13 launch, native apps |
| Publish Terms | Operator/contracting-party presentation; 16+ account rule under current Clerk terms; acceptable use; IP/user-content license; AI/Scanner limits; transition-accurate PayPal wording; liability/governing-law/dispute review | Full community appeals tooling if clearly gated; subscription terms while sales disabled | Future premium, prize tournament and DM features |
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
2. **Google:** the Privacy draft says Google Sign-In is “being prepared” and not active, but the production authentication review found it enabled. Console branding, scopes, redirect URIs, verified domains and revocation remain externally unverified.
3. **Payment:** the drafts say no payment processor is active, but production `/support` still presents the PayPal Hosted Button. The owner decision to retire it is not a deployed fact. “No subscription” may remain true; “no payment processing” is not yet supportable.
4. **Retention:** the draft cannot promise deletion schedules or account deletion mechanisms that do not exist.
5. **Scanner:** upload can occur before image consent is bound. Policy wording must reflect actual processing or the code must be corrected before publication.
6. **Operator identity:** “CAISSA Chess” is the public brand, but counsel must decide the legally sufficient contracting/controller identification without unnecessarily exposing personal information.

## Exact AUTH-004B draft amendments required

### `privacy.html`

1. At lines 44–45 and 142, replace the unresolved operator/controller presentation only after counsel approves the legally sufficient individual/project identity, contact and any postal-address treatment.
2. At lines 63–65, change Google Sign-In from “being prepared / not active” to the verified production truth. Describe only the exact scopes and data returned after console readback; explain use, sharing with Clerk, retention/deletion, unlink/revocation and support.
3. At lines 74–77, state that ordinary recognition sends image data to the hosted endpoint, is separate from feedback, and is not training permission. Do not say an image reaches Storage only after consent while the upload route can accept it earlier; either fix the workflow in a later authorized branch or disclose the actual prebinding/orphan risk.
4. At lines 96–103, list only providers actually active for each purpose. External generative Mentor providers must be conditional unless production activation is proven; local Stockfish must not be described as third-party transmission.
5. At line 103, remove “No payment processor ... is active” only after sequencing the PayPal state: disclose the active flow if publication precedes verified retirement; after verified code deployment and dashboard deactivation, state that no contribution feature is currently offered without claiming PayPal was never used.
6. At lines 112–119, replace unresolved drafting notes with approved retention criteria and a real manual request workflow. Do not promise fixed deletion, full erasure, self-service or provider-log deletion unless implemented and verified.
7. At lines 131–133, change account eligibility from 13+ to the approved provisional 16+ rule. Preserve the distinction between COPPA's under-13 statutory trigger and Clerk's broader contract restriction.
8. Add accurate notice of browser storage, hosting/security logs, international processing, AI prompt/result handling, provider retention uncertainty and the policy effective/version date.

### `terms.html`

1. At lines 30–32, insert counsel-approved contracting-party/operator language; “one individual” alone may be insufficient for enforceability and notices.
2. At lines 40–41, replace 13+ with provisional 16+ and remove any implication that a future “CAISSA Junior” program is approved.
3. At lines 49–57, make the user-content license purpose-specific; add a source-image rights representation; distinguish recognition, correction, optional image evidence, certification and later training permission.
4. At lines 63–70, sequence PayPal truth exactly as in the Privacy draft and keep Stripe/Premium/credit sales disabled. If PayPal is retired before publication, omit active contribution terms but preserve any legally necessary historical-record language.
5. At lines 70 and 80, identify external generative AI versus local engines, explain that prompts/context may reach the selected provider, and preserve accuracy/non-reliance warnings.
6. At line 77, replace the drafting placeholder with an approved suspension, notice and proportionate appeal process or a narrow truthful statement counsel approves.
7. At lines 83–90, obtain jurisdiction-appropriate warranty/liability, governing-law, forum/dispute and consumer-rights language; the present “not approved” drafting notes are not publishable terms.
8. At lines 86–87, define change notice, effective date and re-acceptance for material changes.
9. Add a final effective/version date, policy hierarchy, severability and contact/notice language if counsel considers them necessary.

## Minimum publishable policy decisions

### Privacy Policy

- State who operates the service using counsel-approved wording and the official privacy contact.
- Enumerate Clerk, Google, Supabase, Vercel, Cloudflare, any still-active PayPal flow and activated AI providers by role.
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
- Until verified retirement: voluntary PayPal contribution, non-charitable/non-tax-deductible/no benefits, with PayPal terms. After verified retirement: remove active-payment language without denying historical processing.
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

### Genuine Google publication blockers

- `/privacy` is not publicly accessible (safe HEAD returned 404); the production home page must link to an accurate policy on a verified owned domain.
- OAuth brand identity, homepage/policy URLs, authorized domains, HTTPS origins/redirects, production/test separation and relevant contacts require console readback.
- Requested/displayed scopes must equal the minimum actually used. Basic OpenID identity scopes do not create the same sensitive-scope verification burden as Gmail/Drive scopes, but truthful configuration and brand verification still apply.
- The policy must accurately explain Google data access, use, storage, sharing, deletion and revocation.
- Reopening account creation additionally requires the provider-compatible age gate and consent/version evidence; that is a CAISSA/Clerk launch dependency, not a Google rule that independently sets age 16.

Not genuine Google OAuth publication blockers by themselves: Scanner model training, GPL cleanup, PayPal retirement, future forums, whole-site WCAG completion, subscriptions, paid tournaments or native apps. They remain separate risks/gates and must not make the published policy inaccurate.

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

