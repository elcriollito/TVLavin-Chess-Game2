# CAISSA Chess - Game Fetcher Worker

Cloudflare Worker that fetches games from Chess.com and Lichess to bypass browser CORS restrictions.

## Quick Start

### 1. Install Wrangler

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Deploy

```bash
wrangler deploy
```

### 4. Test

```bash
curl "https://caissa-game-fetcher.YOUR-SUBDOMAIN.workers.dev/api/health"
```

## Features

- ✅ Fetch games from Chess.com and Lichess
- ✅ Bypass CORS restrictions
- ✅ 60-second caching for performance
- ✅ Rate limiting (10 req/min per IP)
- ✅ Filter by time control (bullet/blitz/rapid)
- ✅ Automatic PGN normalization
- ✅ Custom domain support (api.caissa-chess.org)

## API Endpoints

### Health Check
```bash
GET /api/health
```

### Fetch Games
```bash
GET /api/games?platform=chesscom&username=Hikaru&max=20&tc=blitz
```

**Parameters:**
- `platform` (required): `chesscom` or `lichess`
- `username` (required): Username on platform
- `max` (optional): Max games (1-50, default 20)
- `tc` (optional): Time control filter (`all`, `bullet`, `blitz`, `rapid`, default `all`)

## Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide
- [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) - Frontend integration guide

## Architecture

```
Browser (caissa-chess.org)
    ↓ CORS-safe request
Cloudflare Worker (api.caissa-chess.org)
    ↓ Server-side fetch
Chess.com / Lichess API
    ↓ PGN data
Cloudflare Worker (normalize + cache)
    ↓ JSON response
Browser (parse + analyze)
```

## Cost

**Free Tier:**
- 100,000 requests/day
- Perfect for CAISSA Chess

## Support

- **Docs:** See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues:** Check Cloudflare dashboard logs
- **Community:** https://discord.gg/cloudflaredev
