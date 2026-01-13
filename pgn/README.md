# PGN Game Library

Professional chess game library featuring World Champions, Grandmasters, and classic games for TVLavin Chess.

## Quick Start

### 1. Install Dependencies

```bash
cd pgn
npm install
```

### 2. Download Games from PGNMentor

This will download games from PGNMentor.com, organize them into folders, and generate library.json:

```bash
npm run download
```

The script will:
- Download ZIP files for 17 World Champions
- Download ZIP files for 12 Notable Grandmasters
- Extract and organize into category folders
- Generate library.json automatically
- Show progress and summary

**Expected output:**
```
📥 Downloading World Champions PGNs...
✓ Downloaded and extracted Steinitz
✓ Downloaded and extracted Lasker
...
📚 Generating library.json...
✅ Complete! 29 players processed
```

### 3. (Optional) Regenerate Library JSON

If you manually add/modify PGN files, regenerate library.json:

```bash
npm run generate
```

## Folder Structure

```
pgn/
├── world-champions/
│   ├── Steinitz/
│   ├── Lasker/
│   ├── Capablanca/
│   ├── Alekhine/
│   ├── Euwe/
│   ├── Botvinnik/
│   ├── Smyslov/
│   ├── Tal/
│   ├── Petrosian/
│   ├── Spassky/
│   ├── Fischer/
│   ├── Karpov/
│   ├── Kasparov/
│   ├── Kramnik/
│   ├── Anand/
│   ├── Carlsen/
│   └── Ding/
├── grandmasters/
│   ├── Morphy/
│   ├── Anderssen/
│   ├── Zukertort/
│   ├── Tarrasch/
│   ├── Nimzowitsch/
│   ├── Rubinstein/
│   ├── Reshevsky/
│   ├── Bronstein/
│   ├── Polgar/
│   ├── Ivanchuk/
│   ├── Aronian/
│   └── Nakamura/
├── demo/
│   ├── evergreen-game.pgn
│   ├── immortal-game.pgn
│   ├── morphy-allies-1858.pgn
│   └── fischer-spassky-1972-g6.pgn
├── library.json (generated)
├── download-pgn.js
├── generate-library.js
└── package.json
```

## library.json Format

```json
{
  "World Champions": [
    {
      "name": "Kasparov vs Topalov (1999)",
      "file": "pgn/world-champions/Kasparov/kasparov_vs_topalov_1999.pgn",
      "white": "Kasparov",
      "black": "Topalov",
      "year": "1999",
      "event": "Hoogovens",
      "result": "1-0"
    }
  ],
  "Grandmasters": [...],
  "Demo / Mixed": [...]
}
```

## Manual File Addition

To add games manually:

1. Place PGN files in the appropriate category folder
2. Follow naming convention: `player1_vs_player2_year.pgn`
3. Run `npm run generate` to update library.json
4. Commit and push changes

## File Size Considerations

- Keep individual PGN files under 5MB
- Total library should stay under 100MB for GitHub Pages
- If needed, curate subsets of player games rather than complete collections

## Data Source

Games sourced from [PGNMentor.com](https://www.pgnmentor.com/files.html) - a comprehensive chess game database maintained by the community.

## Troubleshooting

**Downloads fail:**
- Check internet connection
- Verify PGNMentor.com is accessible
- Check firewall/proxy settings

**Library.json not updating:**
- Ensure PGN files have proper headers `[White "..."]`, `[Black "..."]`, `[Date "..."]`
- Run `node generate-library.js` directly to see detailed errors

**Dropdown not showing games:**
- Verify library.json exists and is valid JSON
- Check browser console for fetch errors
- Ensure file paths in library.json match actual file locations
