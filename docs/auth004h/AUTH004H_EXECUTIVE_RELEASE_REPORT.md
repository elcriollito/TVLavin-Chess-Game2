# AUTH-004H executive release report

Audit date: October 27, 2026

Status: **TECHNICALLY CERTIFIED — LEGAL APPROVAL PENDING**

This is an engineering and compliance-research release package, not legal advice. It does not authorize publication, production deployment, a database migration, provider changes, or registration activation.

## Immutable baselines

| Item | Verified value |
| --- | --- |
| Production source baseline | `6e912be5c314080be8944efde261b8dc133452a6` (`origin/main`) |
| Certified technical candidate | `2e4e23b5c96e1724ae87735851ac9a7b77332b02` |
| AUTH-004H branch | `release/auth004h-final-package` |
| Production deployment | `dpl_Co49rhBrL6AeeEkdpGfh3fLumeLg` — Ready |
| Production Supabase | `jczauvkfkweuvdpurpem` — `ACTIVE_HEALTHY`, `us-east-1` |
| Clerk Production | `ins_3KCrtSZ0xYIWxGejoyQf5JvUsjH` |
| Google project | `caissa-chess-production-auth` — Active |

The technical candidate contains current `origin/main` and 17 additional commits. AUTH-004H adds governance documents only; it does not alter runtime code, legal-page HTML, dependencies, migrations, or provider configuration.

## Release assessment

- The 16+ invitation-first architecture is implemented, fail-closed, and certified in protected staging.
- Existing-user login, user synchronization, Google staging OAuth, Scanner, and Beta Program certifications remain valid for technical candidate `2e4e23b5...` because AUTH-004H changes only documentation.
- The production age-gate migration is absent, as required. Its exact file is additive, independently rehearsed, and ready for a separately authorized transaction.
- Production registration remains closed because all four production activation variables are absent.
- Clerk Production remains restricted and its domain/DNS/SSL/mail checks are complete.
- Google has the correct Web client and Clerk callback. Its audience remains External/Testing; the Privacy and Terms URLs are blank; no logo is configured; publication is disabled until Branding is complete.
- Clerk Production Google credentials remain unconfigured. Google sign-in must not be treated as production-ready until the provider sequence is completed and tested.
- Privacy and Terms remain visibly labeled pre-publication drafts. Their factual descriptions are materially aligned with verified implementation, but material policy and counsel decisions remain unresolved.

## Material release blockers

1. Qualified legal review or explicit owner decisions are still required for the items classified C and D in the decision register, especially retention, suspension/appeal, liability, governing law/disputes, material-change notice, and any required operator/address disclosure.
2. Approved legal pages must be published before Google Branding can reference them.
3. Google must complete its required publication/verification workflow before Clerk Production receives the dedicated OAuth credentials.
4. The exact Supabase migration, production environment variables, application deployment, and registration activation each require separate approval.

## Evidence and test summary

| Contract | Result |
| --- | --- |
| AUTH-004H targeted auth/age/redirect/Scanner policy rerun | 97/97 pass |
| Targeted auth/age/redirect tests on `2e4e23b5...` | 77/77 pass |
| Auth/security certification on `2e4e23b5...` | 75/75 pass |
| Chromium/WebKit registration, Clerk, and legal flows | 29 pass, 1 suite-defined skip, 0 fail |
| Legal unit/browser tests | 12/12 unit and 5/5 Chromium pass |
| Beta Program inherited exact-SHA certification | 22/22 pass |
| Scanner inherited exact-SHA certification | 63/63 pass |
| Security diff scan `main...2e4e23b5` | 28/28 surfaces, 0 validated findings |
| Dependency audit | 0 known npm vulnerabilities at certification |
| Supabase rehearsal | 5/20 concurrent quota claims; 1/20 nonce claims; rollback clean |

No scan establishes zero risk. Provider state, human legal review, and the ordered production smoke remain mandatory.

## Required human gate

Approve or reject each action in `AUTH004H_HUMAN_APPROVAL_PACKAGE.md` independently. Do not use a blanket approval.

Decision: **TECHNICALLY CERTIFIED — LEGAL APPROVAL PENDING**
