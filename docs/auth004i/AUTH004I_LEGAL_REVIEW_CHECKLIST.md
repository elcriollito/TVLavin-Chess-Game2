# AUTH-004I legal review checklist

## Operator and Florida counsel

- [ ] Confirm whether the current uncompensated use of “CAISSA Chess” requires Florida fictitious-name registration under the actual facts.
- [ ] Confirm the minimum legally sufficient public operator identity and notice address; do not insert a residence without explicit approval.
- [ ] Assess whether CAISSA Online is an online game likely to be predominantly accessed by children for Florida §501.1735.
- [ ] Review the proposed 16+ general-audience approach and actual-knowledge escalation process.

## Privacy counsel

- [ ] Approve the purpose-based retention language or select enforceable category periods from the implementation matrix.
- [ ] Approve data-subject request verification, scope, exceptions and response timing.
- [ ] Review international-transfer disclosure against current provider DPAs and target audience.
- [ ] Approve Scanner withdrawal/deletion language, historical quarantine and future-training permission model.
- [ ] Approve material-change notice and re-consent proposal.
- [ ] Decide whether any jurisdiction-specific supplemental notices are required before registration opens.

## Terms counsel

- [ ] Draft or intentionally omit a valid limitation-of-liability clause with mandatory consumer-law exceptions.
- [ ] Decide governing law, forum and dispute process; no arbitration or class waiver is currently proposed.
- [ ] Approve the suspension, notice and review procedure.
- [ ] Review IP/source/asset provenance before approving broad ownership or licensing statements.

## Operator approval

- [ ] Approve final Privacy Policy wording.
- [ ] Approve final Terms wording only after counsel resolves the material clauses above.
- [ ] Approve effective date and publication time.
- [ ] Approve the proposed user-notice channel and version tracking.
- [ ] Confirm legal pages may be submitted to Google only after their production URLs contain the approved text.

## Technical follow-up after legal approval

- [ ] Implement/version policy acceptance and material-change notice if required.
- [ ] Implement approved retention periods and auditable cleanup jobs.
- [ ] Implement category-aware export/deletion; do not equate Clerk deletion with full deletion.
- [ ] Activate atomic/recoverable Scanner evidence binding and orphan cleanup before promising it.
- [ ] Validate production links, accessibility, monitoring and rollback immediately before publication.

## Google OAuth publication sequence

- [ ] Publish approved homepage, Privacy Policy and Terms on the verified production domain.
- [ ] Confirm branding names, domain and URLs exactly match the Google Cloud console.
- [ ] Confirm privacy text describes Google data access, use, storage and sharing.
- [ ] Configure the production Google client in Clerk only under a separately approved release action.
- [ ] Complete Google production audience/publishing steps; identity-only scopes normally do not require sensitive-scope verification, but provider status must be verified rather than assumed.
