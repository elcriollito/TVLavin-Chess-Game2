# CAISSA FICS Gateway Worker PoC

Secure WebSocket-to-TCP proof of concept:

```text
Browser WSS -> Cloudflare Worker -> TCP freechess.org:5000
```

This project is intentionally isolated from the CAISSA production UI.

Repository location: `gateway/fics-cloudflare-worker/`.

## Routes

- `GET /health`: service and target status.
- `GET /ws`: WebSocket upgrade route. Each text frame is forwarded to FICS as
  one command followed by a newline. FICS TCP output is returned as text frames.

## Safety

- Exact origin allowlist.
- Production accepts only `https://www.caissa-chess.org`; local and preview
  origins are isolated from the production Worker.
- Ten messages per second by default.
- 4 KiB maximum browser message length.
- Ten-minute idle timeout.
- Two-hour maximum session duration.
- Both transport sides close together on error or disconnect.

## Commands

```bash
npm test
npm run dev
npm run smoke
npm run load:5
npm run load:20
npm run load:100
npm run long:1
npm run long:5
npm run long:20
```

Deployment is intentionally explicit. The top-level Wrangler target is the
existing production Worker (`caissa-fics-gateway-poc`) because converting it to
a named environment would create a differently named Worker. Staging is a
separate, route-less `caissa-fics-gateway-poc-staging` Worker and denies every
Origin until one exact preview origin is supplied at deploy time.

```bash
# Production: exact committed production origin, custom domain, no workers.dev.
npm run deploy:production

# Staging: one exact public HTTPS preview origin; never use a wildcard.
CAISSA_FICS_STAGING_ORIGIN=https://fics-rc-preview.example.vercel.app npm run deploy:staging

# Render and validate the staging bundle without deploying it.
CAISSA_FICS_STAGING_ORIGIN=https://fics-rc-preview.example.vercel.app npm run deploy:staging -- --dry-run
```

To test a deployed Worker:

```bash
FICS_GATEWAY_URL=https://worker.example.workers.dev npm run smoke
```

## Load-Test Rollout

1. Run five simultaneous sessions and require 5/5 banners.
2. Run twenty simultaneous sessions and require 20/20 banners.
3. Run one hundred sessions only after checking Cloudflare Worker logs and FICS
   behavior for throttling or guest-session limits.
