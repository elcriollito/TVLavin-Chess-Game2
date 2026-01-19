# CAISSA Chess - Cloudflare Worker Deployment Guide

## Overview

This Cloudflare Worker handles Chess.com and Lichess game fetching to bypass browser CORS restrictions.

**Worker Purpose:**
- Fetch games from Chess.com and Lichess server-side
- Add proper CORS headers for caissa-chess.org
- Cache responses for 60 seconds
- Rate limiting (10 requests/minute per IP)

---

## Prerequisites

1. **Cloudflare Account**
   - Sign up at https://cloudflare.com
   - Add your domain `caissa-chess.org` to Cloudflare (already done)

2. **Wrangler CLI** (Cloudflare Workers CLI)
   ```bash
   npm install -g wrangler
   ```

3. **Authenticate Wrangler**
   ```bash
   wrangler login
   ```

---

## Deployment Steps

### Step 1: Deploy the Worker

Navigate to the worker directory and deploy:

```bash
cd cloudflare-worker
wrangler deploy
```

**Expected Output:**
```
✨ Built successfully
🌍 Uploading...
✨ Deployment complete!
https://caissa-game-fetcher.your-subdomain.workers.dev
```

**Note:** The initial deployment gives you a `*.workers.dev` subdomain. We'll add a custom domain next.

---

### Step 2: Test the Worker

Test the health endpoint:

```bash
curl https://caissa-game-fetcher.your-subdomain.workers.dev/api/health
```

Expected response:
```json
{
  "ok": true,
  "service": "CAISSA Chess Game Fetcher",
  "version": "1.0.0",
  "timestamp": "2024-01-19T..."
}
```

Test game fetching:
```bash
curl "https://caissa-game-fetcher.your-subdomain.workers.dev/api/games?platform=lichess&username=DrNykterstein&max=5&tc=rapid"
```

---

### Step 3: Add Custom Domain (api.caissa-chess.org)

#### Option A: Via Cloudflare Dashboard (Recommended)

1. Go to **Cloudflare Dashboard** → **Workers & Pages**
2. Click on your worker: `caissa-game-fetcher`
3. Go to **Settings** → **Triggers**
4. Under **Custom Domains**, click **Add Custom Domain**
5. Enter: `api.caissa-chess.org`
6. Click **Add Domain**

Cloudflare will automatically:
- Create DNS records
- Provision SSL certificate
- Route traffic to your worker

**Wait 1-2 minutes** for DNS propagation.

#### Option B: Via Wrangler CLI

Add to `wrangler.toml`:
```toml
routes = [
  { pattern = "api.caissa-chess.org/*", zone_name = "caissa-chess.org" }
]
```

Then deploy:
```bash
wrangler deploy
```

---

### Step 4: Verify Custom Domain

Test the custom domain:

```bash
curl https://api.caissa-chess.org/api/health
```

Expected response:
```json
{
  "ok": true,
  "service": "CAISSA Chess Game Fetcher",
  "version": "1.0.0"
}
```

---

## API Documentation

### Base URL

- **Production:** `https://api.caissa-chess.org`
- **Workers Dev:** `https://caissa-game-fetcher.your-subdomain.workers.dev`

---

### Endpoints

#### 1. Health Check

**GET** `/api/health`

Returns worker status.

**Response:**
```json
{
  "ok": true,
  "service": "CAISSA Chess Game Fetcher",
  "version": "1.0.0",
  "timestamp": "2024-01-19T15:30:00.000Z"
}
```

---

#### 2. Fetch Games

**GET** `/api/games`

Fetches recent games from Chess.com or Lichess.

**Query Parameters:**

| Parameter  | Required | Values                              | Default | Description                    |
|------------|----------|-------------------------------------|---------|--------------------------------|
| `platform` | Yes      | `chesscom`, `lichess`               | -       | Chess platform                 |
| `username` | Yes      | string                              | -       | Username on the platform       |
| `max`      | No       | 1-50                                | 20      | Maximum number of games        |
| `tc`       | No       | `all`, `bullet`, `blitz`, `rapid`   | `all`   | Time control filter            |

**Example Request:**
```bash
curl "https://api.caissa-chess.org/api/games?platform=chesscom&username=Hikaru&max=20&tc=blitz"
```

**Success Response (200):**
```json
{
  "pgn": "[Event \"Live Chess\"]\n[Site \"Chess.com\"]\n...",
  "count": 20,
  "source": "chess.com",
  "warnings": [],
  "cached": false,
  "timestamp": "2024-01-19T15:30:00.000Z"
}
```

**Error Response (400):**
```json
{
  "error": "Missing parameter",
  "message": "Username is required"
}
```

**Error Response (404):**
```json
{
  "error": "Fetch failed",
  "message": "Chess.com user \"InvalidUser\" not found",
  "platform": "chesscom",
  "username": "InvalidUser"
}
```

**Rate Limit Response (429):**
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please wait a minute and try again."
}
```

---

## CORS Configuration

The worker allows requests from:
- `https://caissa-chess.org`
- `https://www.caissa-chess.org`
- `https://*.vercel.app` (for Vercel previews)
- `http://localhost:8080` (local development)
- `http://127.0.0.1:8080`

To add more origins, edit `ALLOWED_ORIGINS` in `worker.js`:

```javascript
const ALLOWED_ORIGINS = [
  'https://caissa-chess.org',
  'https://www.caissa-chess.org',
  'https://your-new-domain.com'
];
```

Then redeploy:
```bash
wrangler deploy
```

---

## Caching

- **Cache Duration:** 60 seconds
- **Cache Key:** `platform:username:timecontrol:maxgames`
- **Cache Storage:** Cloudflare Cache API (global CDN)

Cached responses include `"cached": true` in the JSON response.

---

## Rate Limiting

- **Limit:** 10 requests per minute per IP
- **Window:** 60 seconds
- **Storage:** In-memory (resets on Worker restart)

For production rate limiting, consider using Cloudflare Durable Objects or KV storage.

---

## Monitoring & Logs

### View Logs

**Via Dashboard:**
1. Go to **Workers & Pages**
2. Click on `caissa-game-fetcher`
3. Go to **Logs** tab
4. View real-time logs

**Via CLI:**
```bash
wrangler tail
```

### View Analytics

1. Go to **Workers & Pages**
2. Click on `caissa-game-fetcher`
3. Go to **Metrics** tab
4. View requests, errors, CPU usage

---

## Updating the Worker

After making changes to `worker.js`:

```bash
wrangler deploy
```

Changes are deployed instantly (no downtime).

---

## Troubleshooting

### Issue: "Worker not found"

**Solution:** Make sure you're logged in to the correct Cloudflare account:
```bash
wrangler whoami
wrangler login
```

---

### Issue: "Custom domain not working"

**Solution:**
1. Check DNS records in Cloudflare dashboard
2. Wait 2-5 minutes for DNS propagation
3. Clear browser cache
4. Try in incognito mode

---

### Issue: "CORS error in frontend"

**Solution:**
1. Verify origin is in `ALLOWED_ORIGINS` list
2. Check that worker is returning correct CORS headers:
   ```bash
   curl -H "Origin: https://caissa-chess.org" -v https://api.caissa-chess.org/api/health
   ```
3. Look for `Access-Control-Allow-Origin` header in response

---

### Issue: "Chess.com/Lichess API errors"

**Solution:**
1. Verify username exists on the platform
2. Check if user has public games
3. Try with a different username (e.g., "Hikaru" on Chess.com)
4. Check worker logs for detailed error messages

---

## Cost

**Cloudflare Workers Free Tier:**
- 100,000 requests/day
- No credit card required
- Perfect for CAISSA Chess usage

If you exceed free tier:
- $0.50 per million requests after 10M requests/month
- Very unlikely for a chess app

---

## Security Notes

1. **No sensitive data:** Worker doesn't store credentials or private data
2. **Public APIs only:** Only uses public Chess.com and Lichess endpoints
3. **Rate limiting:** Prevents abuse (10 req/min per IP)
4. **CORS whitelist:** Only allows requests from caissa-chess.org domains

---

## Next Steps

After deploying the worker:

1. ✅ Deploy worker: `wrangler deploy`
2. ✅ Add custom domain: `api.caissa-chess.org`
3. ✅ Test endpoints
4. ✅ Update frontend to use new API (see FRONTEND_INTEGRATION.md)
5. ✅ Monitor logs for errors
6. ✅ Test with real users

---

## Support

- **Cloudflare Docs:** https://developers.cloudflare.com/workers/
- **Wrangler Docs:** https://developers.cloudflare.com/workers/wrangler/
- **Community:** https://discord.gg/cloudflaredev
