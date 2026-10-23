# CAISSA Account Control — Final Hosted Retest Plan

Status: `HOSTED_RETEST_APPROVAL_PENDING`  
Stacked PR: [#101](https://github.com/elcriollito/TVLavin-Chess-Game2/pull/101), based on #97.

This is an execution plan, not authorization to deploy, apply SQL, create users, or mutate hosted state.

## Human approvals required

Before any hosted action, obtain explicit approval for the exact:

- PR head/deployment SHA containing implementation commits `b440a6ce` and `efcf9b2d`.
- Custom Staging deployment and preview-to-Staging promotion mechanism.
- Supabase Staging SQL application and subsequent teardown.
- Clerk Development A/B fixture creation and deletion.
- Private run manifest, UUIDs, authorization hashes, reason, expiry, and cleanup receipts.

No approval is implied for Production, main merge, historical users, Reset, or Delete Account.

## Action-time preflight

1. Confirm PR #97 and PR #101 have the intended exact heads, reviews, and successful checks.
2. Confirm the deployed revision is the approved SHA and includes both implementation commits.
3. Confirm Vercel target is Custom Staging, never Production.
4. Confirm Clerk Dashboard and keys are Development.
5. Confirm Supabase project ref is exactly `aqizagaskicotorfpwfn` and the live `system_identifier` is exactly `7678069749886157684`.
6. Recompute the SQL artifact hashes and require:
   - Provisioning: `5bb1f13d17f4cf2a858431ca55b3e056c3c726898603244bdc51cc23e4b0a1f1`.
   - Teardown: `245fc92bcdeda305258f00541bc7876ffaa1e58e6683acb7cb4e9632e703fd20`.
7. Record the exact empty data/schema baseline, fixture inventory, and absence of the private fixture namespace.
8. Create/approve exactly two new A/B Development fixtures; stop on any pre-existing subject, UUID, binding, review, entitlement, Stripe state, or unexpected resource.

## Hosted execution

1. Apply the reviewed provisioning artifact only through the approved owner channel.
2. Authorize exact A and B rows from the private manifest.
3. Provision each identity and verify one new UUID, one active `legacy_development` binding, and one `VERIFIED`/`NEW_ACCOUNT` review per fixture.
4. Log in legitimately as A and B through Clerk Development.
5. Exercise real first-factor Session Verification for each applicable factor path. Record only sanitized status/code metadata.
6. Confirm the refreshed JWT has backend-certified recent `fva[0]`, matching `sid` and `sub`, before controls unlock.
7. Confirm Account Summary succeeds for each verified owner without 409.
8. Create or identify safe differentiated fixture data, then export A and B.
9. Prove bidirectional isolation: A cannot read B data and B cannot read A data. Empty identical exports are insufficient if differentiated safe data can be created.
10. Revoke each Clerk Development session and run the minimum residual-token regression on the new SHA. Require HTTP 401. Do not redo unrelated historical revocation work.
11. Do not execute hosted Reset or Delete Account.

## Cleanup and exact restoration

1. Remove any test-only protected/differentiating rows through their authorized cleanup path.
2. Run exact database fixture cleanup for A and B; stop on any scope mismatch or protected dependency.
3. Revoke remaining sessions and delete only the two exact Clerk Development fixtures.
4. Verify both Clerk users no longer exist and no associated sessions remain.
5. Record external cleanup receipt hashes, then finalize both database authorizations.
6. Require zero fixture users, bindings, reviews, synthetic data, and authorization rows.
7. Run the guarded teardown artifact. It must refuse any residue or unexpected object; never use `CASCADE`.
8. Verify the private schema is absent and Supabase Staging matches the pre-run data and schema baseline exactly.
9. Confirm Clerk Production, Supabase Production, credentials, settings, and unrelated users were untouched.

## Mandatory stop conditions

Stop immediately on a project/cluster/hash/SHA mismatch; unexpected user or object; historical or cross-authority collision; partial identity state; non-empty authorization ledger; protected dependency; isolation failure; non-401 residual token; failed real reverification; or any request to weaken ownership.

## Passing state

Only after all hosted evidence and cleanup are complete may a separate certification declare Hosted PASS. Until then the state remains:

`CAISSA_ACCOUNT_CONTROL_V1 — REAUTH_AND_IDENTITY_LOCAL_CERTIFIED / HOSTED_RETEST_APPROVAL_PENDING`

