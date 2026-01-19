# 🚀 Cloudflare Worker - Quick Start

## 1️⃣ Deploy Worker (5 minutes)

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Navigate to worker directory
cd cloudflare-worker

# Deploy!
wrangler deploy
```

**Output:**
```
✨ Deployment complete!
https://caissa-game-fetcher.YOUR-SUBDOMAIN.workers.dev
```

---

## 2️⃣ Test Worker

```bash
# Health check
curl https://caissa-game-fetcher.YOUR-SUBDOMAIN.workers.dev/api/health

# Fetch Chess.com games
curl "https://caissa-game-fetcher.YOUR-SUBDOMAIN.workers.dev/api/games?platform=chesscom&username=Hikaru&max=5&tc=blitz"

# Fetch Lichess games
curl "https://caissa-game-fetcher.YOUR-SUBDOMAIN.workers.dev/api/games?platform=lichess&username=DrNykterstein&max=5&tc=rapid"
```

---

## 3️⃣ Add Custom Domain (Optional)

### Option A: Cloudflare Dashboard
1. Go to **Workers & Pages** in Cloudflare dashboard
2. Click on `caissa-game-fetcher`
3. **Settings** → **Triggers** → **Custom Domains**
4. Click **Add Custom Domain**
5. Enter: `api.caissa-chess.org`
6. Wait 1-2 minutes for DNS

### Option B: Edit wrangler.toml
```toml
routes = [
  { pattern = "api.caissa-chess.org/*", zone_name = "caissa-chess.org" }
]
```

Then redeploy:
```bash
wrangler deploy
```

---

## 4️⃣ Update Frontend

**In `app.js`, add:**

```javascript
// API configuration
const WORKER_API_URL = 'https://api.caissa-chess.org/api/games';

// Fetch helper function
async function fetchGamesViaWorker(platform, username, maxGames, timeControl) {
    const params = new URLSearchParams({
        platform: platform === 'chess.com' ? 'chesscom' : 'lichess',
        username: username,
        max: maxGames,
        tc: timeControl
    });

    const response = await fetch(`${WORKER_API_URL}?${params}`);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
    }

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

    try {
        // Fetch via Worker API
        const result = await fetchGamesViaWorker(platform, username, maxGames, timeControl);

        // Parse PGN (existing function)
        const games = parsePGNText(result.pgn);

        // Analyze (existing function)
        await addGamesToInsightSession(games);

        showToast(`✅ Imported ${games.length} games!`, 'success');
    } catch (error) {
        showToast(`Error: ${error.message}`, 'error');
    }
});
```

---

## 5️⃣ Deploy Frontend

```bash
# Commit changes
git add app.js
git commit -m "feat: Integrate Cloudflare Worker API for game fetching"
git push origin main

# Vercel will auto-deploy
```

---

## 6️⃣ Test Production

1. Open https://www.caissa-chess.org
2. Click **Caissa Insight**
3. Switch to **Chess.com / Lichess** tab
4. Enter username: `Hikaru` (Chess.com) or `DrNykterstein` (Lichess)
5. Click **Fetch & Analyze Games**
6. ✅ Games should load without CORS errors!

---

## 📊 Monitor Worker

**View logs:**
```bash
wrangler tail
```

**Or in dashboard:**
1. Go to **Workers & Pages**
2. Click `caissa-game-fetcher`
3. **Logs** tab for real-time logs
4. **Metrics** tab for analytics

---

## 🆘 Troubleshooting

### CORS Error
```javascript
// Check ALLOWED_ORIGINS in worker.js
const ALLOWED_ORIGINS = [
  'https://caissa-chess.org',
  'https://www.caissa-chess.org',
  // Add your domain here
];
```

### User Not Found
- Try different username (e.g., "Hikaru" on Chess.com)
- Check username spelling (case-sensitive)
- Verify user has public games

### Rate Limit (429)
- Wait 60 seconds
- Worker allows 10 requests/minute per IP

---

## 📚 Full Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide
- **[FRONTEND_INTEGRATION.md](./FRONTEND_INTEGRATION.md)** - Detailed frontend code
- **[SUMMARY.md](./SUMMARY.md)** - Architecture overview

---

## ✅ Checklist

- [ ] Wrangler installed (`npm install -g wrangler`)
- [ ] Logged in to Cloudflare (`wrangler login`)
- [ ] Worker deployed (`wrangler deploy`)
- [ ] Health check works (curl /api/health)
- [ ] Games fetch works (curl /api/games)
- [ ] Custom domain added (api.caissa-chess.org)
- [ ] Frontend updated (fetchGamesViaWorker)
- [ ] Frontend deployed (Vercel)
- [ ] End-to-end tested (production)
- [ ] Monitoring enabled (wrangler tail)

---

## 🎉 Done!

Your CAISSA Chess app can now fetch games from Chess.com and Lichess without CORS restrictions!

**API Endpoint:** `https://api.caissa-chess.org/api/games`

**Usage:**
```bash
GET /api/games?platform=chesscom&username=Hikaru&max=20&tc=blitz
```

**Response:**
```json
{
  "pgn": "[Event \"Live Chess\"]\n...",
  "count": 20,
  "source": "chess.com",
  "warnings": [],
  "cached": false
}
```
