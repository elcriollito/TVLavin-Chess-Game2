# AUTH-004H final Privacy Policy review

Audit date: October 27, 2026

Document reviewed: `/privacy.html` at technical candidate `2e4e23b5c96e1724ae87735851ac9a7b77332b02`

Publication status: **PRE-PUBLICATION DRAFT — LEGAL APPROVAL PENDING**

## Review result

The draft accurately separates current behavior, a production-inactive registration candidate, and future CAISSA Junior/commercial functionality. No factual correction that could safely override an unresolved legal decision was identified, so AUTH-004H does not change the page text.

## Verified coverage

| Area | Review finding |
| --- | --- |
| Operator and service | Correctly states a free personal project operated by one individual; no LLC/corporation or active revenue is claimed. |
| Contact | Uses only `privacy@caissa-chess.org`; it does not publish the private forwarding address. |
| Accounts | Identifies Clerk, session/account data, and CAISSA identity binding. |
| Google Sign-In | Clearly says production activation is pending and limits planned scopes to basic OpenID identity. |
| CAISSA Online | Describes public chess identity, games, ratings, events, and separation from private email/account names. |
| Scanner | Distinguishes transient recognition from optional account-gated feedback and private image evidence. |
| Training | States raw feedback is not truth, certification, automatic training, or an online weight update. |
| Providers | Names Clerk, Supabase, Vercel, Cloudflare, selected chess providers, and optional AI providers. |
| Analytics/storage | Describes Vercel Web Analytics and browser storage; states Clarity is retired from the current flow. |
| Children | Reflects the approved 16+ account policy, transient month/year evaluation, no active Junior product, and paused production registration. |
| Security | Uses qualified language and does not guarantee perfect security. |

## Material unresolved items

The draft intentionally discloses these gaps instead of inventing commitments:

1. No approved service-wide retention schedule or verified automated deletion workflow.
2. No final lifecycle for historical Scanner private images and append-only evidence/audit records.
3. No final material-change notice and consent procedure.
4. No jurisdiction-by-jurisdiction international-transfer/targeting determination.
5. No final legal conclusion on whether the operator's legal name or postal address must be published.
6. No approved response period for access/correction/deletion requests.

These are publication blockers until resolved through the decision register. Simply removing the warnings would make the draft less accurate.

## Provider evidence

- Supabase Production is currently hosted in `us-east-1`; Supabase states core database/Auth/Storage/backups are hosted in the chosen region but limited operational processing may occur elsewhere.
- Clerk, Supabase, Vercel, and Cloudflare publish DPAs and cross-border mechanisms; their existence does not decide which laws apply to CAISSA.
- Google Branding currently has no Privacy or Terms URL, so the draft must not claim Google publication is complete.

## Official sources

- Clerk DPA: https://clerk.com/legal/dpa
- Clerk Standard Terms: https://clerk.com/legal/standard-terms
- Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
- Supabase residency and transfers: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Vercel DPA: https://vercel.com/legal/dpa
- Cloudflare DPA: https://www.cloudflare.com/cloudflare-customer-dpa/
- FTC COPPA guidance: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions

Conclusion: technically coherent and factually supportable as a draft; **not approved for publication**.
