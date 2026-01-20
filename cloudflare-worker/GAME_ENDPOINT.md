# `/game` Endpoint Documentation

## Overview

The `/game` endpoint validates PGN data and extracts game metadata (move count, result, players, etc.) without performing deep analysis.

---

## Endpoint

```
GET /api/game?pgn={PGN_TEXT}
```

Or:

```
GET /game?pgn={PGN_TEXT}
```

---

## Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pgn` | string | Yes | PGN text (URL-encoded) |

---

## Validation Rules

1. **Required:** PGN parameter must be provided
2. **Size Limit:** Maximum 100,000 characters (100KB)
3. **Minimum Length:** At least 10 characters
4. **Format Check:** Must contain PGN header tags (brackets)

---

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "game": {
    "moveCount": 40,
    "result": "1-0",
    "white": "Magnus Carlsen",
    "black": "Fabiano Caruana",
    "event": "World Championship 2018",
    "site": "London",
    "date": "2018.11.09"
  },
  "pgnSize": 1234,
  "timestamp": "2024-01-19T15:30:00.000Z"
}
```

### Error Responses

#### Missing PGN (400)
```json
{
  "error": "Invalid PGN",
  "message": "PGN is required"
}
```

#### PGN Too Large (400)
```json
{
  "error": "Invalid PGN",
  "message": "PGN too large (max 100000 characters, got 150000)"
}
```

#### Invalid Format (400)
```json
{
  "error": "Invalid PGN",
  "message": "Invalid PGN format - missing header tags"
}
```

#### Rate Limit Exceeded (429)
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please wait a minute and try again."
}
```

#### Parsing Failed (500)
```json
{
  "error": "Parsing failed",
  "message": "Unexpected error during metadata extraction"
}
```

---

## Examples

### Example 1: Valid PGN

**Request:**
```bash
curl "https://api.caissa-chess.org/api/game?pgn=%5BEvent%20%22Casual%20Game%22%5D%0A%5BSite%20%22%3F%22%5D%0A%5BDate%20%222024.01.19%22%5D%0A%5BWhite%20%22Player1%22%5D%0A%5BBlack%20%22Player2%22%5D%0A%5BResult%20%221-0%22%5D%0A%0A1.%20e4%20e5%202.%20Nf3%20Nc6%203.%20Bb5%201-0"
```

**Response:**
```json
{
  "success": true,
  "game": {
    "moveCount": 3,
    "result": "1-0",
    "white": "Player1",
    "black": "Player2",
    "event": "Casual Game",
    "site": "?",
    "date": "2024.01.19"
  },
  "pgnSize": 156,
  "timestamp": "2024-01-19T15:30:00.000Z"
}
```

### Example 2: JavaScript Fetch

```javascript
const pgn = `[Event "Casual Game"]
[Site "?"]
[Date "2024.01.19"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0`;

const encodedPGN = encodeURIComponent(pgn);
const url = `https://api.caissa-chess.org/api/game?pgn=${encodedPGN}`;

const response = await fetch(url);
const data = await response.json();

console.log(data);
// {
//   success: true,
//   game: {
//     moveCount: 3,
//     result: "1-0",
//     white: "Player1",
//     black: "Player2",
//     ...
//   }
// }
```

### Example 3: Python

```python
import requests
import urllib.parse

pgn = """[Event "Casual Game"]
[Site "?"]
[Date "2024.01.19"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 1-0"""

encoded_pgn = urllib.parse.quote(pgn)
url = f"https://api.caissa-chess.org/api/game?pgn={encoded_pgn}"

response = requests.get(url)
data = response.json()

print(data['game']['moveCount'])  # 3
print(data['game']['result'])     # 1-0
```

---

## Metadata Extraction

The endpoint extracts the following metadata from PGN:

### Move Count
- Counts move numbers (e.g., "1.", "2.", "3.")
- Returns total number of full moves in the game

### Result
Possible values:
- `"1-0"` - White wins
- `"0-1"` - Black wins
- `"1/2-1/2"` - Draw
- `"*"` - Game in progress or unknown

### Player Names
- `white` - White player name from `[White "..."]` tag
- `black` - Black player name from `[Black "..."]` tag
- Returns `null` if tag not found

### Optional Metadata
- `event` - Event name from `[Event "..."]` tag
- `site` - Location from `[Site "..."]` tag
- `date` - Date from `[Date "..."]` tag
- All return `null` if tag not found

---

## Rate Limiting

Same as other endpoints:
- **Limit:** 10 requests per minute per IP
- **Window:** 60 seconds
- **Response:** HTTP 429 when exceeded

---

## CORS

Same CORS policy as other endpoints:
- Allows: `caissa-chess.org`, `*.vercel.app`, localhost
- Methods: `GET`, `OPTIONS`
- Headers: Standard CORS headers included

---

## Use Cases

### 1. PGN Validation
Validate user-submitted PGN before processing:
```javascript
async function validatePGN(pgn) {
  const response = await fetch(`/api/game?pgn=${encodeURIComponent(pgn)}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  return await response.json();
}
```

### 2. Quick Metadata Preview
Show game info before loading full analysis:
```javascript
const metadata = await fetch(`/api/game?pgn=${encodedPGN}`).then(r => r.json());
console.log(`${metadata.game.white} vs ${metadata.game.black}`);
console.log(`${metadata.game.moveCount} moves, result: ${metadata.game.result}`);
```

### 3. Batch Validation
Validate multiple PGNs (respecting rate limits):
```javascript
async function validateMultiplePGNs(pgnList) {
  const results = [];
  for (const pgn of pgnList) {
    const result = await fetch(`/api/game?pgn=${encodeURIComponent(pgn)}`);
    results.push(await result.json());
    await new Promise(resolve => setTimeout(resolve, 100)); // Avoid rate limit
  }
  return results;
}
```

---

## Limitations

### What This Endpoint Does NOT Do:
- ❌ Chess engine analysis (Stockfish)
- ❌ Position evaluation
- ❌ Best move suggestions
- ❌ Opening book lookup
- ❌ Endgame tablebase queries
- ❌ Move validation (assumes PGN is valid)

### What It DOES Do:
- ✅ Validates PGN format
- ✅ Enforces size limits
- ✅ Extracts metadata (players, result, moves)
- ✅ Counts moves
- ✅ Returns clean JSON response

---

## Testing

### Manual Test
```bash
# Test with simple PGN
curl "https://api.caissa-chess.org/api/game?pgn=%5BEvent%20%22Test%22%5D%0A%5BResult%20%221-0%22%5D%0A1.%20e4%20e5%201-0"
```

### Automated Test
Add to `test.js`:
```javascript
async function testGameEndpoint() {
  const pgn = '[Event "Test"]\n[Result "1-0"]\n1. e4 e5 1-0';
  const url = `${WORKER_URL}/api/game?pgn=${encodeURIComponent(pgn)}`;
  const response = await fetch(url);

  if (!response.ok) throw new Error(`Status ${response.status}`);

  const data = await response.json();
  if (!data.success) throw new Error('Expected success: true');
  if (data.game.result !== '1-0') throw new Error('Wrong result');
  if (data.game.moveCount !== 1) throw new Error('Wrong move count');
}
```

---

## Production Considerations

### Performance
- Very fast (< 10ms typical)
- No external API calls
- Minimal CPU usage
- Suitable for high-frequency requests (within rate limits)

### Security
- Input validation prevents oversized requests
- Rate limiting prevents abuse
- No code execution (regex only)
- Safe for public exposure

### Scalability
- Cloudflare Workers global distribution
- No database required
- Stateless (except rate limiting)
- Scales to millions of requests

---

## Future Enhancements (Not Implemented Yet)

Possible future additions:
- POST support for large PGNs (avoid URL length limits)
- Multiple games in single PGN
- Opening classification
- Time control extraction
- ELO/rating extraction
- FEN position extraction

---

## Summary

The `/game` endpoint provides a simple, fast way to:
1. Validate PGN format
2. Extract basic game metadata
3. Count moves
4. Get game result

**No analysis, no Stockfish, just clean metadata extraction.**

Perfect for:
- Form validation
- Game preview cards
- Quick metadata display
- PGN format checking
