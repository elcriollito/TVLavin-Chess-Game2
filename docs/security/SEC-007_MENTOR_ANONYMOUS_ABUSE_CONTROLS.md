# SEC-007 — Mentor Anonymous Abuse Controls

Status: remediated locally; not deployed or production-verified.

Previously, anonymous BYO OpenAI, Anthropic, Together and Llama requests traversed `/api/mentor/chat`. CAISSA parsed JSON, occupied serverless execution, invoked a provider, parsed its response and returned it. The caller paid provider tokens but could consume CAISSA compute and bandwidth.

All proxied Mentor modes now require verified Clerk identity. Shared Together additionally requires atomic SEC-006 credit authorization unless trusted database state says Premium. BYO consumes no CAISSA credits but receives identical durable user/global/concurrency controls. Limiter database failure fails closed for both modes. API keys are not logged, persisted, or used as limiter identity.

Direct `chatStream` remains browser-to-provider BYO traffic: it does not traverse CAISSA serverless or select a CAISSA server destination. The legacy Node Mentor route returns `410 MENTOR_PROXY_RETIRED`. Anonymous IP attribution was deliberately avoided because proxy access now requires identity.

Multiple accounts, stolen accounts, VPNs and direct-provider abuse remain ecosystem limitations, not anonymous CAISSA proxy access.
