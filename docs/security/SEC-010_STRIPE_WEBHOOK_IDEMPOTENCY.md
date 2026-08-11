# SEC-010 Atomic Stripe Webhook Idempotency

Status: **REMEDIATED LOCALLY**

## Original race

The previous signature-verified handler performed:

```text
select stripe_events by event.id
-> fulfill credits/premium
-> insert stripe_events
```

Two serverless invocations could both observe no row and both grant value. The primary key rejected the second ledger insert only after both side effects. Lookup and insert failures were non-blocking, so idempotency failed open.

Affected economic handlers were:

| Stripe event | Previous effect |
| --- | --- |
| `checkout.session.completed` / credits | Metadata amount passed to `add_credits`. |
| `checkout.session.completed` / subscription | Premium enabled and customer recorded. |
| `invoice.paid` | 50 renewal credits. |
| `customer.subscription.deleted` | Premium disabled. |

No other Stripe event type mutates economics in the repository. In particular, `payment_intent.succeeded` and `invoice.payment_succeeded` are not handled, so there is no overlapping cross-event grant path.

## Authenticity and entitlement

The route continues using the official Stripe SDK `webhooks.constructEvent()` over the raw request body and server-only webhook secret. Invalid signatures return 400 before database access. There is no unsigned JSON fallback and normal Stripe timestamp-tolerance behavior remains owned by the official SDK.

Checkout credit value no longer comes from `metadata.credits_amount`. The signed, server-created package name selects the fixed allowlist `starter=25`, `standard=75`, `pro=200`; the database independently permits only those values. Checkout fulfilment additionally requires the correct Stripe mode and `payment_status=paid`. Renewal credit is fixed to 50 in server and database contracts.

New Checkout Sessions include immutable CAISSA `users.id` as their durable account reference. The RPC requires that UUID and the session customer match the same user. Older pre-cutover sessions may fall back to the server-created legacy Clerk subject, but only together with the matching unique Stripe customer. Invoice and subscription events resolve by unique `stripe_customer_id`. Email is never used.

## Atomic transaction

`fulfill_stripe_webhook_event` performs one PostgreSQL transaction:

```text
validate event/operation/entitlement
-> insert PROCESSING event claim
-> lock authoritative user
-> apply credit or premium mutation
-> write credit event when applicable
-> mark Stripe event COMPLETED
-> commit
```

The event primary key permits one claim per Stripe `event.id`. A partial unique index permits one event per business operation:

- one-time purchase or activation: `checkout_session:<session.id>`;
- renewal: `invoice:<invoice.id>`;
- subscription deletion: `subscription_delete:<subscription.id>`.

Therefore, different Stripe event IDs representing the same economic object cannot fulfill twice. Independent sessions and invoices remain independent.

`PROCESSING` exists only inside the transaction. Any lookup, mutation, credit-log or completion failure rolls back the claim and all economic changes, allowing a later Stripe retry to claim safely. A concurrent duplicate waits on database uniqueness and then receives an already-completed/processing result without mutation.

## Response and failure policy

| Condition | Response | Effect |
| --- | --- | --- |
| Invalid signature/body | 400 | No DB access/effect. |
| Unsupported or permanently malformed signed event | 200 ignored/rejected | No economic effect; avoids infinite retry. |
| Completed/current duplicate | 200 | No replay. |
| Business-operation duplicate | 200 | No replay. |
| Missing account/customer mapping | 500 | Transaction rolls back; Stripe may retry and operations reconcile. |
| Database/mid-transaction failure | 500 | Claim and side effects roll back. |
| HTTP loss after commit | Stripe retries | Retry sees completed claim and grants nothing. |

Logs exclude payloads, signatures, customers, subjects, emails, card data and secrets. They may contain Stripe event ID/type and processing status as operational identifiers.

## PostgreSQL security and evidence

The ledger has RLS enabled and no browser policy. Direct table access is denied to `anon`, `authenticated` and `service_role`; only the service-role RPC is executable. The function is owned by `postgres`, uses `SECURITY DEFINER`, fixed `search_path=public`, schema-qualified application objects and no dynamic SQL.

Isolated PostgreSQL 17.6 rehearsal passed 15/15 checks, including two and ten simultaneous duplicates, business-key collision, independent purchases, pre/mid/post-commit failure, renewal, subscription activation, deletion, forged amount, cross-user mapping, RLS and RPC permissions. Ten identical deliveries produced exactly one grant. Local webhook tests passed 13/13 checks for signature ordering, fixed economic allowlists, paid-state and mode validation, duplicate outcomes, malformed events, retry behavior, and regression guards.

## SEC-005 interaction

SEC-010 does not enable Clerk migration mode or switch credentials. Current legacy Checkout Sessions remain compatible through legacy subject plus customer matching. New sessions prefer internal UUID. The approved cutover policy remains to drain/expire pre-cutover sessions before activating production identities.

## Residual risks

- Existing production data must have one user per non-null Stripe customer before the unique index can be applied.
- Refund/chargeback entitlement reversal is not implemented and requires a separate product/accounting policy.
- Concurrent checkout creation can still race while creating a new Stripe customer; this is outside webhook replay containment and should receive separate hardening.
- Production migration, deployment and Stripe live validation were not performed.
