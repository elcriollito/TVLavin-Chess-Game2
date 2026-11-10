# PR #117 Polyglot residual-risk register

Status date: 2026-11-09  
Release scope: Downloads, Polyglot Online, Opening Database HQA-06 preservation  
Candidate before deployment-path correction: `b75d04183cb78e7e69417bcbeefcae5a8dffbe3e`

The owner assigned these eleven findings to a separate security season. This is
a time-bounded deferral of unchanged historical risk, not a finding closure.
Any new exposure, worsening, credential disclosure, failed compensating control,
or severity increase reopens the applicable release gate immediately.

| Rule | Severity | Exposure and impact | Existing compensating controls | Remediation owner | Target |
| --- | --- | --- | --- | --- | --- |
| `resource-exhaustion.fics-connection-admission` | Medium | Public WebSocket can open one FICS TCP connection per session without a deployment-wide lease; availability/provider-abuse risk. | Exact production Origin, fixed `freechess.org:5000`, message-size/rate, idle and two-hour session limits. | FICS gateway maintainer | Security S1, 2026-11-23: shared per-source/global connection admission. |
| `sensitive-data.fics-password-logging` | Medium | The retired-capable Node bridge logs every browser command; if deployed for registered login, plaintext FICS passwords enter PM2 stdout. | Current public endpoint responds as the Cloudflare Worker, whose command path does not log message bodies. Browser clears its local password after sending. | FICS legacy operations | Security S0, 2026-11-16: verify/purge legacy PM2 logs and remove command-body logging before any Node bridge reuse. |
| `resource-exhaustion.scanner-inference-admission` | Medium | Anonymous inference can multiply CPU/native-memory work across instances and the response timeout does not terminate ONNX work. | Public-beta gate, 1.5 MiB body/512x512 shape, per-process rate limit, constrained ONNX threading. | Scanner service maintainer | Security S2, 2026-12-09: distributed compute admission and terminable isolation. |
| `resource-exhaustion.scanner-retained-storage` | Medium | Anonymous rows and authenticated images lack durable per-principal row/byte/TTL quotas; storage and bandwidth cost risk. | Feature gate, per-request limits, authenticated image ownership, hash/dedup checks, authorization before image-body read. | Scanner storage maintainer | Security S2, 2026-12-09: transactional quotas and retention cleanup. |
| `resource-exhaustion.smallchess-proxy-buffering` | Medium | Unauthenticated legacy route buffers the upstream response before its 10 MiB check; memory, duration and bandwidth risk. | Fixed provider and filename allowlist; response rejected before client delivery. | PGN infrastructure maintainer | Security S1, 2026-11-23: retire with 410 or add deadline, streaming cap and shared admission. |
| `resource-exhaustion.pgnmentor-deployment-quota` | Medium | Public event downloads use per-instance rate/concurrency state; aggregate provider and function cost remains possible. | Exact query/file allowlist, 10-second timeout, required length, streamed 12 MiB cap, CDN cache. | PGN infrastructure maintainer | Security S2, 2026-12-09: shared quota/lease and HEAD accounting. |
| `resource-exhaustion.opening-cache-thrash` | Medium | Valid archive-key misses can repeat download, verification and decompression across instances. | Early page validation, timeout, pinned size/hash/counts, same-key single-flight, active-key guard and CDN cache. | Opening Database maintainer | Security S2, 2026-12-09: precomputed pages or durable shared build lease/cache. |
| `resource-exhaustion.library-sync-storage` | Medium | Authenticated bulk writes cap item count but not total/nested bytes, request rate or account storage. | Valid Clerk identity, account-bound rows, 200-item outer caps and selected scalar limits. | Library Sync maintainer | Security S2, 2026-12-09: body/nested limits, shared write quota and stored-byte accounting. |
| `resource-exhaustion.pgn-parser-postlimit` | Low | A user-selected or approved-source PGN can consume Worker CPU/memory before post-parse structural limits run. | 10 MiB input cap, dedicated Worker, post-parse limits, replacement of the prior Worker on a new parse. | PGN Reader maintainer | Security S3, 2027-01-08: preflight/in-parse budgets and wall-clock termination. |
| `resource-exhaustion.scanner-image-decode` | Low | An authenticated retained image or local selection can reach browser decode before all dimensions/frame complexity are known. | Encoded-size limits, known-dimension checks, bounded post-decode canvas, private reviewer access. | Scanner imaging maintainer | Security S2, 2026-12-09: determinate metadata and isolated bounded decode. |
| `resource-exhaustion.lichess-relay` | Low | Anonymous requests fan out to Lichess without shared provider quota or reusable success cache. | Fixed host, strict parameters, 50-game maximum and eight-second abort. | Provider relay maintainer | Security S3, 2027-01-08: shared quotas, coalescing, cache and streaming cap. |

## FICS credential-exposure determination

Static evidence confirms that `gateway/fics-local-node/fics-gateway.cjs` logs
the complete WebSocket command and that the historical PM2 configuration writes
stdout to `/var/log/fics-gateway/out.log`. A registered FICS password is sent as
a normal command, so any active use of that Node bridge would expose a real
credential to its operators and log readers.

The current public endpoint was checked on 2026-11-09. Its `/health` response was
served through Cloudflare and exactly identified `caissa-fics-gateway` targeting
`freechess.org:5000`, matching `gateway/fics-cloudflare-worker/src/worker.js`.
That Worker forwards commands without logging their contents. No FICS log file
is tracked in the repository. Therefore there is no evidence that the current
public gateway logs registered-user passwords.

Historical VPS/PM2 retention cannot be proven from this repository. The FICS
operations owner must still verify whether a legacy host exists, purge any
retained `out.log`, rotate any credential shown there, and remove command-body
logging before that bridge can ever be used again.

## Release boundary

The final exact-commit scan remains visible and its findings remain open. This
register permits the Polyglot release to proceed only because these issues are
pre-existing, unchanged or reduced relative to production, and unrelated to the
new Downloads/Polyglot execution path. Portable publication has its own source,
license, artifact-integrity and safety gates.
