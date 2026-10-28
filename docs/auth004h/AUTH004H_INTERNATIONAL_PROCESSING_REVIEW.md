# AUTH-004H international processing review

Audit date: October 27, 2026

Status: **FACTUAL PROVIDER REVIEW COMPLETE — LEGAL APPLICABILITY PENDING**

Global website accessibility does not by itself establish intentional targeting or the applicability of every international privacy law. This document distinguishes facts from legal conclusions.

| Provider / flow | Data categories | Verified processing/location fact | Transfer status | Unresolved issue |
| --- | --- | --- | --- | --- |
| Supabase Production | Profiles, chess data, entitlements, Scanner feedback/images, security records | Project `jczauvkfkweuvdpurpem` is `us-east-1`; Supabase says database/Auth/Storage/backups are hosted in the selected region, with limited operational processing elsewhere | Verified US primary hosting; potential/contracted processing in other countries | Confirm plan backup horizon, subprocessor list, DPA applicability, and user jurisdictions |
| Clerk Production | Email/account/profile/session/security events | Production instance uses CAISSA custom domain; Clerk may process wherever it/subprocessors operate | Verified cross-border possibility; DPA provides DPF/SCC mechanisms where applicable | Determine whether CAISSA must execute/retain a DPA/TIA and which users trigger it |
| Vercel | Website requests, serverless processing, logs, aggregate analytics | Vercel operates in the US and through global subprocessors | Verified global processing possibility; DPA addresses international transfers | Confirm actual function/log regions and retention for the project/plan |
| Cloudflare | DNS, selected gateway/security/email-routing metadata | Global network and subprocessors may process metadata in multiple locations | Verified global processing possibility; DPA provides transfer mechanisms | Map which CAISSA flows actually traverse Cloudflare beyond DNS/email routing |
| Google OAuth | Basic identity and OAuth events if enabled | Project/client exist; production publication is not complete | Future production transfer only; staging certification is not production certification | Complete Branding/publication and update disclosure before activation |
| Chess integrations | Requested game/position/embed data, request metadata | Provider-specific | Potential transfer when user invokes feature | Inventory each active integration and whether identifiers are sent |
| Optional AI provider | User-selected prompts/chess context and provider metadata | Only when user chooses feature | Potential transfer determined by chosen provider | Present provider-specific notice and retention before broader activation |

## Provider safeguards reviewed

- Supabase DPA and its October 2026 residency/transfer FAQ describe selected-region core hosting, subprocessors, SCCs where applicable, and provider-level deletion/return terms.
- Clerk DPA describes processor/subprocessor roles, subprocessors, DPF/SCC mechanisms, data-subject assistance, and deletion after service termination.
- Vercel DPA permits processing in the United States and other subprocessor locations and requires protection under applicable transfer law.
- Cloudflare DPA addresses global processing and applicable SCC/DPF mechanisms.

These are provider commitments, not a conclusion that CAISSA satisfies every controller obligation.

## Legal applicability decisions

| Question | Classification | Current answer |
| --- | --- | --- |
| Does CAISSA intentionally target EEA/UK/Swiss users? | C/D | Not established; Alexander must define intended markets and counsel must assess facts |
| Is a controller DPA/TIA/SCC record required? | D | Counsel determination by provider and user jurisdiction |
| Is a representative or local contact required? | D | Not established |
| Is Florida's Digital Bill of Rights applicable? | D | Current free/no-revenue facts do not establish threshold applicability; do not claim exemption without counsel |
| What transfer disclosure is safe now? | B | State US primary hosting and global provider processing accurately; do not promise single-country storage |

## Official sources

- Supabase residency and transfers: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
- Clerk DPA: https://clerk.com/legal/dpa
- Vercel DPA: https://vercel.com/legal/dpa
- Cloudflare DPA: https://www.cloudflare.com/cloudflare-customer-dpa/
- Florida Statutes Part V: https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/0501.html
