# CAISSA PayPal removal — owner handoff

Date: 2026-10-25

Scope: isolated implementation and human test only

Production state: unchanged

## What this change does

- Removes the public contribution page, PayPal Hosted Button controller, page
  styling, localized contribution copy, navigation entry, and sitemap entry.
- Permanently redirects `/support`, `/support/`, and `/support.html` to the
  existing `/help` route so old bookmarks do not become dead links.
- Removes only the route-scoped PayPal, PayPal Objects, and Venmo CSP grants.
  Unrelated CSP policies and the global `payment=()` restriction remain.
- Preserves the historical Hosted Button audit and all external transaction
  history. It does not alter Stripe, authentication, user data, account
  balances, or any payment-provider account.

The website removal does **not** deactivate PayPal Hosted Button
`CV3QSCB3RPGVL`. The owner must complete and verify that separate dashboard
action before production release.

## Owner dashboard action

1. Sign in directly to the CAISSA PayPal Business account using a trusted
   browser and MFA. Do not follow links from email or this repository.
2. Open PayPal's **Payment Links and Buttons** or **PayPal Buttons** management
   area and then the saved-buttons list. PayPal's labels can vary by account
   experience and region.
3. Locate Hosted Button `CV3QSCB3RPGVL`. Confirm its description and any share
   link or QR code before acting so the correct button is selected.
4. Use the available **Deactivate**, **Archive**, or **Delete** action. Prefer a
   reversible deactivation/archive option if PayPal offers one. If no retirement
   control appears, contact PayPal Business Support and ask it to disable that
   exact button; do not repurpose it or change its amount as a substitute.
5. Preserve the PayPal account and all historical reports and transaction
   records. Do not delete the account.
6. Record the action time, operator, UI result, and a screenshot that does not
   expose account, customer, or transaction details.
7. In a signed-out/incognito browser, open only the button's known share link
   or landing URL and verify that PayPal reports it unavailable. Do not click a
   payment button, enter financial data, or initiate a transaction.
8. Mark the dashboard action complete only after both the management UI and
   signed-out check show the button cannot accept a contribution.

PayPal documents that saved buttons are managed in its Buttons page and that
the same payment link/button can be shared outside a website. Removing CAISSA's
page therefore cannot by itself prove that the provider-hosted endpoint is
disabled:

- <https://developer.paypal.com/payment-links-buttons/choose-integration-option/>
- <https://developer.paypal.com/payment-links-buttons/share-payment-link/>
- <https://www.paypal.com/us/cshelp/article/paypal-pay-links-and-buttons-troubleshooting-tips-ts2341>

## AUTH-004 amendments after deployment

Do not edit or publish the AUTH-004 Privacy Policy or Terms from this branch.
After the code and dashboard retirement are both verified in production, make
the following exact amendments on the AUTH-004 owner branch and submit them for
legal review.

### Privacy Policy draft

1. Remove PayPal from every list or table of current service providers,
   processors, payment recipients, payment methods, or contribution flows.
2. Remove statements that CAISSA currently collects, transmits, or receives
   contribution data through a PayPal support page or Hosted Button.
3. If historical payment records remain subject to retention, replace current-
   tense language with a narrowly dated historical statement identifying the
   retained record categories, purpose/legal basis, retention rule, and user
   rights. Do not state that CAISSA never used PayPal or never received payments.
4. Keep Stripe statements unchanged unless the separately reviewed product
   state requires a truthful update; this change does not authorize Stripe work.
5. Update the policy version, effective date, change summary, and provider list
   only when the production removal and dashboard evidence are complete.

### Terms draft

1. Remove the current voluntary-contribution offer, PayPal checkout directions,
   Hosted Button references, and any suggestion that support unlocks benefits.
2. Remove PayPal from current payment-method and third-party-checkout clauses.
3. Preserve any counsel-approved provisions needed for historical disputes,
   refunds, chargebacks, taxes, recordkeeping, or already-completed transactions;
   express them in the past tense and do not imply charitable status or tax
   deductibility.
4. Keep Stripe and premium/store language unchanged unless separately reviewed;
   PayPal removal does not authorize changes to another payment system.
5. Update the Terms version, effective date, and change notice only after the
   production and PayPal-dashboard gates pass.

## Release gate and rollback

Release prerequisites:

- Human review of desktop/mobile EN, ES, and PT navigation and `/support` redirect.
- Human confirmation that Hosted Button `CV3QSCB3RPGVL` is disabled externally.
- Legal approval and publication plan for the AUTH-004 amendments above.
- Normal production change approval, backup, smoke test, and monitoring plan.

Code rollback is `git revert <PayPal-removal-commit>` followed by the normal
review and deployment process. That restores the website code only. Restoring
payment acceptance would require a separate owner decision, legal review, and
explicit reactivation or replacement of the Hosted Button in PayPal. If PayPal
only offers irreversible deletion, code rollback cannot restore that button.

## Local verification record

The implementation was tested against `origin/main` at
`d7c48e52465b8764d102313c03cf639c38b3db6f`.
While `node server.js` is running from this worktree, the human-test entry point
is <http://127.0.0.1:8000/support>; it must resolve to
<http://127.0.0.1:8000/help>.

| Command | Result |
| --- | --- |
| `node --test tests/paypal-removal.test.js tests/navigation-integrity.test.js tests/global-navigation-order-policy.test.js tests/public-route-inventory.test.js tests/sidebar-foundation.test.js tests/ux-navigation-language-season-certification.test.js tests/clerk-production-custom-domain-csp.test.js` | PASS — 28/28 |
| `npx playwright test tests/browser/paypal-removal.spec.js --project=chromium --project=webkit` | PASS — 8/8 |
| `node scripts/build-navigation-fallbacks.mjs --check` | PASS — fallbacks current |
| `npm run lint:navigation` | PASS |
| `npm run lint:i18n` | PASS |
| `git diff --check` | PASS |
| active-runtime search for PayPal, PayPal Objects, Venmo, Hosted Button ID/controller, and retired localized CTA copy | PASS — 0 matches after excluding preserved docs, test evidence, third-party icon CSS, and a third-party Lichess license notice |
| local `GET /support`, `/support/`, and `/support.html` without redirect following | PASS — HTTP 308 to `/help` |
| local `GET /help` | PASS — HTTP 200 |

### Baseline findings not caused by this change

- The pre-change focused suite had 35/41 passing. Its six failures were stale
  navigation counts/inventory expectations plus the existing
  `game-library-champions.html` i18n/script-order defect. The relevant stale
  navigation expectations were updated to the current 1.22 removal contract;
  the unrelated game-library defect remains, so the comparable post-change
  suite is 40/41.
- A broader Chromium navigation/sidebar run was 14/18. All four failures resolve
  to the existing `/play` and `/play/*` unavailable-page gate, which has no
  navigation shell. The baseline `vercel.json` already routed those paths to
  `play-v2-unavailable.html`; this change does not modify that policy.
- `npm audit --omit=dev` reports four existing high-severity `zod` advisories
  through `@vercel/functions`/OIDC dependencies. The offered fix is a breaking
  downgrade/change and was not applied. `package.json` and `package-lock.json`
  are unchanged.

No production, PayPal, Stripe, Clerk, Google, Supabase, DNS, AUTH-004, user,
balance, or transaction system was accessed or changed during verification.

No push, merge, preview deployment, production deployment, dashboard change, or
financial transaction is part of this handoff.
