# Frontend Integration Guide

## Overview

Update the CAISSA Chess frontend to use the Cloudflare Worker API instead of direct Chess.com/Lichess API calls.

---

## API Endpoint

**Production URL:**
```
https://api.caissa-chess.org/api/games
```

**Development/Testing URL:**
```
https://caissa-game-fetcher.your-subdomain.workers.dev/api/games
```

---

## Changes Required

### File: `app.js`

Find the "Fetch & Analyze Games" button handler (around line 5000+). Replace the direct Chess.com/Lichess fetch with a call to the Worker API.

---

## Code Changes

### Step 1: Find the Current Implementation

Look for this section in `app.js`:

```javascript
// Import Fetch & Analyze button handler
document.getElementById('importFetchBtn').addEventListener('click', async () => {
    // Current implementation that directly fetches from Chess.com/Lichess
    // This is blocked by CORS
});
```

---

### Step 2: Add Worker API Configuration

At the top of `app.js` (after other constants), add:

```javascript
// ============================================================================
// WORKER API CONFIGURATION
// ============================================================================

const WORKER_API_URL = 'https://api.caissa-chess.org/api/games';

// Fallback for development/testing
// const WORKER_API_URL = 'https://caissa-game-fetcher.your-subdomain.workers.dev/api/games';
```

---

### Step 3: Create Helper Function

Add this helper function (place it near other helper functions):

```javascript
/**
 * Fetch games via Cloudflare Worker API
 * @param {string} platform - 'chesscom' or 'lichess'
 * @param {string} username - Username on platform
 * @param {number} maxGames - Max games to fetch (default 20)
 * @param {string} timeControl - Time control filter ('all', 'bullet', 'blitz', 'rapid')
 * @returns {Promise<object>} - { pgn, count, source, warnings }
 */
async function fetchGamesViaWorker(platform, username, maxGames = 20, timeControl = 'all') {
    // Build query parameters
    const params = new URLSearchParams({
        platform: platform === 'chess.com' ? 'chesscom' : 'lichess',
        username: username,
        max: maxGames,
        tc: timeControl
    });

    const url = `${WORKER_API_URL}?${params.toString()}`;

    console.log('🌐 Fetching games via Worker:', url);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Worker API error: ${response.status}`);
        }

        const data = await response.json();

        console.log(`✅ Fetched ${data.count} games from ${data.source}${data.cached ? ' (cached)' : ''}`);

        if (data.warnings && data.warnings.length > 0) {
            console.warn('⚠️ Warnings:', data.warnings);
        }

        return {
            pgn: data.pgn,
            count: data.count,
            source: data.source,
            warnings: data.warnings || [],
            cached: data.cached || false
        };

    } catch (error) {
        console.error('❌ Worker API fetch failed:', error);
        throw error;
    }
}
```

---

### Step 4: Update the "Fetch & Analyze" Button Handler

Replace the existing implementation with this:

```javascript
// Import: Fetch & Analyze Games Button
document.getElementById('importFetchBtn').addEventListener('click', async () => {
    const provider = document.getElementById('importProvider').value; // 'lichess' or 'chess.com'
    const username = document.getElementById('importUsername').value.trim();
    const gameCount = parseInt(document.getElementById('importGameCount').value) || 20;
    const timeControl = document.getElementById('importTimeControl').value || 'all';

    // Validation
    if (!username) {
        showToast('Please enter a username', 'error');
        return;
    }

    // Normalize provider name
    const platform = provider === 'chess.com' ? 'chesscom' : 'lichess';

    // Show progress section
    document.getElementById('importProgressSection').style.display = 'block';
    document.getElementById('importCorsMessage').style.display = 'none';

    updateImportProgress({
        stage: 'fetching',
        message: `Fetching ${gameCount} games from ${provider}...`,
        progress: 10
    });

    try {
        // Fetch games via Worker API
        const result = await fetchGamesViaWorker(platform, username, gameCount, timeControl);

        updateImportProgress({
            stage: 'parsing',
            message: `Parsing ${result.count} games...`,
            progress: 60
        });

        // Show warnings if any
        if (result.warnings.length > 0) {
            console.warn('Import warnings:', result.warnings);
        }

        // Parse PGN using existing pipeline
        updateImportProgress({
            stage: 'analyzing',
            message: 'Analyzing games...',
            progress: 80
        });

        // Use existing PGN parsing function
        const pgnText = result.pgn;
        const games = parsePGNText(pgnText);

        if (games.length === 0) {
            throw new Error('No valid games found in PGN data');
        }

        console.log(`✅ Parsed ${games.length} games`);

        // Add to insight session (existing function)
        await addGamesToInsightSession(games);

        updateImportProgress({
            stage: 'complete',
            message: `Successfully imported ${games.length} games!`,
            progress: 100
        });

        // Show success message
        showToast(`✅ Imported ${games.length} games from ${provider}`, 'success');

        // Hide progress after 2 seconds
        setTimeout(() => {
            document.getElementById('importProgressSection').style.display = 'none';
        }, 2000);

        // Switch to results view if available
        if (typeof renderInsightResults === 'function') {
            renderInsightResults();
        }

    } catch (error) {
        console.error('❌ Import failed:', error);

        updateImportProgress({
            stage: 'error',
            message: `Error: ${error.message}`,
            progress: 0
        });

        showToast(`Failed to import games: ${error.message}`, 'error');

        // Hide progress section after showing error
        setTimeout(() => {
            document.getElementById('importProgressSection').style.display = 'none';
        }, 3000);
    }
});
```

---

### Step 5: Update Progress Helper (if needed)

Make sure you have the `updateImportProgress` function:

```javascript
function updateImportProgress(progress) {
    const progressBar = document.getElementById('importProgressBar');
    const progressText = document.getElementById('importProgressText');

    if (progressBar) {
        progressBar.style.width = `${progress.progress || 0}%`;
    }

    if (progressText) {
        progressText.textContent = progress.message || '';
    }
}
```

---

### Step 6: Remove CORS Fallback Logic (Optional)

You can now remove or hide the CORS fallback message since the Worker handles it:

```javascript
// Remove or comment out CORS message display logic
// document.getElementById('importCorsMessage').style.display = 'block';
```

Or update the message to say "Using server-side fetch...":

```javascript
// Update CORS message to server-side info
document.getElementById('importCorsMessage').innerHTML = `
    <strong><i class="fas fa-server"></i> Server-Side Fetch</strong>
    <p style="margin: 8px 0 0 0; font-size: 13px;">
        Games are being fetched through our server to avoid browser restrictions.
    </p>
`;
```

---

## Testing

### 1. Test with Console

Open browser console and run:

```javascript
// Test Chess.com
fetchGamesViaWorker('chesscom', 'Hikaru', 5, 'blitz')
    .then(result => console.log('Success:', result))
    .catch(error => console.error('Error:', error));

// Test Lichess
fetchGamesViaWorker('lichess', 'DrNykterstein', 5, 'rapid')
    .then(result => console.log('Success:', result))
    .catch(error => console.error('Error:', error));
```

### 2. Test with UI

1. Open CAISSA Insight modal
2. Switch to "Chess.com / Lichess" tab
3. Enter username: `Hikaru` (Chess.com) or `DrNykterstein` (Lichess)
4. Click "Fetch & Analyze Games"
5. Check console for logs
6. Verify games are imported and analyzed

### 3. Test Error Handling

Try invalid username:

1. Enter username: `InvalidUser12345`
2. Click "Fetch & Analyze Games"
3. Should show error toast: "Chess.com user not found"

---

## Error Messages

The Worker returns these error types:

| Error | Message | Action |
|-------|---------|--------|
| Missing username | "Username is required" | Show validation error |
| User not found | "Chess.com user 'X' not found" | Show error toast |
| No games | "No games found for user" | Show info message |
| Rate limit | "Too many requests" | Show "Please wait" message |
| Network error | "Worker API error: 500" | Show generic error + retry |

---

## Deployment Checklist

Before deploying frontend changes:

- [ ] Worker deployed to Cloudflare
- [ ] Custom domain configured (api.caissa-chess.org)
- [ ] Worker tested with curl
- [ ] Frontend code updated with Worker API URL
- [ ] Tested with real Chess.com/Lichess usernames
- [ ] Error handling tested
- [ ] CORS verified (check Network tab)
- [ ] Mobile tested (if applicable)

---

## Rollback Plan

If Worker API fails:

1. **Option A:** Revert frontend to CORS fallback message
   ```javascript
   // Show CORS message and ask user to use Local PGN
   document.getElementById('importCorsMessage').style.display = 'block';
   ```

2. **Option B:** Add Worker health check before attempting fetch
   ```javascript
   // Check if Worker is healthy before fetching
   const healthCheck = await fetch('https://api.caissa-chess.org/api/health');
   if (!healthCheck.ok) {
       // Fall back to CORS message
       throw new Error('Server is temporarily unavailable');
   }
   ```

---

## Performance Notes

1. **Caching:** Worker caches responses for 60 seconds
   - Same username + time control = instant response
   - Different parameters = new fetch

2. **Rate Limiting:** 10 requests/minute per IP
   - Normal users won't hit this
   - Shows friendly error if exceeded

3. **Timeout:** Worker has 30-second timeout
   - Most requests complete in 2-5 seconds
   - If slow, show "Still fetching..." message

---

## Next Steps

1. Deploy Worker to Cloudflare
2. Update `app.js` with code above
3. Test thoroughly in development
4. Deploy to Vercel
5. Test on production (caissa-chess.org)
6. Monitor Worker logs for errors
7. Collect user feedback

---

## Support

If you encounter issues:

1. Check browser console for errors
2. Check Worker logs in Cloudflare dashboard
3. Verify CORS headers with Network tab
4. Test Worker API directly with curl
5. Check this guide for troubleshooting steps
