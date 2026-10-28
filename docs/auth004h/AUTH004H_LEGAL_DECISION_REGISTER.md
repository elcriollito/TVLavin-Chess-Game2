# AUTH-004H consolidated legal decision register

Audit date: October 27, 2026

Classification:

- **A** — resolvable from verified implementation evidence
- **B** — resolvable through conservative accurate disclosure
- **C** — Alexander policy decision
- **D** — qualified legal counsel
- **E** — external provider approval

Settled facts are not reopened. This register is not legal advice.

| ID | Decision | Class | Current disposition | Required gate |
| --- | --- | --- | --- | --- |
| L-01 | Project identity/status | A | Settled: free personal project, one individual, no LLC/corporation, no current revenue/subscriptions | Preserve wording |
| L-02 | Public privacy contact | A | Settled: `privacy@caissa-chess.org`; forwarding destination remains private | Delivery monitoring only |
| L-03 | Minimum account age | A/C | Settled by Alexander: 16+ for new accounts; existing accounts unchanged | Preserve technical gate |
| L-04 | CAISSA Junior | A/C/D | Future-only; no implementation | Separate future legal/product program |
| L-05 | Google identity scopes | A/E | Basic `openid`, email, profile only; production provider not published | Google/Clerk release sequence |
| L-06 | Scanner feedback/training | A/B | Raw feedback is unverified; no automatic certification/training/weight update | Preserve separate consent and human certification |
| L-07 | Retention schedule | C/D | Proposal prepared; no fixed service-wide periods approved or implemented | Owner selects periods; counsel reviews |
| L-08 | Account export/deletion | A/C/D | Dry-run/request planning exists; no universal automated executor | Approve scope/exceptions; implement and certify later |
| L-09 | Historical Scanner private objects | C/D | Quarantined; no deletion or training authorized | Decide preservation/deletion and rights basis |
| L-10 | Suspension/termination/appeal | C/D | High-level security/fair-play authority only | Approve triggers, notice, appeal, records |
| L-11 | Liability | D | No monetary cap or damage exclusions approved | Counsel drafts valid language |
| L-12 | Governing law/forum/disputes | D/C | No term approved | Counsel supplies options; Alexander decides |
| L-13 | Material policy changes | C/D | Revision-date disclosure only | Approve notice/effective-date/reacceptance procedure |
| L-14 | Operator legal name/address | D | Private where legally permissible; no public address | Counsel determines required disclosures |
| L-15 | Florida fictitious-name status | D | Current no-compensation facts narrow applicability but do not decide it | Florida counsel before representation/filing |
| L-16 | Florida breach-response duties | D/A | Security controls exist; legal applicability/procedure remains | Counsel review plus incident runbook |
| L-17 | International targeting/applicability | A/C/D | Service is globally reachable; no deliberate jurisdictional expansion established | Decide target markets; counsel assesses resulting law |
| L-18 | Provider transfer disclosures | A/B | DPAs/transfers can be conservatively described without claiming universal law | Keep provider inventory current |
| L-19 | Payments/commercial terms | A/C/D | Not active; PayPal removed; no payment terms needed now | New review before monetization |
| L-20 | Legal-page publication | C/D | Drafts remain marked pre-publication | Counsel/owner approve exact SHA/text |
| L-21 | Google Branding/publication | E/C | External/Testing; Privacy/Terms blank; publish disabled | Legal pages first, then explicit Google approval |
| L-22 | Clerk legal consent | C/E | Disabled; URLs unset | Configure only after legal publication approval |
| L-23 | Source/license/IP posture | D/C | Outside AUTH-004 runtime gate but material to broader public release | Separate IP/license review |

## Superseded findings

- The earlier provisional 13+ policy is superseded by the approved 16+ policy.
- Older observations that `/privacy` and `/terms` were absent describe the production baseline, not the unmerged technical candidate.
- Staging certification does not certify Google or Clerk Production.
- Privacy/Security Season 2 Scanner proposals are not represented as live production controls.

Publication may proceed only after L-07 through L-16 and L-20 are affirmatively resolved or counsel confirms they are not required for this release.
