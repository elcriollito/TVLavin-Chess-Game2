# PGN Download Instructions

## Automatic Download (Recommended)

Try the automatic downloader first:

```bash
npm run download-pgn-test  # Test with 3 players
npm run download-pgn       # Download all configured players
```

If the automatic downloader fails (HTTP errors or CORS restrictions), use the manual method below.

## Manual Download from PGNMentor

If automatic download doesn't work, follow these steps:

### 1. Visit PGNMentor Players Page
Go to: https://www.pgnmentor.com/files.html#players

### 2. Download World Champions

Create folders and download ZIP files for each champion:

**World Champions:**
- `pgn/world-champions/Steinitz_Wilhelm/` → Download [Steinitz.zip](https://www.pgnmentor.com/players/Steinitz.zip)
- `pgn/world-champions/Lasker_Emanuel/` → Download [Lasker,Em.zip](https://www.pgnmentor.com/players/Lasker,Em.zip)
- `pgn/world-champions/Capablanca_JoseRaul/` → Download [Capablanca.zip](https://www.pgnmentor.com/players/Capablanca.zip)
- `pgn/world-champions/Alekhine_Alexander/` → Download [Alekhine.zip](https://www.pgnmentor.com/players/Alekhine.zip)
- `pgn/world-champions/Euwe_Max/` → Download [Euwe.zip](https://www.pgnmentor.com/players/Euwe.zip)
- `pgn/world-champions/Botvinnik_Mikhail/` → Download [Botvinnik.zip](https://www.pgnmentor.com/players/Botvinnik.zip)
- `pgn/world-champions/Smyslov_Vasily/` → Download [Smyslov.zip](https://www.pgnmentor.com/players/Smyslov.zip)
- `pgn/world-champions/Tal_Mikhail/` → Download [Tal.zip](https://www.pgnmentor.com/players/Tal.zip)
- `pgn/world-champions/Petrosian_Tigran/` → Download [Petrosian.zip](https://www.pgnmentor.com/players/Petrosian.zip)
- `pgn/world-champions/Spassky_Boris/` → Download [Spassky.zip](https://www.pgnmentor.com/players/Spassky.zip)
- `pgn/world-champions/Fischer_Bobby/` → Download [Fischer.zip](https://www.pgnmentor.com/players/Fischer.zip)
- `pgn/world-champions/Karpov_Anatoly/` → Download [Karpov.zip](https://www.pgnmentor.com/players/Karpov.zip)
- `pgn/world-champions/Kasparov_Garry/` → Download [Kasparov.zip](https://www.pgnmentor.com/players/Kasparov.zip)
- `pgn/world-champions/Kramnik_Vladimir/` → Download [Kramnik.zip](https://www.pgnmentor.com/players/Kramnik.zip)
- `pgn/world-champions/Anand_Viswanathan/` → Download [Anand.zip](https://www.pgnmentor.com/players/Anand.zip)
- `pgn/world-champions/Carlsen_Magnus/` → Download [Carlsen.zip](https://www.pgnmentor.com/players/Carlsen.zip)
- `pgn/world-champions/Ding_Liren/` → Download [Ding,L.zip](https://www.pgnmentor.com/players/Ding,L.zip)
- `pgn/world-champions/Gukesh_Dommaraju/` → Download [Gukesh.zip](https://www.pgnmentor.com/players/Gukesh.zip)

**Great GMs (Non-Champions):**
- `pgn/great-gms/Morphy_Paul/` → Download [Morphy.zip](https://www.pgnmentor.com/players/Morphy.zip)
- `pgn/great-gms/Anderssen_Adolf/` → Download [Anderssen.zip](https://www.pgnmentor.com/players/Anderssen.zip)
- `pgn/great-gms/Rubinstein_Akiba/` → Download [Rubinstein.zip](https://www.pgnmentor.com/players/Rubinstein.zip)
- `pgn/great-gms/Nimzowitsch_Aron/` → Download [Nimzowitsch.zip](https://www.pgnmentor.com/players/Nimzowitsch.zip)
- `pgn/great-gms/Tarrasch_Siegbert/` → Download [Tarrasch.zip](https://www.pgnmentor.com/players/Tarrasch.zip)
- `pgn/great-gms/Bronstein_David/` → Download [Bronstein.zip](https://www.pgnmentor.com/players/Bronstein.zip)
- `pgn/great-gms/Korchnoi_Viktor/` → Download [Korchnoi.zip](https://www.pgnmentor.com/players/Korchnoi.zip)
- `pgn/great-gms/Larsen_Bent/` → Download [Larsen.zip](https://www.pgnmentor.com/players/Larsen.zip)
- `pgn/great-gms/Najdorf_Miguel/` → Download [Najdorf.zip](https://www.pgnmentor.com/players/Najdorf.zip)
- `pgn/great-gms/Reshevsky_Samuel/` → Download [Reshevsky.zip](https://www.pgnmentor.com/players/Reshevsky.zip)
- `pgn/great-gms/Shirov_Alexei/` → Download [Shirov.zip](https://www.pgnmentor.com/players/Shirov.zip)
- `pgn/great-gms/Ivanchuk_Vasyl/` → Download [Ivanchuk.zip](https://www.pgnmentor.com/players/Ivanchuk.zip)
- `pgn/great-gms/Kamsky_Gata/` → Download [Kamsky.zip](https://www.pgnmentor.com/players/Kamsky.zip)
- `pgn/great-gms/Polgar_Judit/` → Download [Polgar,Ju.zip](https://www.pgnmentor.com/players/Polgar,Ju.zip)
- `pgn/great-gms/Aronian_Levon/` → Download [Aronian.zip](https://www.pgnmentor.com/players/Aronian.zip)
- `pgn/great-gms/Nakamura_Hikaru/` → Download [Nakamura,H.zip](https://www.pgnmentor.com/players/Nakamura,H.zip)
- `pgn/great-gms/Caruana_Fabiano/` → Download [Caruana.zip](https://www.pgnmentor.com/players/Caruana.zip)
- `pgn/great-gms/Nepomniachtchi_Ian/` → Download [Nepomniachtchi.zip](https://www.pgnmentor.com/players/Nepomniachtchi.zip)

### 3. Extract PGN Files

1. Extract each ZIP file into its corresponding player folder
2. You should have .pgn files directly in the player folders (not in subfolders)
3. Delete the ZIP files after extraction

### 4. Regenerate library.json

After adding PGN files manually, regenerate the library manifest:

```bash
cd pgn
node generate-library.js
```

This will scan all PGN files and update `library.json` with the game metadata.

### 5. Verify

Check that `pgn/library.json` has been updated with your new games organized by category (World Champions, Great GMs, Misc / Demo).

## File Size Considerations

- Each ZIP is typically 100KB - 2MB
- Total library size should stay under 100MB for GitHub Pages
- If needed, curate subsets of games rather than complete collections
- The library manifest limits to 10 games per player by default

## Alternative Sources

If PGNMentor is unavailable, you can also source PGN files from:
- [Chess.com](https://www.chess.com/games) - Download individual games
- [Lichess](https://lichess.org) - Export games
- [FICS Games Database](http://www.ficsgames.org/)
- Personal PGN collections

Just place them in the appropriate category folder and run `node pgn/generate-library.js` to update the manifest.
