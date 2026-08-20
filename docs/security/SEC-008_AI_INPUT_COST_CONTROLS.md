# SEC-008 — AI Input and Cost Controls

Status: remediated locally; not deployed or production-verified. `api/_lib/mentor-request-policy.js` owns the strict schema and rejects unknown fields.

| Control | Limit |
| --- | ---: |
| HTTP JSON body | 65,536 bytes |
| Messages | 24 |
| Each message | 12,000 characters |
| Aggregate messages | 40,000 characters |
| Engine report | 16,000 UTF-8 bytes |
| BYO key transport | 512 characters, no CR/LF |
| Shared output | 768 tokens |
| BYO output | 1,024 tokens |
| Response content | 65,536 characters |
| Provider timeout | 20 seconds |
| Temperature | finite 0–1.5 |

Roles are `system`, `user`, and `assistant`. Existing UX needs a browser-constructed chess system prompt, so exactly one is allowed in first position. It is LLM text, not server authority: it cannot alter endpoint, model allowlist, credits, authentication, rate policy or tools.

Providers are fixed to Together, Llama, OpenAI and Anthropic. Custom/local/unknown endpoints are rejected. BYO models are limited to Together Llama 3.3 70B/4 Scout, Meta Llama Scout/3.3 70B, OpenAI `gpt-4o-mini`, and Anthropic Claude 3.5 Haiku/Sonnet. Shared mode uses server-only `TOGETHER_MODEL`, itself restricted to Kimi K2.5 or Together Llama 3.3 70B. Client maxTokens is numeric and capped.

Model, aggregate input, output and timeout form the cost ceiling. Provider failures are generic. CAISSA-funded Shared Mentor requires both `MENTOR_AI_ENABLED=true` and `MENTOR_SHARED_AI_ENABLED=true` as exact lowercase ASCII values; missing or malformed values fail closed. Either gate set to `false` independently disables Shared Mentor. Both are server-only emergency controls. BYO remains governed by its independent authenticated, allowlisted-provider policy.
