# SEC-003 Legacy SSRF Containment

## Finding

- **Severity:** High
- **Confidence:** High
- **CWE:** CWE-918
- **Runtime:** `npm start` → `node server.js`
- **Endpoint:** `POST /api/mentor/chat`
- **Status:** Contained in source; release pending

The original flow was:

```text
request body
  -> data.endpoint
  -> provider custom/default
  -> apiUrl = data.endpoint
  -> Authorization: Bearer <BYO key>
  -> fetch(apiUrl)
```

The remotely selectable `local` provider also caused the server to request `localhost:1234`.

## Reachability

The repository's `start` script runs `server.js`, establishing local-development exposure and potential alternate-deployment exposure. Current Vercel production builds `api/mentor/chat.js` as a serverless function and provides no static evidence that `server.js` handles production requests. The legacy server remains an executable supported entrypoint and is therefore security-relevant.

## Containment

The legacy handler now resolves Together, Llama, OpenAI, and Anthropic through an immutable fixed endpoint registry matching the secured Vercel implementation. Custom and local providers return stable 400 errors before request validation or fetch. Unknown providers fail closed. All supported outbound requests set `redirect: 'error'`.

BYO credentials are constructed only after provider validation. Together, Llama, and OpenAI use Bearer authorization; Anthropic uses `x-api-key`. No request-controlled hostname can receive these credentials.

## Verification

`tests/legacy-security-containment.test.js` mocks all outbound fetches and covers custom, loopback, metadata-style, unknown, local, all four supported providers, credential binding, redirect rejection, and static regression guards. No real provider or private-network request is made.

## Residual risks

- The legacy route remains anonymous BYO infrastructure without durable rate limiting.
- Client-controlled models, token counts, temperature, and message volume require broader review.
- Provider response/error handling and LLM-output rendering remain in the resumed audit.
- Alternate deployment exposure still requires operational verification.
