# CAISSA Tools

Automation scripts for maintaining CAISSA Chess data and assets.

## Available Tools

### 1. DOS Chess Metadata Scraper

**File:** `scrape-dosgamesarchive-chess.mjs`

Automatically generates and updates the DOS chess games catalog (`public/dos/dos_chess_games.json`) by scraping metadata from dosgamesarchive.com.

**Phase 1 Safe:** Only fetches metadata + external links. Does NOT download game binaries.

#### Usage

**Normal run (with 7-day caching):**
```bash
npm run dos:scrape-chess
```

**Force refresh (bypass cache, re-fetch all):**
```bash
npm run dos:scrape-chess-force
```

**Dry run (preview changes without writing):**
```bash
npm run dos:scrape-chess-dry
```

#### What It Does

1. **Fetches chess game listings** from dosgamesarchive.com
   - Follows pagination (up to 5 pages max)
   - Expected: ~25 games

2. **Extracts metadata** for each game:
   - Name, year, publisher, developer
   - Description (1-2 sentences)
   - View type (2D/3D)
   - External links (play URL, download URL)
   - Features/tags

3. **Merges with existing data**
   - Preserves manual overrides (popularity, selfHosted, license)
   - Matches by: ID, playUrl, or downloadUrl
   - Keeps stable IDs across runs

4. **Validates output**
   - No duplicate IDs
   - Valid URLs (absolute, on dosgamesarchive.com)
   - Required fields present

5. **Writes JSON** to `public/dos/dos_chess_games.json`

#### Features

**Rate Limiting:**
- 1.5-2.5 seconds between requests (random jitter)
- Polite user-agent identification

**Caching:**
- HTML responses cached in `tools/.cache/dosgamesarchive/`
- Cache valid for 7 days
- Speeds up subsequent runs

**Merge Strategy:**
- New games added
- Existing games updated (metadata only)
- Manual fields preserved:
  - `selfHosted` (if set to `true`, won't be overwritten)
  - `zipPath` (preserved if not null)
  - `license` (preserved if type is not "unknown")
  - `popularity` (preserved if manually set)

#### Output Format

```json
[
  {
    "id": "game-name",
    "name": "Game Name",
    "year": 1992,
    "view": "2D",
    "popularity": 70,
    "publisher": "Publisher Name",
    "developer": "Developer Name",
    "description": "Short description...",
    "features": ["Feature 1", "Feature 2"],
    "playUrl": "https://www.dosgamesarchive.com/play/game",
    "downloadUrl": "https://www.dosgamesarchive.com/download/game",
    "sourceUrl": "https://www.dosgamesarchive.com/game/...",
    "selfHosted": false,
    "zipPath": null,
    "license": {
      "type": "unknown",
      "url": null,
      "notes": "External link only (Phase 1)"
    }
  }
]
```

#### Troubleshooting

**"Validation errors" message:**
- Check for duplicate game IDs
- Verify URLs are absolute (start with `http`)
- Ensure required fields (name, id) are present

**"HTTP 403/429" errors:**
- Site may be rate-limiting or blocking
- Wait 10-15 minutes and try again
- Use `--force` sparingly to avoid aggressive scraping

**Empty results:**
- Site structure may have changed
- Update CSS selectors in `parseListingPage()` and `parseGamePage()`
- Check `.cache/` directory for raw HTML to debug

**Cache issues:**
- Delete `tools/.cache/dosgamesarchive/` to force fresh fetch
- Or use `--force` flag

#### Maintenance

**When to run:**
- After new DOS chess games are added to the archive
- To update descriptions/metadata for existing games
- To fix missing/incorrect data

**Frequency:**
- Recommended: Monthly or as needed
- Cache expires after 7 days automatically

**Manual overrides:**
After running the scraper, you can manually edit `public/dos/dos_chess_games.json` to:
- Set `selfHosted: true` for GPL/public domain games
- Adjust `popularity` scores
- Update `license` information
- Add custom `features` or improve descriptions

The next scraper run will preserve these manual changes.

---

### 2. PGN Mentor Downloader

**File:** `fetch-pgnmentor.mjs`

Downloads chess games from PGNMentor.com for world champions and historic players.

```bash
npm run download-pgn          # Download all
npm run download-pgn-force    # Force re-download
npm run download-pgn-test     # Test mode (first 3 only)
```

---

### 3. Favicon Generator

**File:** `generate-favicons-sharp.mjs`

Generates favicon variants from source image using Sharp.

```bash
node tools/generate-favicons-sharp.mjs
```

---

## Development

### Adding New Tools

1. Create `.mjs` file in `tools/`
2. Add shebang: `#!/usr/bin/env node`
3. Use ES modules (`import`/`export`)
4. Add npm script to `package.json`
5. Document in this README

### Conventions

- Use `__dirname` pattern for paths:
  ```javascript
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const ROOT_DIR = path.resolve(__dirname, '..');
  ```

- Parse CLI args:
  ```javascript
  const args = process.argv.slice(2);
  const FORCE = args.includes('--force');
  ```

- Rate limiting for scrapers:
  ```javascript
  await sleep(1500 + Math.random() * 1000);
  ```

- Use polite user-agent headers

### Dependencies

- **Built-in:** `https`, `fs`, `path`, `crypto`
- **External:**
  - `cheerio` - HTML parsing (dev)
  - `adm-zip` - ZIP file handling
  - `sharp` - Image processing (dev)

---

## License

MIT
