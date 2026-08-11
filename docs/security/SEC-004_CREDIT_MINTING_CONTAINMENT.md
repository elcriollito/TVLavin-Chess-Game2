# SEC-004 Credit Minting Containment

## Finding

- **Severity:** High
- **Confidence:** High
- **Endpoint:** `POST /api/credits/add`
- **Status:** Contained in source; release pending

The original authorization flow was:

```text
verified Clerk identity
  -> client-selected amount (1-10000)
  -> client-selected reason
  -> target defaults to authenticated user
  -> service-role add_credits RPC
  -> balance increase
```

An ordinary authenticated user could therefore manufacture paid/valuable application credits without payment, admin authority, a signed webhook, or a server-calculated entitlement. Authentication established identity but no grant authority.

## Intended credit sources

Repository evidence identifies the signature-verified Stripe webhook as the legitimate credit-award mechanism. It derives amounts from server-created checkout metadata and fixed renewal logic, then calls the database RPC directly. No frontend, administrative handler, or trusted internal service calls `/api/credits/add`.

## Containment

The standalone endpoint is disabled and always returns `403 CREDIT_GRANTS_DISABLED` for POST requests. It no longer reads request identity, target user, amount, reason, role, or premium status and contains no database client or credit mutation call. Signed Stripe webhook fulfillment remains unchanged.

## Verification

`tests/legacy-security-containment.test.js` verifies denial of small and maximum grants, forged reasons, role and premium flags, cross-user identifiers, and unauthenticated calls. Static guards ensure the route cannot read `req.body` or call the credit RPC.

## Residual risks

- Shared Mentor credit deduction uses a read-then-write sequence and may race under concurrency.
- The atomicity and authorization of database credit RPCs require continued audit.
- Premium enforcement, webhook failure/idempotency behavior, refunds, promotions, and administrative grants remain outside this containment task.
- Production release and non-destructive verification are pending explicit authorization.
