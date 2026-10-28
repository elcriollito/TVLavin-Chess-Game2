# AUTH-004I Privacy Policy — Scanner Consent Amendment (Draft)

Status: **DRAFT — NOT PUBLISHED**

Contact: privacy@caissa-chess.org

Consent contract: CAISSA Scanner Privacy Consent v1.0

## Proposed Scanner disclosure

CAISSA Scanner processes an image to locate a 2D chessboard and recognize the position requested by the user. The ordinary recognition path does not intentionally create a durable improvement-feedback record or place the source image in the private feedback-evidence bucket. Hosting, security, rate-limit and operational systems may still process or retain limited technical records needed to provide and protect the service.

After Review/Edit, the user may independently choose either, both or neither of these optional contributions:

1. **Recognition results and corrections.** If selected, CAISSA may retain the detected position, piece and square predictions, confidence information, corrections, changed-square information, model/localizer versions and limited diagnostic metadata in the private Raw Feedback Vault. New submissions begin as `raw-unverified`.
2. **Original photo or screenshot.** If selected and the user confirms the right to share it, CAISSA may retain the source image in private storage for authorized human improvement review. This permission is independent of results sharing.

Neither option is selected by default. Declining both options does not prevent the user from continuing to Stockfish analysis. Consent for optional improvement storage is purpose-bound and does not authorize unrelated use.

## Human review and training

Optional contributions are not automatically certified and do not automatically train or update a model. An authorized owner or reviewer must evaluate raw feedback under the existing duplicate, correction, structural and provenance controls. Dataset certification, training authorization and model deployment remain separate stages. Where a contributed image or correction would be used for model training, CAISSA must have the separately recorded training permission or another legally reviewed mechanism required for that use. Missing permission fails closed.

## Image access and security

Contributed source images are stored in a private Supabase Storage bucket. They do not receive permanent public object URLs. Authorized review access uses short-lived signed URLs. The service validates file size, MIME type, file signature and SHA-256 binding, and links each upload to the contributing account or pseudonymous account reference, the scan identifier, a consent version and a stated purpose. Public feedback records do not expose private identity data.

## Retention, withdrawal and deletion

CAISSA currently retains accepted optional contributions for governed human review unless they are withdrawn, deleted under an applicable request, excluded under governance rules or removed through an approved lifecycle operation. A final fixed retention duration has not yet been approved and must not be invented in the published policy.

Users may request withdrawal of optional Scanner consent or deletion where available by contacting `privacy@caissa-chess.org` from an address that can be authenticated to the relevant account. Withdrawal will stop future optional use where applicable and technically enforceable. CAISSA may retain minimal append-only audit information needed to document the request, preserve security or meet applicable obligations. Backup propagation and previously completed authorized uses may limit immediate universal deletion. CAISSA must not promise instant removal from every backup or from a use already completed before withdrawal.

No real user data is to be deleted during staging or certification.

## Release gate

This amendment describes intended behavior of the Scanner Privacy Consent v1.0 candidate. It must not be represented as current production behavior until:

- the database migration is approved and applied;
- the application candidate is deployed and verified;
- the legal amendment receives final human/legal approval; and
- production release is explicitly authorized.
