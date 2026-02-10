# CAISSA Vault Downloads Worker - Deployment Guide

## Overview

Deploy the CAISSA Polyglot Book Creator v1.0.0 to production downloads.

---

## Step 1: Create R2 Bucket (if not exists)

```bash
wrangler r2 bucket create caissa-vault
```

Verify:
```bash
wrangler r2 bucket list
```

---

## Step 2: Upload Files to R2

Upload the 3 validated assets to the bucket:

```bash
# Navigate to where you have the files
cd /path/to/polyglot-book-creator-release

# Upload ZIP
wrangler r2 object put caissa-vault/apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip \
  --file=CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip

# Upload CHANGELOG
wrangler r2 object put caissa-vault/apps/polyglot-book-creator/v1.0.0/CHANGELOG.txt \
  --file=CHANGELOG.txt

# Upload SHA256
wrangler r2 object put caissa-vault/apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.sha256 \
  --file=CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.sha256
```

### Verify Uploads

```bash
wrangler r2 object list caissa-vault --prefix="apps/polyglot-book-creator/v1.0.0/"
```

**Expected output:**
```json
[
  {
    "key": "apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip",
    "size": 244210663
  },
  {
    "key": "apps/polyglot-book-creator/v1.0.0/CHANGELOG.txt",
    "size": 575
  },
  {
    "key": "apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.sha256",
    "size": 116
  }
]
```

### Verify SHA256 Hash

```bash
# Download and check SHA256
wrangler r2 object get caissa-vault/apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.sha256 --file=downloaded.sha256

cat downloaded.sha256
# Expected: 6e91c3488f9af5f944e4405ca3ae04eab49701621ddc5b754f42b2f47fbdbe67
```

---

## Step 3: Deploy Worker

```bash
cd downloads-worker
wrangler deploy
```

**Expected output:**
```
✨ Built successfully!
🌎 Published caissa-vault-downloads
   https://caissa-vault-downloads.YOURNAME.workers.dev
```

---

## Step 4: Test Downloads

### Test 1: Health Check

```bash
curl https://caissa-vault-downloads.YOURNAME.workers.dev/health
```

Expected:
```json
{
  "ok": true,
  "service": "CAISSA Vault Downloads",
  "version": "1.0.0"
}
```

### Test 2: Catalog Listing

```bash
curl https://caissa-vault-downloads.YOURNAME.workers.dev/catalog
```

Expected:
```json
{
  "polyglot-book-creator": {
    "filename": "CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip",
    "version": "v1.0.0",
    "category": "software",
    "downloadUrl": "/download/polyglot-book-creator",
    "contentType": "application/zip"
  },
  "polyglot-book-creator-changelog": {
    "filename": "CHANGELOG.txt",
    "version": "v1.0.0",
    "category": "documentation",
    ...
  },
  ...
}
```

### Test 3: Download ZIP

```bash
curl -I https://caissa-vault-downloads.YOURNAME.workers.dev/download/polyglot-book-creator
```

**Expected headers:**
```
HTTP/2 200
content-type: application/zip
content-disposition: attachment; filename="CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip"
content-length: 244210663
x-caissa-version: v1.0.0
cache-control: public, max-age=31536000, immutable
```

### Test 4: Download CHANGELOG

```bash
curl https://caissa-vault-downloads.YOURNAME.workers.dev/download/polyglot-book-creator-changelog
```

Should return the CHANGELOG.txt content (575 bytes).

### Test 5: Download SHA256

```bash
curl https://caissa-vault-downloads.YOURNAME.workers.dev/download/polyglot-book-creator-sha256
```

**Expected:**
```
6e91c3488f9af5f944e4405ca3ae04eab49701621ddc5b754f42b2f47fbdbe67
```

### Test 6: Verify File Size

```bash
curl -s https://caissa-vault-downloads.YOURNAME.workers.dev/download/polyglot-book-creator \
  --output test-download.zip

ls -lh test-download.zip
# Expected: 233M (244210663 bytes)
```

### Test 7: Verify SHA256 Matches

```bash
# Download ZIP
curl -s https://caissa-vault-downloads.YOURNAME.workers.dev/download/polyglot-book-creator \
  --output polyglot-download.zip

# Compute SHA256
sha256sum polyglot-download.zip

# Expected: 6e91c3488f9af5f944e4405ca3ae04eab49701621ddc5b754f42b2f47fbdbe67
```

---

## Step 5: Configure Custom Domain

### Option A: Via Cloudflare Dashboard

1. Go to Cloudflare Dashboard → Workers & Pages
2. Select `caissa-vault-downloads`
3. Settings → Triggers → **Custom Domains**
4. Add: `downloads.caissa-chess.org`
5. Wait for DNS propagation (~1-5 minutes)

### Option B: Via wrangler.toml (Uncomment routes)

Edit `wrangler.toml`:
```toml
routes = [
  { pattern = "downloads.caissa-chess.org/*", zone_name = "caissa-chess.org" }
]
```

Then redeploy:
```bash
wrangler deploy
```

### Test Custom Domain

```bash
curl https://downloads.caissa-chess.org/health
```

---

## Step 6: Update Frontend URLs

The frontend already references the correct URLs in `js/vault-page.js`:

```javascript
downloadUrl: 'https://downloads.caissa-chess.org/download/polyglot-book-creator',
releaseNotesUrl: 'https://downloads.caissa-chess.org/download/polyglot-book-creator-changelog',
sha256: '6e91c3488f9af5f944e4405ca3ae04eab49701621ddc5b754f42b2f47fbdbe67'
```

✅ No frontend changes needed!

---

## Step 7: Remove Old Broken Artifact (Optional)

If there was an old broken version in R2, you can:

### List all objects in the bucket
```bash
wrangler r2 object list caissa-vault --prefix="apps/polyglot-book-creator/"
```

### Delete old versions if found
```bash
# Example: if there's a v0.x.x folder
wrangler r2 object delete caissa-vault/apps/polyglot-book-creator/v0.1.0/old-broken.zip
```

**Note:** The Worker already handles the old slug via redirect (see `polyglot-book-creator-old` in DOWNLOADS catalog).

---

## Verification Checklist

- [ ] R2 bucket `caissa-vault` exists
- [ ] 3 files uploaded to `apps/polyglot-book-creator/v1.0.0/`
- [ ] File sizes match expected:
  - ZIP: 244210663 bytes
  - CHANGELOG: 575 bytes
  - SHA256: 116 bytes
- [ ] Worker deployed successfully
- [ ] Health endpoint returns 200
- [ ] Catalog endpoint lists 3 slugs
- [ ] ZIP download returns 244MB file
- [ ] CHANGELOG download works
- [ ] SHA256 download returns correct hash
- [ ] Downloaded ZIP SHA256 matches: `6e91c3488f9af5f944e4405ca3ae04eab49701621ddc5b754f42b2f47fbdbe67`
- [ ] Custom domain `downloads.caissa-chess.org` configured
- [ ] Frontend vault page downloads work in browser

---

## Final Download URLs

Once deployed:

1. **Polyglot Book Creator ZIP:**
   ```
   https://downloads.caissa-chess.org/download/polyglot-book-creator
   ```

2. **CHANGELOG:**
   ```
   https://downloads.caissa-chess.org/download/polyglot-book-creator-changelog
   ```

3. **SHA256 Checksum:**
   ```
   https://downloads.caissa-chess.org/download/polyglot-book-creator-sha256
   ```

---

## Troubleshooting

### Issue: "Book not found in storage"

**Solution:**
1. Verify R2 object exists:
   ```bash
   wrangler r2 object head caissa-vault/apps/polyglot-book-creator/v1.0.0/CAISSA-Polyglot-Book-Creator-v1.0.0-Portable.zip
   ```
2. Check key matches exactly in `worker.js` DOWNLOADS catalog

### Issue: "Download slug not found"

**Solution:** Check that the slug in the URL matches exactly the keys in the DOWNLOADS object:
- `polyglot-book-creator` (not `polyglot_book_creator` or `polyglotBookCreator`)

### Issue: Wrong file size

**Solution:** Re-upload the file ensuring no corruption during upload.

---

## Cost Estimate (Cloudflare Free Tier)

| Resource | Free Tier Limit | Usage (est.) | Cost |
|----------|----------------|--------------|------|
| Worker requests | 100,000/day | ~500/day | $0 |
| R2 storage | 10 GB | 0.24 GB | $0 |
| R2 reads (Class B) | 10M/month | ~15K/month | $0 |
| R2 egress | 10 GB/month | ~2 GB/month | $0 |

**Total:** $0/month for typical usage 🎉

---

**Deployment Complete!** 🚀
