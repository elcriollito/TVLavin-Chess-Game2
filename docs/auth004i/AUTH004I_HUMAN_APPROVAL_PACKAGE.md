# AUTH-004I human approval package

## Complete proposed documents

- Privacy Policy: [`privacy.html`](../../privacy.html)
- Terms of Service: [`terms.html`](../../terms.html)

These HTML files are the complete review candidates. Draft notices must remain until the legal-content gate is resolved.

## Supporting record

- [Factual verification report](AUTH004I_FACTUAL_VERIFICATION_REPORT.md)
- [Retention and deletion matrix](AUTH004I_RETENTION_AND_DELETION_MATRIX.md)
- [Legal decision register](AUTH004I_LEGAL_DECISION_REGISTER.md)
- [Redline/change summary](AUTH004I_REDLINE_CHANGE_SUMMARY.md)
- [Legal review checklist](AUTH004I_LEGAL_REVIEW_CHECKLIST.md)
- [Publication readiness certificate](AUTH004I_PUBLICATION_READINESS_CERTIFICATE.md)

## Minimal human decisions

| Approval | Who | Why it remains material |
|---|---|---|
| Postal notice address and Florida name posture | Florida counsel | Operator identity is approved. Any additional postal-address or fictitious-name obligation still depends on applicable law and actual operation. |
| Liability, governing law, forum and disputes | Operator + qualified counsel | These provisions allocate remedies and legal risk and cannot be safely invented. |
| Child-platform applicability | Qualified counsel using audience facts | Florida §501.1735 is triggered by factual audience/use, not solely by a 16+ label. |
| Retention/request commitments | Operator + privacy counsel | Fixed periods and exceptions must match operational capacity and applicable law. |
| Notice/reacceptance process | Operator + counsel | Determines when changed terms bind existing users and requires technical support. |

## Separately approvable release actions

1. **Legal publication:** merge only approved text and remove draft warnings in a new immutable release candidate.
2. **Google branding/publication:** submit only production URLs containing approved public text.
3. **Clerk/Google configuration:** configure the production Google client under a distinct credential-change approval.
4. **Supabase migration:** apply the certified age-gate migration under a distinct database approval and backup/rollback window.
5. **Application deployment:** deploy the immutable runtime and legal commit under a distinct production approval.

No item above is authorized by this package.

## Decision

**HOLD — MATERIAL LEGAL REVIEW REQUIRED**

The remaining list is intentionally short. Factual evidence is sufficient for technical review; the hold exists because the unresolved items require legal judgment.
