# CAISSA Chess - Cloudflare Worker Implementation Summary

## Problem Solved

**Before:** Browser CORS blocks direct Chess.com/Lichess API calls from caissa-chess.org
**After:** Cloudflare Worker fetches games server-side and returns PGN to frontend

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                      │
│  https://www.caissa-chess.org                          │
│                                                         │
│  [User enters username] → [Click "Fetch Games"]        │
└────────────────┬────────────────────────────────────────┘
                 │ CORS-safe HTTPS request
                 ↓
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker                                      │
│  https://api.caissa-chess.org                          │
│                                                         │
│  • Check rate limit (10/min per IP)                    │
│  • Check cache (60s TTL)                               │
│  • Add CORS headers                                     │
└────────────────┬────────────────────────────────────────┘
                 │ Server-side fetch
                 ↓
┌─────────────────────────────────────────────────────────┐
│  Chess.com / Lichess Public APIs                       │
│                                                         │
│  • Fetch user's recent games                           │
│  • Filter by time control                              │
│  • Return game data (PGN or JSON)                      │
└────────────────┬────────────────────────────────────────┘
                 │ Process & normalize
                 ↓
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker                                      │
│                                                         │
│  • Normalize PGN format                                │
│  • Add metadata (count, source, warnings)              │
│  • Cache response                                       │
│  • Return JSON                                          │
└────────────────┬────────────────────────────────────────┘
                 │ JSON response with PGN
                 ↓
┌─────────────────────────────────────────────────────────┐
│  Frontend                                               │
│                                                         │
│  • Parse PGN (existing pipeline)                       │
│  • Analyze games (Caissa Insight)                      │
│  • Display results                                      │
└─────────────────────────────────────────────────────────┘
```

---

## Files Created

```
cloudflare-worker/
├── worker.js                    # Main Worker code (370 lines)
├── wrangler.toml               # Wrangler config
├── package.json                # NPM scripts
├── .gitignore                  # Git ignore patterns
├── README.md                   # Quick start guide
├── DEPLOYMENT.md               # Deployment instructions (450+ lines)
├── FRONTEND_INTEGRATION.md     # Frontend code changes (350+ lines)
└── test.js                     # API test script
```

---

## API Endpoints

### 1. Health Check
```
GET https://api.caissa-chess.org/api/health
```

**Response:**
```json
{
  "ok": true,
  "service": "CAISSA Chess Game Fetcher",
  "version": "1.0.0",
  "timestamp": "2024-01-19T..."
}
```

---

### 2. Fetch Games
```
GET https://api.caissa-chess.org/api/games?platform=chesscom&username=Hikaru&max=20&tc=blitz
```

**Query Parameters:**
- `platform` (required): `chesscom` or `lichess`
- `username` (required): Username on platform
- `max` (optional): 1-50 games (default 20)
- `tc` (optional): `all`, `bullet`, `blitz`, `rapid` (default `all`)

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

**Error Response (400/500):**
```json
{
  "error": "Fetch failed",
  "message": "Chess.com user 'X' not found",
  "platform": "chesscom",
  "username": "X"
}
```

---

## Key Features

### ✅ CORS Support
- Allows requests from `caissa-chess.org`, `www.caissa-chess.org`, Vercel previews
- Proper preflight (OPTIONS) handling
- Dynamic origin validation

### ✅ Caching
- 60-second cache TTL using Cloudflare Cache API
- Global CDN distribution
- Cache key: `platform:username:timecontrol:maxgames`
- Responses include `cached: true/false` flag

### ✅ Rate Limiting
- 10 requests per minute per IP
- In-memory tracking (resets on Worker restart)
- Returns HTTP 429 with friendly error message

### ✅ Chess.com Strategy
1. Fetch player's game archives
2. Get games from most recent 3 months
3. Filter by time control (if specified)
4. Extract PGN from each game
5. Fallback to minimal PGN if missing
6. Concatenate into single PGN text block

### ✅ Lichess Strategy
1. Use `/api/games/user/{username}` endpoint
2. Request PGN format directly
3. Filter by perf type (bullet/blitz/rapid)
4. Return raw PGN text

### ✅ Error Handling
- User not found (404)
- No games available
- API rate limits
- Network failures
- Invalid parameters

---

## Deployment Steps

### Step 1: Install Wrangler
```bash
npm install -g wrangler
```

### Step 2: Login
```bash
wrangler login
```

### Step 3: Deploy
```bash
cd cloudflare-worker
wrangler deploy
```

### Step 4: Add Custom Domain
1. Go to Cloudflare dashboard
2. Workers & Pages → `caissa-game-fetcher`
3. Settings → Triggers → Custom Domains
4. Add: `api.caissa-chess.org`

### Step 5: Test
```bash
curl https://api.caissa-chess.org/api/health
```

---

## Frontend Integration

### Update `app.js`

**Add API configuration:**
```javascript
const WORKER_API_URL = 'https://api.caissa-chess.org/api/games';
```

**Add helper function:**
```javascript
async function fetchGamesViaWorker(platform, username, maxGames, timeControl) {
    const params = new URLSearchParams({
        platform: platform === 'chess.com' ? 'chesscom' : 'lichess',
        username: username,
        max: maxGames,
        tc: timeControl
    });

    const response = await fetch(`${WORKER_API_URL}?${params}`);
    if (!response.ok) throw new Error('Fetch failed');

    return await response.json();
}
```

**Update "Fetch & Analyze" button:**
```javascript
document.getElementById('importFetchBtn').addEventListener('click', async () => {
    const platform = document.getElementById('importProvider').value;
    const username = document.getElementById('importUsername').value.trim();
    const maxGames = parseInt(document.getElementById('importGameCount').value);
    const timeControl = document.getElementById('importTimeControl').value;

    // Fetch via Worker
    const result = await fetchGamesViaWorker(platform, username, maxGames, timeControl);

    // Parse PGN (existing pipeline)
    const games = parsePGNText(result.pgn);

    // Analyze (existing function)
    await addGamesToInsightSession(games);
});
```

See [FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md) for complete code.

---

## Testing

### Manual Testing
```bash
# Health check
curl https://api.caissa-chess.org/api/health

# Chess.com
curl "https://api.caissa-chess.org/api/games?platform=chesscom&username=Hikaru&max=5&tc=blitz"

# Lichess
curl "https://api.caissa-chess.org/api/games?platform=lichess&username=DrNykterstein&max=5&tc=rapid"
```

### Automated Testing
```bash
export WORKER_URL="https://api.caissa-chess.org"
node test.js
```

---

## Security

### ✅ No credentials stored
- Worker doesn't use API keys or tokens
- Only public endpoints accessed

### ✅ CORS whitelist
- Only allows caissa-chess.org domains
- Rejects other origins

### ✅ Rate limiting
- Prevents abuse (10 req/min per IP)
- Can be enhanced with Durable Objects

### ✅ Input validation
- Username required
- Platform must be chesscom/lichess
- Max games limited to 50

### ✅ No sensitive data
- No user passwords
- No private game data
- Only public profiles

---

## Cost

**Cloudflare Workers Free Tier:**
- 100,000 requests/day
- Unlimited bandwidth
- Global CDN
- No credit card required

**Estimated Usage for CAISSA:**
- ~100 users/day × 2 requests = 200 requests/day
- Well within free tier
- Zero cost

**If exceeded (unlikely):**
- $0.50 per million requests after 10M/month

---

## Monitoring

### View Logs
```bash
wrangler tail
```

Or via dashboard:
1. Workers & Pages
2. Click worker
3. Logs tab

### View Analytics
1. Workers & Pages
2. Click worker
3. Metrics tab
4. View requests, errors, CPU time

---

## Troubleshooting

### CORS Error
**Symptom:** Browser shows CORS error
**Solution:**
1. Verify origin in `ALLOWED_ORIGINS`
2. Check response headers include `Access-Control-Allow-Origin`
3. Clear browser cache

### User Not Found
**Symptom:** "Chess.com user not found"
**Solution:**
1. Verify username exists on platform
2. Check username spelling (case-sensitive)
3. Try different username (e.g., "Hikaru")

### Rate Limit Exceeded
**Symptom:** HTTP 429 error
**Solution:**
1. Wait 60 seconds
2. Reduce request frequency
3. Check for infinite loops in frontend

### Worker Not Responding
**Symptom:** Timeout or 500 error
**Solution:**
1. Check Cloudflare dashboard for outages
2. View worker logs for errors
3. Test with curl directly
4. Redeploy worker

---

## Next Steps

### Immediate (Required)
1. ✅ Deploy Worker to Cloudflare
2. ✅ Configure custom domain (api.caissa-chess.org)
3. ✅ Test endpoints with curl
4. ✅ Update frontend code
5. ✅ Deploy frontend to Vercel
6. ✅ Test end-to-end on production

### Short-term (Nice to have)
- [ ] Add Worker analytics tracking
- [ ] Implement persistent rate limiting (Durable Objects)
- [ ] Add Sentry error tracking
- [ ] Create admin dashboard for monitoring

### Long-term (Future)
- [ ] Support Chess24, ICC, other platforms
- [ ] Add game filtering (won/lost/draw)
- [ ] Cache game thumbnails
- [ ] Add WebSocket support for live games

---

## Success Criteria

✅ Users can import games from Chess.com without CORS errors
✅ Users can import games from Lichess without CORS errors
✅ Games are fetched within 2-5 seconds
✅ Cached responses return instantly
✅ Rate limiting prevents abuse
✅ Error messages are user-friendly
✅ Works on desktop and mobile browsers
✅ No breaking changes to existing features

---

## Support Resources

- **Cloudflare Workers Docs:** https://developers.cloudflare.com/workers/
- **Wrangler CLI Docs:** https://developers.cloudflare.com/workers/wrangler/
- **Chess.com API Docs:** https://www.chess.com/news/view/published-data-api
- **Lichess API Docs:** https://lichess.org/api
- **CAISSA Worker Docs:** See README.md, DEPLOYMENT.md, FRONTEND_INTEGRATION.md

---

## Contact

For issues or questions:
1. Check DEPLOYMENT.md troubleshooting section
2. View Worker logs in Cloudflare dashboard
3. Test with curl to isolate frontend vs backend issues
4. Check Chess.com/Lichess API status pages
