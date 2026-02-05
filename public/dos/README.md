# DOS Chess Games - Implementation Guide

This directory contains metadata and documentation for the DOS Chess Games catalog feature.

## Current Implementation: Phase 1 (External Links)

All games currently link to external archives (dosgamesarchive.com). No game binaries are hosted on CAISSA servers.

### File Structure

```
/public/dos/
├── dos_chess_games.json          # Game metadata catalog
├── README.md                      # This file
└── games/                         # Reserved for Phase 2 self-hosted games
    └── (empty - not used in Phase 1)
```

## Phase 1: External Links Only (CURRENT)

**Status:** ✅ Active

All games use external archive links:
- `playUrl`: Link to play game on external site
- `downloadUrl`: Link to download from external site
- `sourceUrl`: Reference to source archive

No game binaries are stored or served by CAISSA in Phase 1.

## Phase 2: Self-Hosted Games (ACTIVE - GPL Only)

**Status:** ✅ Active for GNU Chess only

### Currently Self-Hosted

**GNU Chess (GPL)** - The ONLY self-hosted game right now.
- Bundle location: `/public/dos/games/gnuchess/`
- License: GPL-3.0 (verified and documented)
- Includes: LICENSE.txt, README.md, placeholder bundle
- Button: "Play (Hosted)" (green button)
- Fallback: External links remain available

### Implementation Status

**Current:** Bundle is ready, but DOSBox emulator is not yet integrated.

When you click "Play (Hosted)" on GNU Chess:
- ✅ Checks if bundle exists (`gnuchess.zip`)
- ✅ Shows bundle status
- ⏳ Shows "Emulator integration pending" message (if js-dos not detected)
- 🔮 Will run game in browser (once js-dos is integrated)

**To enable full DOSBox emulation:**
1. Install: `npm install js-dos`
2. Update `loadDOSBox()` function in `caissa-dos-chess.js`
3. Mount bundle and execute `GNUCHESS.EXE`

### Requirements Before Self-Hosting

**DO NOT add self-hosted games unless:**

1. ✅ License is verified as one of:
   - Public domain
   - Freeware with explicit permission to redistribute
   - GPL/Open source with clear license file
   - Shareware with redistribution rights

2. ✅ License documentation includes:
   - Original license text or URL
   - Source/author attribution
   - Any required disclaimers

3. ✅ File size is reasonable:
   - Prefer: < 2 MB
   - Maximum: 5 MB
   - Larger games should remain external links only

### Adding a Self-Hosted Game

**Step 1: Verify License**

Before proceeding, document the license in `dos_chess_games.json`:

```json
{
  "license": {
    "type": "freeware",
    "url": "https://example.com/license.txt",
    "notes": "Explicit permission granted by author in 1995. See license URL."
  }
}
```

**Step 2: Prepare Game Bundle**

1. Create directory: `/public/dos/games/<game-id>/`
2. Place game ZIP bundle (must be playable DOS executable + data files)
3. Name format: `<game-id>.zip` (e.g., `gnu-chess.zip`)

**Step 3: Update Metadata**

Edit `dos_chess_games.json`:

```json
{
  "id": "gnu-chess",
  "name": "GNU Chess",
  "selfHosted": true,
  "zipPath": "/dos/games/gnu-chess/gnu-chess.zip",
  "playUrl": "https://www.dosgamesarchive.com/play/gnu-chess",
  "downloadUrl": "https://www.dosgamesarchive.com/download/gnu-chess",
  "license": {
    "type": "freeware",
    "url": "https://www.gnu.org/software/chess/",
    "notes": "GPL licensed - verified for redistribution"
  }
}
```

**Step 4: Test Locally**

- Navigate to DOS Chess page
- Verify game appears with "Play (Hosted)" button
- Click and confirm DOSBox loads correctly

**Step 5: Add License File**

Create `/public/dos/games/<game-id>/LICENSE.txt` with:
- Original license text
- Author/publisher attribution
- Date of permission (if applicable)

### Example: Verified Freeware Game

```
/public/dos/games/gnu-chess/
├── gnu-chess.zip          # Game bundle
├── LICENSE.txt            # GPL license
└── README.txt             # Attribution
```

### Phase 2 Features (When Enabled)

- **Hosted Play Button:** If `selfHosted: true`, shows additional "Play (Hosted)" button
- **DOSBox Integration:** Loads js-dos and mounts ZIP bundle
- **Fallback:** External links always remain as backup option

## Phase 3: Retro vs Modern Analysis (FUTURE)

**Status:** 🔮 Placeholder only - Premium feature

Planned features:
- Load DOS game position into CAISSA
- Run modern Stockfish analysis
- Compare retro AI vs modern engine
- Historical chess engine evolution insights

Currently shows "Coming soon" alert when clicked.

## License Verification Checklist

Before setting `selfHosted: true`, verify:

- [ ] License type documented (`freeware`, `public-domain`, `GPL`, etc.)
- [ ] License URL or text included
- [ ] Original author/publisher attribution
- [ ] Redistribution rights confirmed
- [ ] LICENSE.txt file added to game directory
- [ ] File size under 5 MB
- [ ] Game tested locally in DOSBox

## Common License Types

| Type | Can Self-Host? | Notes |
|------|----------------|-------|
| **Public Domain** | ✅ Yes | No restrictions |
| **Freeware** | ✅ Maybe | Check if redistribution allowed |
| **GPL/Open Source** | ✅ Yes | Must include license file |
| **Shareware** | ⚠️ Rarely | Most prohibit redistribution |
| **Commercial** | ❌ No | Never self-host |
| **Abandonware** | ❌ No | Still copyrighted - use external links |

## Security Notes

- All self-hosted ZIPs are served statically (no server-side execution)
- DOSBox runs in browser sandbox (js-dos WebAssembly)
- No file upload or user-generated content
- ZIPs are read-only and pre-vetted

## Questions?

- **"Can I add any DOS game?"** → No. License must be verified first.
- **"What about abandonware?"** → Still copyrighted. Use external links.
- **"Game is freeware but no docs?"** → Contact original author or keep external link.
- **"License says 'free for personal use'?"** → That's not redistribution rights. External link only.

---

**Current Phase:** Phase 1 (External Links)
**Last Updated:** 2026-02-04
**Games Catalog:** 25 DOS chess games
**Self-Hosted:** 0 (awaiting license verification)
