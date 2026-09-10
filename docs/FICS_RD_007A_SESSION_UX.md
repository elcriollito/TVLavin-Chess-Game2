# FICS-RD-007A — Automatic Guest Login and Compact Session UX

## Architecture decision

`CaissaFICSClient` remains the only connection, socket, authentication, reconnect, and session-state owner. The redesign shell only projects its frozen presentation snapshot into the compact page chrome, menu, dialog, and Console status. No Players protocol work is included.

On the first FICS entry in a page lifetime, `onEnter()` asks the canonical client to make one automatic guest attempt. `autoGuestAttempted` prevents a second automatic attempt. An existing connecting, connected, reconnecting, or authenticated session is retained, including across route exit and return. The existing bounded reconnect path remains responsible for guest reconnects.

The registered-user dialog relocates and reuses the existing username and password inputs and calls the canonical registered-login method. The visible password is cleared as credentials are prepared, the transient pending password is cleared after it is sent, and neither presentation snapshots nor Console messages contain it.

## Presentation contract

- Page chrome: canonical identity/status control and Settings.
- HEAD: Tables, Players, Seek only.
- BODY: the selected product view or active game only.
- FOOT: the single hybrid Console.
- Settings: gateway, latency, and technical/session/board diagnostics.

The session menu offers only actions valid for the current canonical state. Connection errors never replace or cover BODY.

## Measured layout

At 1600 × 1000, the starting checkpoint measured BODY 697 px and FOOT 88 px. RD-007A measures BODY 742 px and collapsed FOOT 43 px: 45 px moves from permanent login chrome into product content.

## Verification guard

`window.CAISSA_FICS_AUTO_GUEST_ENABLED = false` disables the automatic attempt for deterministic tests or controlled hosts without changing canonical manual login. `window.CAISSA_FICS_REDESIGN_ENABLED = false` continues to restore the pre-redesign DOM ownership and controls.
