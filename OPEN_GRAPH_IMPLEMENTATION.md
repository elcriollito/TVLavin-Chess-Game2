# Open Graph / Reddit Preview Implementation Guide

## ✅ What Was Fixed

The CAISSA Chess website now has complete Open Graph metadata for proper social media link previews.

**Before:** Reddit showed "Fritz Classic Style" (wrong branding)
**After:** Shows "CAISSA Chess AI — Fritz-Style Board + Stockfish"

---

## 📋 Changes Made

### 1. Updated `index.html` `<head>` Section

Added comprehensive Open Graph tags (lines 8-39):

```html
<!-- Primary Meta Tags -->
<title>CAISSA Chess AI — Fritz-Style Board + Stockfish</title>
<meta name="title" content="CAISSA Chess AI — Fritz-Style Board + Stockfish">
<meta name="description" content="Analyze FEN/PGN, run Engine vs Engine battles, and explore lines instantly.">

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="https://www.caissa-chess.org/">
<meta property="og:title" content="CAISSA Chess AI — Fritz-Style Board + Stockfish">
<meta property="og:description" content="Analyze FEN/PGN, run Engine vs Engine battles, and explore lines instantly.">
<meta property="og:image" content="https://www.caissa-chess.org/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="CAISSA Chess AI - Fritz-Style Chess Board with Stockfish Engine">
<meta property="og:site_name" content="CAISSA Chess">
<meta property="og:locale" content="en_US">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:url" content="https://www.caissa-chess.org/">
<meta name="twitter:title" content="CAISSA Chess AI — Fritz-Style Board + Stockfish">
<meta name="twitter:description" content="Analyze FEN/PGN, run Engine vs Engine battles, and explore lines instantly.">
<meta name="twitter:image" content="https://www.caissa-chess.org/og-image.png">
<meta name="twitter:image:alt" content="CAISSA Chess AI - Fritz-Style Chess Board">

<!-- Additional Meta Tags -->
<meta name="robots" content="index, follow">
<meta name="language" content="English">
<meta name="author" content="CAISSA Chess">
<meta name="application-name" content="CAISSA Chess AI">
<meta name="theme-color" content="#2c5f9e">
```

### 2. Created Social Image Guide

**File:** `public/SOCIAL_IMAGE_GUIDE.md`

Complete guide for creating the 1200×630 social preview image.

---

## 🎨 Next Step: Create Social Preview Image

### Required Image Specifications

- **Filename:** `og-image.png` (or `.jpg`)
- **Location:** `public/og-image.png`
- **Size:** 1200×630 pixels (exact)
- **Format:** PNG or JPG
- **File size:** Under 1MB
- **URL:** `https://www.caissa-chess.org/og-image.png`

### Quick Creation Options

#### Option 1: Canva (5 minutes)

1. Go to https://www.canva.com
2. Create custom size: **1200 × 630 px**
3. Design:
   - Background: Fritz blue (#2c5f9e) or gradient
   - Title: "CAISSA Chess AI" (large, white, bold)
   - Subtitle: "Fritz-Style Board + Stockfish"
   - Add chess board visual or pieces
   - Footer: "www.caissa-chess.org"
4. Download as PNG
5. Save to `public/og-image.png`

#### Option 2: Quick Placeholder

Use this temporary placeholder generator:

```bash
# Download placeholder
curl "https://via.placeholder.com/1200x630/2c5f9e/FFFFFF?text=CAISSA+Chess+AI" -o public/og-image.png
```

Or create a simple text-based placeholder:

```bash
# Create with ImageMagick (if installed)
convert -size 1200x630 xc:#2c5f9e \
  -pointsize 72 -fill white -gravity center \
  -annotate +0-50 "CAISSA Chess AI" \
  -pointsize 36 -annotate +0+50 "Fritz-Style Board + Stockfish" \
  public/og-image.png
```

#### Option 3: Use Screenshot

1. Take screenshot of CAISSA board at https://www.caissa-chess.org
2. Resize to 1200×630 using any image editor
3. Add text overlay: "CAISSA Chess AI"
4. Save as `public/og-image.png`

### Design Recommendations

```
┌────────────────────────────────────────────────┐
│                                                │
│          ♞ CAISSA Chess AI                     │
│                                                │
│    Fritz-Style Board + Stockfish Engine       │
│                                                │
│         [Chess Board Visual]                   │
│         Fritz Classic Theme                    │
│                                                │
│         www.caissa-chess.org                   │
│                                                │
└────────────────────────────────────────────────┘
```

**Colors:**
- Background: #2c5f9e (Fritz blue) or gradient
- Text: White (#FFFFFF)
- Board: Fritz classic (#f0d9b5 / #b58863)

---

## 🚀 Deployment Steps

### Step 1: Create the Image

1. Create `og-image.png` (1200×630)
2. Save to `public/og-image.png`
3. Verify file size < 1MB

### Step 2: Commit and Deploy

```bash
# Add files
git add index.html public/og-image.png public/SOCIAL_IMAGE_GUIDE.md

# Commit
git commit -m "feat: Add Open Graph metadata for social media previews

- Update page title to 'CAISSA Chess AI — Fritz-Style Board + Stockfish'
- Add comprehensive Open Graph tags for Facebook, Reddit, Discord
- Add Twitter Card metadata for proper Twitter previews
- Add social preview image (og-image.png, 1200×630)
- Fix 'Fritz Classic Style' branding issue on social media

Social previews now show proper CAISSA branding across all platforms."

# Push
git push origin main
```

### Step 3: Wait for Deployment

- **Vercel:** Auto-deploys in 1-2 minutes
- **GitHub Pages:** May take 5-10 minutes
- **Cloudflare Pages:** Usually instant

### Step 4: Verify Image is Accessible

Open in browser:
```
https://www.caissa-chess.org/og-image.png
```

Should load the 1200×630 image.

---

## 🧪 Testing Social Previews

### Test on Multiple Platforms

#### 1. Facebook Debugger
```
https://developers.facebook.com/tools/debug/
```

1. Enter: `https://www.caissa-chess.org`
2. Click **Debug**
3. Click **Scrape Again** (if needed)
4. Verify preview shows:
   - Title: "CAISSA Chess AI — Fritz-Style Board + Stockfish"
   - Description: "Analyze FEN/PGN, run Engine vs Engine battles..."
   - Image: Your og-image.png

#### 2. Twitter Card Validator
```
https://cards-dev.twitter.com/validator
```

1. Enter: `https://www.caissa-chess.org`
2. Click **Preview card**
3. Verify large image card shows correct branding

#### 3. LinkedIn Post Inspector
```
https://www.linkedin.com/post-inspector/
```

1. Enter: `https://www.caissa-chess.org`
2. Click **Inspect**
3. Verify preview

#### 4. Discord Preview
1. Open Discord
2. Paste: `https://www.caissa-chess.org`
3. Wait for embed to load
4. Verify preview shows image and correct title

#### 5. Reddit Preview
1. Create test post on /r/test or your profile
2. Paste: `https://www.caissa-chess.org`
3. Check preview thumbnail and title
4. **Delete test post after verification**

---

## 🔄 Force Reddit to Refresh Cache

If Reddit still shows old preview after deployment:

### Method 1: URL Parameter (Fastest)
Add `?v=2` to your URL when posting:
```
https://www.caissa-chess.org/?v=2
```

Reddit treats this as a new URL and fetches fresh metadata.

### Method 2: Reddit Cache Clear
Reddit caches previews for **several days**. To force refresh:

1. Use URL parameter (see Method 1)
2. Or wait 24-48 hours for cache to expire
3. Or post on different subreddit (different cache)

### Method 3: Facebook Debugger
Reddit sometimes respects Facebook's Open Graph cache:

1. Go to https://developers.facebook.com/tools/debug/
2. Enter: `https://www.caissa-chess.org`
3. Click **Scrape Again**
4. Wait 5 minutes
5. Try posting on Reddit again

---

## ✅ Verification Checklist

After deployment, verify:

- [ ] `index.html` has new Open Graph tags
- [ ] `og-image.png` exists in `public/` folder
- [ ] Image is 1200×630 pixels
- [ ] Image loads at `https://www.caissa-chess.org/og-image.png`
- [ ] Page title shows "CAISSA Chess AI — Fritz-Style Board + Stockfish"
- [ ] Facebook Debugger shows correct preview
- [ ] Twitter Card Validator shows correct preview
- [ ] Discord embed shows correct preview
- [ ] LinkedIn Post Inspector shows correct preview
- [ ] Reddit preview shows correct title (use `?v=2` if needed)

---

## 🐛 Troubleshooting

### Issue: Image Not Loading

**Symptom:** Social platforms show broken image or no preview

**Solutions:**
1. Verify image exists: `https://www.caissa-chess.org/og-image.png`
2. Check image format (must be PNG or JPG, not WebP)
3. Check file size (must be < 5MB, recommended < 1MB)
4. Verify image is publicly accessible (not behind auth)
5. Clear browser cache and retry

### Issue: Wrong Title Still Shows

**Symptom:** Social preview shows old title

**Solutions:**
1. Clear platform cache (see "Force Reddit to Refresh" above)
2. Add `?v=2` URL parameter
3. Wait 24 hours for cache expiration
4. Use Facebook Debugger to scrape again

### Issue: Reddit Shows No Preview

**Symptom:** Reddit post has no thumbnail

**Solutions:**
1. Verify image loads in browser
2. Check image dimensions (must be exactly 1200×630)
3. Ensure HTTPS (Reddit requires secure connection)
4. Wait 2-3 minutes after posting (Reddit fetches async)
5. Try reposting with `?v=2` parameter

### Issue: Image Shows But Title is Wrong

**Symptom:** Image loads but title/description incorrect

**Solutions:**
1. Check that `og:title` meta tag is before `og:image`
2. Verify no JavaScript is modifying title after page load
3. Use Facebook Debugger to see exactly what Reddit sees
4. Clear Reddit cache with `?v=2` parameter

---

## 📊 Expected Results

After full implementation, social previews will show:

### Reddit
```
┌─────────────────────────────────────┐
│ [Thumbnail: og-image.png]           │
│                                     │
│ CAISSA Chess AI — Fritz-Style       │
│ Board + Stockfish                   │
│                                     │
│ www.caissa-chess.org                │
└─────────────────────────────────────┘
```

### Discord
```
┌─────────────────────────────────────────┐
│ CAISSA Chess                            │
│                                         │
│ CAISSA Chess AI — Fritz-Style Board +   │
│ Stockfish                               │
│                                         │
│ Analyze FEN/PGN, run Engine vs Engine   │
│ battles...                              │
│                                         │
│ [Large Image: og-image.png]             │
│                                         │
│ www.caissa-chess.org                    │
└─────────────────────────────────────────┘
```

### Twitter/X
```
┌─────────────────────────────────────┐
│ [Large Image Card]                  │
│ og-image.png                        │
│                                     │
│ CAISSA Chess AI — Fritz-Style       │
│ Board + Stockfish                   │
│                                     │
│ Analyze FEN/PGN, run Engine vs...   │
│                                     │
│ 🔗 caissa-chess.org                 │
└─────────────────────────────────────┘
```

---

## 🎯 Key Points

1. ✅ **No JavaScript:** All meta tags are in raw HTML (Reddit requires this)
2. ✅ **Static HTML:** Tags present before any JS executes
3. ✅ **Proper Image:** 1200×630 PNG/JPG, under 1MB
4. ✅ **HTTPS:** Required for Reddit and most platforms
5. ✅ **Cache Busting:** Use `?v=2` parameter for Reddit cache
6. ✅ **Testing:** Always test with Facebook Debugger first

---

## 📚 Additional Resources

- **Facebook Debugger:** https://developers.facebook.com/tools/debug/
- **Twitter Card Validator:** https://cards-dev.twitter.com/validator
- **LinkedIn Inspector:** https://www.linkedin.com/post-inspector/
- **Open Graph Protocol:** https://ogp.me/
- **Twitter Cards Docs:** https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards

---

## 🆘 Need Help?

If previews still don't work after following this guide:

1. Check `index.html` has all meta tags (lines 8-39)
2. Verify `og-image.png` loads in browser
3. Run Facebook Debugger and check for errors
4. Try posting with `?v=2` parameter
5. Wait 24 hours for cache to clear naturally

---

## ✨ Summary

**What was fixed:**
- ❌ Before: "Fritz Classic Style" (wrong title)
- ✅ After: "CAISSA Chess AI — Fritz-Style Board + Stockfish" (correct branding)

**Files modified:**
1. `index.html` - Added Open Graph metadata
2. `public/og-image.png` - Social preview image (need to create)
3. `public/SOCIAL_IMAGE_GUIDE.md` - Image creation guide

**Next action:**
1. Create `og-image.png` (1200×630)
2. Deploy to production
3. Test with Facebook Debugger
4. Post on Reddit with `?v=2` parameter
