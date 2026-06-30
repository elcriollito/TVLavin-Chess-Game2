# FICS Integration Setup Guide

## Overview

CAISSA Chess now includes integration with FICS (Free Internet Chess Server), allowing users to play online chess as guests directly from the browser.

## Architecture

```
Browser (CAISSA) <--WebSocket--> Gateway Server <--TCP--> FICS (freechess.org:5000)
```

- **Gateway Server**: WebSocket/TCP bridge (`gateway/fics-local-node/fics-gateway.cjs`)
- **Frontend Client**: Browser-based UI (`js/fics-client.js`)
- **FICS**: Third-party chess server (freechess.org)

## Quick Start

### 1. Start the FICS Gateway Server

```bash
# Using npm script
npm run fics:gateway

# Or directly
node gateway/fics-local-node/fics-gateway.cjs
```

The gateway will start on port **8081** (configurable via `FICS_GATEWAY_PORT` env var).

You should see:
```
[FICS Gateway] Starting...
[FICS Gateway] WebSocket server listening on port 8081
[FICS Gateway] Ready! Connect via ws://localhost:8081
```

### 2. Start the Main CAISSA Server

In a separate terminal:

```bash
npm start
```

### 3. Open CAISSA in Browser

Navigate to: `http://localhost:3000`

Click the **"FICS"** navigation item in the left sidebar.

### 4. Connect and Play

1. Click **"Connect"** button
2. Wait for authentication (logs in as guest automatically)
3. Click a **Seek** preset button (e.g., "Blitz 3+0")
4. Wait for an opponent to accept
5. Play! Drag and drop pieces on the board

## Configuration

### Gateway URL

By default, the frontend connects to `ws://localhost:8081`.

To change this (e.g., for production deployment):

**Option 1: Environment variable (recommended)**
```javascript
// In js/fics-client.js, add at the top:
gatewayUrl: process.env.FICS_GATEWAY_URL || 'ws://localhost:8081',
```

**Option 2: Direct edit**
```javascript
// In js/fics-client.js, line ~33:
gatewayUrl: 'wss://your-production-gateway.com',
```

### Gateway Port

```bash
# Set custom port
FICS_GATEWAY_PORT=9000 npm run fics:gateway
```

### Rate Limiting

The gateway includes basic rate limiting (10 messages/second per client).

Adjust in `gateway/fics-local-node/fics-gateway.cjs`:
```javascript
const MAX_MESSAGES_PER_SECOND = 10; // Change as needed
```

## Features

### Current (MVP)

- ✅ Guest login to FICS
- ✅ Seek games with preset time controls (1+0, 3+0, 5+0, 10+0)
- ✅ Custom time controls
- ✅ Chessboard display with drag & drop
- ✅ Raw FICS console output
- ✅ Send custom FICS commands
- ✅ Game controls (Resign, Draw, Abort)
- ✅ Connection status indicators

### Planned Enhancements

- [ ] Full FICS Style 12 parsing (accurate board sync)
- [ ] Game time display
- [ ] Move history/PGN
- [ ] Opponent rating display
- [ ] Accept/decline match offers
- [ ] Observe games
- [ ] Advanced FICS commands (finger, who, games)

## FICS Commands

You can send any FICS command via the console:

**Common commands:**
```
help              - Show FICS help
who               - List online players
games             - List active games
seek 5 0          - Seek 5-minute game with 0 increment
observe 123       - Observe game #123
finger username   - Show player info
tell username msg - Send message (if not guest)
```

**Game commands (during a game):**
```
resign            - Resign the game
draw              - Offer a draw
abort             - Request abort
takeback          - Request takeback
```

## Troubleshooting

### Gateway won't start

**Error: `Address already in use`**
- Another process is using port 8081
- Solution: Kill the process or use a different port

```bash
# Find process using port 8081
netstat -ano | findstr :8081   # Windows
lsof -i :8081                  # Mac/Linux

# Or use different port
FICS_GATEWAY_PORT=9000 npm run fics:gateway
```

**Error: `Cannot find module 'ws'`**
- Missing dependency
- Solution: Install dependencies

```bash
npm install
```

### Cannot connect from browser

**"Connection error" in FICS UI**
- Gateway server not running
- Solution: Start gateway with `npm run fics:gateway`

**WebSocket connection fails**
- Check gateway URL in `js/fics-client.js`
- Verify port matches (default: 8081)
- Check browser console for errors

### Game won't start

**Board doesn't update**
- Current MVP has basic parsing
- Solution: Use console to see raw FICS output
- Future: Full Style 12 parser will fix this

**Moves don't send**
- Not connected or not authenticated
- Check console for connection status
- Reconnect if needed

### FICS connection drops

**"FICS connection closed"**
- Network timeout or FICS server issue
- Solution: Click "Disconnect" then "Connect" again
- Gateway has 5-minute timeout (configurable)

## Production Deployment

### Requirements

- Node.js server with WebSocket support
- Open port for gateway (default: 8081)
- Firewall rules to allow outbound TCP to freechess.org:5000

### Deployment Options

**Option 1: Same server as CAISSA**
```bash
# Run gateway alongside main app (use process manager)
pm2 start gateway/fics-local-node/fics-gateway.cjs --name fics-gateway
pm2 start server.js --name caissa
```

**Option 2: Separate gateway server**
```bash
# Deploy gateway to dedicated server
# Update frontend gatewayUrl to wss://gateway.yourdomain.com
```

**Option 3: Docker**
```dockerfile
# Add to Dockerfile
EXPOSE 8081
CMD ["node", "gateway/fics-local-node/fics-gateway.cjs"]
```

### Security Considerations

1. **Rate Limiting**: Gateway includes per-client rate limiting (10 msg/sec)
2. **Guest Only**: Current implementation only supports guest login (no passwords)
3. **WebSocket Security**: Use WSS (secure WebSocket) in production
4. **CORS**: Configure CORS if gateway is on different domain
5. **Monitoring**: Log all connections and commands for abuse detection

### Recommended Production Config

```javascript
// gateway/fics-local-node/fics-gateway.cjs

const WS_PORT = process.env.FICS_GATEWAY_PORT || 8081;
const MAX_MESSAGES_PER_SECOND = 5; // Lower for production
const TIMEOUT = 180000; // 3 minutes (vs 5 min in dev)

// Add IP-based connection limits
const MAX_CONNECTIONS_PER_IP = 3;
```

## Legal & Compliance

### FICS Terms

- FICS is a third-party service operated by freechess.org
- Users must comply with FICS Terms of Service
- CAISSA acts as a client interface, not operator
- Guest accounts have limited features (no messaging, no rating)

### Disclaimer

Include this notice in your UI (already added):
```
FICS (freechess.org) is a third-party chess server.
By connecting, you agree to their terms of service.
Guest login only - no account required.
```

### Attribution

FICS should be credited:
```
Chess server provided by FICS (Free Internet Chess Server)
Website: https://www.freechess.org/
```

## Development

### Project Structure

```
/server
  fics-gateway.cjs       - WebSocket/TCP gateway server

/js
  fics-client.js         - Frontend FICS client module

/css
  fics-client.css        - FICS UI styles

/index.html              - FICS section markup
```

### Message Protocol

**Client → Gateway:**
```json
{ "type": "connectGuest", "handlePrefix": "CAISSA" }
{ "type": "command", "text": "seek 5 0" }
{ "type": "move", "text": "e2e4" }
{ "type": "disconnect" }
```

**Gateway → Client:**
```json
{ "type": "status", "connected": true, "message": "..." }
{ "type": "authenticated", "message": "Logged in as guest" }
{ "type": "raw", "text": "<FICS output line>" }
{ "type": "error", "message": "..." }
```

### Testing

**Manual testing checklist:**
- [ ] Connect/disconnect
- [ ] Seek game (all presets)
- [ ] Custom time control
- [ ] Make moves
- [ ] Resign game
- [ ] Offer draw
- [ ] Send commands via console
- [ ] Reconnect after disconnect

**Load testing:**
```bash
# Test multiple connections
for i in {1..10}; do
  node -e "
    const ws = new (require('ws'))('ws://localhost:8081');
    ws.on('open', () => console.log('Connected $i'));
  " &
done
```

## Support

- **FICS Server Issues**: Contact freechess.org admins
- **CAISSA Issues**: Open issue on CAISSA repo
- **Gateway Issues**: Check logs in `gateway/fics-local-node/fics-gateway.cjs`

## References

- FICS Website: https://www.freechess.org/
- FICS Help: `telnet freechess.org 5000` then type `help`
- WebSocket Library: https://github.com/websockets/ws
- Chess.js: https://github.com/jhlywa/chess.js
- Chessboard.js: https://chessboardjs.com/

---

**Version**: 1.0 (MVP)
**Last Updated**: 2026-02-05
