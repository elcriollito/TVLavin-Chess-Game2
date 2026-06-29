# CAISSA Chess — R2 Opening Book Setup Guide

Complete guide for setting up Cloudflare R2 storage for large opening books (~170MB+) with Worker API for server-side lookups.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [R2 Bucket Setup](#r2-bucket-setup)
4. [Upload Opening Book](#upload-opening-book)
5. [Worker Deployment](#worker-deployment)
6. [Testing](#testing)
7. [Frontend Integration](#frontend-integration)
8. [Custom Book (BYOB - Bring Your Own Book)](#custom-book-byob)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This setup allows CAISSA Chess to query large opening books without downloading them to the browser. The architecture:

```
Browser → Worker API (/api/book) → R2 Storage (170MB Cerebellum3Merge.bin)
         ↓
    Binary search with range requests (4KB chunks)
         ↓
    Returns JSON: [{uci, san, weight, percent}]
```

**Benefits:**
- ✅ No 170MB download on mobile
- ✅ Sub-500ms lookup (binary search + edge caching)
- ✅ Standard Polyglot Random64 hashing
- ✅ Works offline with local books as fallback

---

## Prerequisites

- **Cloudflare account** (free tier works)
- **Wrangler CLI** installed: `npm install -g wrangler`
- **Opening book file** in Polyglot .bin format (e.g., Cerebellum3Merge.bin)
- **Git repository** cloned locally

---

## R2 Bucket Setup

### Step 1: Create R2 Bucket

**Option A: Via Cloudflare Dashboard**
1. Go to https://dash.cloudflare.com/
2. Navigate to **R2 Object Storage** in the sidebar
3. Click **Create bucket**
4. Name: `caissa-books`
5. Location: **Automatic** (recommended)
6. Click **Create bucket**

**Option B: Via Wrangler CLI**
```bash
wrangler r2 bucket create caissa-books
```

### Step 2: Verify Bucket

```bash
wrangler r2 bucket list
```

Expected output:
```
📦 caissa-books
```

---

## Upload Opening Book

### Step 1: Obtain Opening Book

**Recommended books:**
- **Cerebellum3Merge.bin** (~170MB) — High-quality, human-like opening repertoire
- **PerformanceBook.bin** (~300MB) — Performance-focused database
- **Rodent.bin** (~80MB) — Smaller, balanced book

**Sources:**
- [Stockfish Opening Books](https://github.com/official-stockfish/books)
- [Chess Programming Wiki — Opening Books](https://www.chessprogramming.org/Opening_Book)
- Your own Polyglot .bin file

> **License Note**: Most opening books are freely redistributable, but check the license of your chosen book.

### Step 2: Upload to R2

```bash
cd /path/to/your/opening/books
wrangler r2 object put caissa-books/Cerebellum3Merge.bin --file=./Cerebellum3Merge.bin
```

**Expected output:**
```
Uploading Cerebellum3Merge.bin
✨ Upload complete!
```

### Step 3: Verify Upload

```bash
wrangler r2 object list caissa-books
```

Expected:
```json
[
  {
    "key": "Cerebellum3Merge.bin",
    "size": 178956288,
    "uploaded": "2026-02-07T..."
  }
]
```

---

## Worker Deployment

### Step 1: Navigate to Worker Directory

```bash
cd TVLavin-Chess-Game2/cloudflare-worker
```

### Step 2: Review wrangler.toml

Verify R2 binding is configured:

```toml
[[r2_buckets]]
binding = "BOOK_BUCKET"
bucket_name = "caissa-books"

[vars]
BOOK_OBJECT_KEY = "Cerebellum3Merge.bin"
```

### Step 3: Deploy Worker

```bash
wrangler deploy
```

**Expected output:**
```
✨ Built successfully!
🌎 Published caissa-game-fetcher
   https://caissa-game-fetcher.elcriollito.workers.dev
```

> **Note**: The Worker now includes `/api/book` endpoint alongside existing `/api/games` and `/api/health`.

---

## Testing

### Test 1: Health Check

```bash
curl https://caissa-game-fetcher.elcriollito.workers.dev/api/health
```

Expected:
```json
{
  "ok": true,
  "service": "CAISSA Chess Game Fetcher",
  "version": "1.0.0"
}
```

### Test 2: Opening Position Lookup

```bash
curl "https://caissa-game-fetcher.elcriollito.workers.dev/api/book?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR%20w%20KQkq%20-%200%201"
```

**Expected response** (starting position should have e4, d4, Nf3, c4):
```json
{
  "moves": [
    {"uci": "e2e4", "san": "e4", "weight": 32767, "percent": 45.2},
    {"uci": "d2d4", "san": "d4", "weight": 28000, "percent": 38.6},
    {"uci": "g1f3", "san": "Nf3", "weight": 8500, "percent": 11.7},
    {"uci": "c2c4", "san": "c4", "weight": 3200, "percent": 4.5}
  ],
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "totalEntries": 12,
  "bookName": "Cerebellum3Merge",
  "cached": false
}
```

### Test 3: After 1.e4 c5 (Sicilian Defense)

```bash
curl "https://caissa-game-fetcher.elcriollito.workers.dev/api/book?fen=rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR%20w%20KQkq%20c6%200%202"
```

Should return Nf3, d4, Nc3, etc.

---

## Frontend Integration

### Step 1: Verify CSP

Check [index.html](index.html) has Worker domain in `connect-src`:

```html
<meta http-equiv="Content-Security-Policy"
      content="... connect-src 'self' https://caissa-game-fetcher.elcriollito.workers.dev ...">
```

✅ Already configured!

### Step 2: Use Cloud Book

1. Open CAISSA Chess in browser
2. Go to **Opening Book** panel in right sidebar
3. Select **☁️ Cloud: Cerebellum (Online)** from dropdown
4. Make moves on the board
5. Book moves should appear automatically

**Loading states:**
- "Loading..." while fetching
- "Cloud: Cerebellum (X moves)" when loaded
- "Cloud book unavailable" on error

---

## Custom Book (BYOB)

Want to use your own opening book? Follow these steps:

### Step 1: Upload Your Book

```bash
wrangler r2 object put caissa-books/MyCustomBook.bin --file=./MyCustomBook.bin
```

### Step 2: Update wrangler.toml

```toml
[vars]
BOOK_OBJECT_KEY = "MyCustomBook.bin"
```

### Step 3: Update Frontend (Optional)

Edit [js/opening-book-manager.js](js/opening-book-manager.js):

```javascript
cloudBookName: 'My Custom Book',
```

### Step 4: Redeploy

```bash
cd cloudflare-worker
wrangler deploy
```

---

## Troubleshooting

### Issue: "Book not found in R2"

**Solution:**
1. Verify bucket name matches:
   ```bash
   wrangler r2 bucket list
   ```
2. Verify object exists:
   ```bash
   wrangler r2 object list caissa-books
   ```
3. Check [wrangler.toml](cloudflare-worker/wrangler.toml) binding:
   ```toml
   bucket_name = "caissa-books"  # Must match
   ```

### Issue: "No moves returned for start position"

**Cause**: Likely using wrong Zobrist hash (not real Polyglot Random64).

**Solution**: The Worker uses the official 781-value Polyglot Random64 array from [python-chess](https://python-chess.readthedocs.io/en/latest/polyglot.html). If your book was built with a different hash function, it won't work.

**Verify book format:**
```bash
# First entry should be 16 bytes: 8-byte key + 2-byte move + 2-byte weight + 4-byte learn
hexdump -C Cerebellum3Merge.bin | head -1
```

### Issue: "Cloud book unavailable" in UI

**Check:**
1. **Network**: Open browser DevTools → Network tab → Look for failed fetch
2. **CORS**: Worker should return `Access-Control-Allow-Origin` header
3. **Rate limiting**: Max 10 requests/min (wait 60 seconds)

### Issue: Slow response times (>1 second)

**Solutions:**
1. **Cold start**: First request after 10+ minutes is slower (Worker spinup). Subsequent requests are fast.
2. **Caching**: Enable Cloudflare Cache API (already implemented, TTL: 1 hour)
3. **Chunk size**: Increase `CHUNK_SIZE` in [worker.js](cloudflare-worker/worker.js) from 4KB to 8KB

### Issue: Local dev with `wrangler dev`

```bash
cd cloudflare-worker
wrangler dev
```

Then test locally:
```bash
curl "http://localhost:8787/api/book?fen=..."
```

> **Note**: R2 access in `wrangler dev` requires Cloudflare account authentication.

---

## Performance Metrics

| Metric | Target | Typical |
|--------|--------|---------|
| **Response time** | <500ms | 200-400ms |
| **Cache hit rate** | >80% | ~90% |
| **Binary search reads** | ~10 requests | 8-12 (4KB chunks) |
| **Book size** | 170MB | 170MB (no browser download) |
| **Mobile compatible** | Yes | Yes |

---

## Cost Estimate (Cloudflare Free Tier)

| Resource | Free Tier Limit | Usage (1000 req/day) | Cost |
|----------|----------------|----------------------|------|
| **Worker requests** | 100,000/day | 1,000 | $0 |
| **R2 storage** | 10 GB | 0.17 GB | $0 |
| **R2 reads (Class A)** | 1M/month | 10,000/month | $0 |
| **R2 egress** | 10 GB/month | 0.04 GB/month | $0 |

**Total**: $0/month for typical usage 🎉

Paid tier only needed if:
- >100K Worker requests/day
- >10GB R2 storage
- >1M R2 reads/month

---

## Advanced Configuration

### Multiple Books

Store multiple books and switch via query param:

```javascript
// In Worker:
const bookKey = url.searchParams.get('book') || env.BOOK_OBJECT_KEY || 'Cerebellum3Merge.bin';
```

```bash
curl "https://...workers.dev/api/book?fen=...&book=Rodent.bin"
```

### Custom Domain

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select `caissa-game-fetcher`
3. Settings → Triggers → **Custom Domains**
4. Add: `book-api.caissa-chess.org`
5. Update frontend URL:
   ```javascript
   cloudBookUrl: 'https://book-api.caissa-chess.org/api/book'
   ```

---

## Resources

- **Polyglot Specification**: http://hgm.nubati.net/book_format.html
- **Python-chess Polyglot docs**: https://python-chess.readthedocs.io/en/latest/polyglot.html
- **Cloudflare R2 docs**: https://developers.cloudflare.com/r2/
- **Wrangler CLI docs**: https://developers.cloudflare.com/workers/wrangler/

---

## Contributing

Found a bug or have a feature request? Open an issue on GitHub:
https://github.com/elcriollito/TVLavin-Chess-Game2/issues

---

**Happy chess playing! ♟️**
