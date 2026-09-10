# FICS-RD-002 layout foundation

The two-column FICS shell is a presentation-only layer over the existing
`window.CaissaFICSClient` owner. At startup it reparents the existing board,
player bars, lobby controls, login controls, and console into BOARD and
HEAD/BODY/FOOT regions. It never clones those nodes or constructs a board,
socket, game, clock, seek, or console owner.

## Rollback

The redesign is enabled unless `window.CAISSA_FICS_REDESIGN_ENABLED` is
explicitly `false` before `js/fics-layout-shell.js` initializes. Set that one
flag to `false` and reload to retain the legacy DOM presentation unchanged.

For an immediate local rollback without reloading, call:

```js
window.CaissaFICSShell.setEnabled(false);
```

That operation moves every existing functional node back to its original
legacy parent and removes the `fics-rd2-enabled` class. Calling
`setEnabled(true)` reapplies the shell using the same node identities.

Tab selection is held only inside `CaissaFICSShell` and is passed as
`requestedLobbyView` to `CaissaFICSPresentation.getViewState()`. It never
writes to the canonical FICS client. Players remains an unavailable,
truthful placeholder until protocol-backed directory work is authorized.
