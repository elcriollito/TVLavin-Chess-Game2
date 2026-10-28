# Scanner Optional-Consent Withdrawal Runbook

Status: staging design; production execution is not authorized.

1. Authenticate the requester through the CAISSA account and the verified contact channel. Do not rely on an unauthenticated scan identifier alone.
2. Resolve only consent records owned by that account and the identified scan, feedback or upload.
3. Mark the applicable consent record with `withdrawn_at` and the approved withdrawal source through a future reviewed service operation. Never rewrite append-only feedback or certification history directly.
4. Prevent future owner-review, certification, export and training eligibility for the withdrawn purpose.
5. For original-photo withdrawal, schedule deletion through the Storage API and then reconcile the governed upload record. Do not delete rows directly from `storage.objects`.
6. For results withdrawal, exclude the raw contribution from future review/export while retaining only the minimum audit record required to prove the request and action.
7. Record limitations accurately: backup propagation and previously completed authorized processing may not be reversible immediately.
8. Notify the requester only after the database and Storage outcomes are verified. Do not claim universal deletion from configuration changes alone.
