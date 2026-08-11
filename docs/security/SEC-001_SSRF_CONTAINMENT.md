# SEC-001 SSRF Containment

## Status

SEC-001 is contained in source code and local regression tests. Production verification is pending deployment; this task did not push or deploy.

## Original vulnerability

- **Finding:** SEC-001 — server-side arbitrary outbound request / likely SSRF
- **Severity:** High
- **CWE:** CWE-918, Server-Side Request Forgery
- **Endpoint:** `POST /api/mentor/chat`

The original source-to-sink flow was:

```text
HTTP request body
    -> endpoint
    -> provider === "custom"
    -> apiUrl = endpoint
    -> fetch(apiUrl)
```

The same branch constructed `Authorization: Bearer <user-supplied apiKey>`. This created SEC-002: a BYO credential could be forwarded to a request-controlled destination. The route did not require authentication in BYO mode.

## Containment design

Server destinations are now selected exclusively from an immutable backend registry:

| Provider | Fixed destination |
| --- | --- |
| Together | `https://api.together.xyz/v1/chat/completions` |
| Llama | `https://api.llama.com/v1/chat/completions` |
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Anthropic | `https://api.anthropic.com/v1/messages` |

The request body no longer supplies or influences `apiUrl`. Unknown providers are rejected with `UNKNOWN_PROVIDER`. Server-side `custom` is explicitly rejected with `CUSTOM_PROVIDER_DISABLED`; server-side `local` is rejected with `LOCAL_PROVIDER_DISABLED`, eliminating the route's fixed loopback fetch as well.

BYO credentials are constructed only after provider validation and can be sent only to that provider's fixed destination. Anthropic retains its `x-api-key` header; the other supported providers retain Bearer authorization. No supplied key is logged or returned in the new errors.

The previous global dependency on `TOGETHER_API_KEY` was narrowed to shared Together mode. Independent OpenAI, Anthropic, Llama, and Together BYO requests no longer require the CAISSA-owned Together key.

## Custom-provider and streaming policy

Arbitrary custom endpoints are disabled rather than URL-filtered. The frontend proxy request does not send an endpoint field. Direct-browser `chatStream()` previously allowed `this.config.endpoint` to override a provider destination; custom streaming is now explicitly unavailable and streaming resolves only the selected built-in provider's endpoint.

Direct-browser streaming remains a client-to-provider design for supported providers. It is not SSRF, but it exposes a BYO key to browser JavaScript and sends it directly to the selected provider. This architecture requires continued review during the resumed audit.

## Redirect policy

All server-side LLM fetches set `redirect: 'error'`. Trusted initial endpoints therefore cannot automatically redirect the server or a supplied credential to another destination.

## Test evidence

`tests/mentor-ssrf-containment.test.js` uses mocked outbound fetches only and covers:

- custom endpoint rejection with zero fetches;
- loopback, metadata-style, and private-IP endpoint inputs;
- unknown-provider rejection without fallback;
- rejection of server-side local-provider loopback;
- fixed OpenAI and Anthropic endpoint mapping;
- provider-specific credential headers;
- ignored attacker endpoint fields for supported providers;
- `redirect: 'error'`;
- static guards against reintroducing request-controlled fetch targets;
- disabled custom browser streaming.

No test contacts external infrastructure and all keys are obvious non-secret sentinels.

## Residual risks

- Anonymous BYO requests remain supported, preserving existing behavior. Authentication and abuse controls require separate review.
- BYO keys exist in browser memory and traverse CAISSA's server proxy for non-streaming calls.
- Supported-provider direct-browser streaming exposes the BYO key to browser execution context.
- The server route has no durable distributed rate limiting for anonymous BYO usage.
- Client-controlled model, token, temperature, message-count, and message-size controls require broader cost and resource-abuse review.
- Premium and credit enforcement, including concurrency safety of credit deduction, remains outside this containment task.
- Production verification remains pending deployment.
