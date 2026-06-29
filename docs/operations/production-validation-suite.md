# CAISSA Production Validation Suite

Lightweight post-deployment smoke validation for the production CAISSA FICS flow.

This is not a full end-to-end test framework. It launches a Chromium browser through
Chrome DevTools Protocol, opens the production site, and validates the critical
guest FICS workflow.

## Run

```bash
node tools/validation/production-validation-suite.cjs
```

The default target is:

```text
https://www.caissa-chess.org
```

## Environment

- Requires Node.js and the existing `ws` dependency.
- Requires Chrome, Chromium, or Edge.
- Does not require Vercel CLI.
- Does not modify production data or application files.

Optional environment variables:

```bash
CAISSA_PVS_URL=https://www.caissa-chess.org
CAISSA_PVS_BROWSER="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
CAISSA_PVS_PORT=9333
CAISSA_PVS_HEADLESS=0
CAISSA_PVS_KEEP_BROWSER=1
```

## Checks

- Guest Login
- Lobby
- Watch
- Style12
- Promotion
- Console
- Disconnect
- Reconnect

## Example Output

```text
CAISSA Production Validation

Guest Login.. PASS
Lobby........ PASS
Watch........ PASS
Style12...... PASS
Promotion.... PASS
Console...... PASS
Disconnect... PASS
Reconnect.... PASS

Overall .... PASS
```

## Notes

The suite depends on live FICS availability and the presence of at least one
watchable game or lobby action. If FICS is unavailable or unusually quiet, the
suite may fail even when CAISSA itself is healthy.
