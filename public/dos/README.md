# DOS Chess Games

This directory contains DOS chess game bundles that can be played in-browser via DOSBox.

## Directory Structure

```
/public/dos/
├── dos_chess_games.json          # Game metadata
├── games/                         # Game bundles
│   ├── fritz/
│   │   └── fritz.zip             # Fritz DOS game bundle
│   ├── battle-chess/
│   │   └── battle.zip            # Battle Chess bundle
│   └── [other games]/
└── README.md                      # This file
```

## Adding New DOS Games

1. **Create game folder**: `mkdir games/[game-name]/`

2. **Add game bundle**: Place the DOS game ZIP file in the folder
   - ZIP should contain the DOS executable and all required files
   - Name it descriptively (e.g., `fritz.zip`, `battle.zip`)

3. **Update metadata**: Edit `dos_chess_games.json` and add entry:

```json
{
  "id": "unique-game-id",
  "name": "Game Display Name",
  "year": 1991,
  "view": "2D" or "3D",
  "popularity": 0-100,
  "sizeKB": 800,
  "publisher": "Publisher Name",
  "assetZip": "/dos/games/folder-name/file.zip",
  "description": "Game description...",
  "features": ["Feature 1", "Feature 2"]
}
```

4. **Test**: Load the DOS Chess page and click "Play" to verify

## Game Bundle Requirements

- Must be a valid DOS executable
- Should include all required files (EXE, data files, etc.)
- Keep bundles under 5MB when possible
- Use ZIP compression

## Supported Formats

- DOS executables (.EXE, .COM)
- Self-contained games (no install required)
- Compatible with DOSBox emulation

## Notes

- Games are loaded via js-dos (DOSBox in WebAssembly)
- First launch may take a few seconds to load emulator
- Some games may require specific DOSBox config (add to game metadata)
