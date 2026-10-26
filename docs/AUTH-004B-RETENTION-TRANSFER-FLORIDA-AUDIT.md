# AUTH-004B retention, transfer and Florida audit

Audit date: October 25, 2026

Status: read-only audit; no production, Clerk, Google OAuth, account or database changes

This document records verified facts and unresolved legal decisions. It is not legal advice.

## Confirmed project status

- CAISSA Chess is a free personal project operated by one individual.
- No company, LLC or corporation is associated with the project.
- The project does not currently charge for services, operate commercial subscriptions or generate commercial revenue.
- `CAISSA Chess` remains the public service identity and `privacy@caissa-chess.org` remains the official contact.
- The production data audit found zero Stripe event rows, zero users with a Stripe customer identifier and zero users marked premium. Internal credit and entitlement records exist but are not treated as evidence of a current paid offer.

## Retention and deletion findings

- Production contains 97 Scanner beta scan rows and 92 Scanner beta feedback rows. Their observed creation dates span September 19 through October 4, 2026.
- The private `scanner-beta-images` bucket contains 96 objects. The observed object dates span September 20 through October 4, 2026.
- The `scanner-public-feedback-images` bucket is private and currently empty.
- Both Scanner buckets have versioning disabled and no Storage lifecycle rule.
- Public Scanner scan, raw-feedback, certification and review-audit tables are currently empty. Their schema blocks update and deletion to preserve audit history.
- Some unrelated transient features have explicit expiration fields or cleanup functions, but there is no service-wide retention schedule or account-deletion workflow that covers every personal-data class.

No rows or objects were opened, changed or deleted during this audit. Only schema, aggregate counts and aggregate date ranges were inspected.

## International-processing findings

- The production Supabase project is deployed in `us-east-1` (East US, North Virginia).
- Supabase states that its database, Auth, Storage objects and backups are hosted in the selected region, while limited account, support, telemetry, logs and content-delivery processing may occur elsewhere. Supabase documents transfers to Singapore and the United States under SCCs in its DPA.
- Vercel states that its primary processing facilities are in the United States and that it may process through global subprocessors under its DPA and transfer mechanisms.
- Clerk publishes a DPA, subprocessor terms and SCC safeguards for covered cross-border transfers.
- The application also invokes or embeds Cloudflare and optional chess or AI providers. A complete flow-by-flow processor, subprocessor, purpose, region and retention inventory is not yet approved.

## Florida findings

- Florida Statutes § 865.09 defines a “business” as an enterprise or venture involving specified dealing in a thing or article of value or rendering services for compensation.
- The confirmed facts—free personal project, no charges, no subscriptions and no commercial revenue—materially narrow the question of whether the current project is “engaging in business” under that section.
- This technical audit cannot conclude that the project is exempt. Florida counsel should confirm applicability before CAISSA represents that no fictitious-name registration is required.
- Florida Statutes § 501.171 imposes security and breach-notification duties on covered entities handling defined personal information. Whether and how it applies to this exact free-project structure and data set requires legal confirmation and an incident-response procedure.

## Remaining decisions

1. Approve a retention schedule for accounts, identity data, games, Scanner records, images, feedback, security logs, analytics and local/browser data.
2. Decide which records must be deletable, anonymized or preserved for security, integrity or legal reasons, and implement a tested request workflow.
3. Confirm Florida fictitious-name, operator-identification, notice-address and breach-response obligations.
4. Complete the international processor/subprocessor and jurisdiction assessment.

## Official sources

- Florida Statutes § 865.09: https://leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0800-0899/0865/Sections/0865.09.html
- Florida Statutes § 501.171: https://leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=0500-0599/0501/Sections/0501.171.html
- Supabase regions: https://supabase.com/docs/guides/platform/regions
- Supabase residency and transfers: https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum
- Clerk DPA: https://clerk.com/legal/dpa
- Vercel DPA: https://vercel.com/legal/dpa
