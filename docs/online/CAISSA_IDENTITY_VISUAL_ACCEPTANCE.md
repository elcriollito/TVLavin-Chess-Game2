# CAISSA Public Identity — evidencia visual local

El diseño aprobado no fue reconstruido. Las capturas usan fixtures sintéticos y servidor local.

Directorio: `test-results/public-identity/`

1. `01-account-desktop-existing.png` — Account con nickname existente.
2. `02-account-desktop-fallback.png` — alias seguro sin nickname.
3. `03-account-editor-open.png` — editor abierto.
4. `04-nickname-available.png` — disponibilidad.
5. `05-nickname-occupied.png` — colisión sin revelar propietario.
6. `06-nickname-saved.png` — guardado.
7. `07-unicode-validation-error.png` — error de política.
8. `08-account-mobile-390x844.png` — Account móvil.
9. `09-new-game-canonical-player-strips.png` — strips canónicos.
10. `10-online-players-directory.png` — directorio.
11. `11-online-game-history-sanitized.png` — historial saneado.
12. `12-guest-vs-registered.png` — Guest frente a miembro.
13. `13-historical-game-sanitized.png` — partida histórica saneada.
14. `14-historical-export-sanitized.pgn` — exportación sin PII.

Inspección: desktop, 390×844 y estados Online no muestran email ni nombre privado; los fallbacks son distinguibles y no se cortan; historial y Game Over continúan legibles. Axe no produjo hallazgos graves en la superficie Account. No hubo cambios en tablero, Quiet Drag ni Game Action Footer.

Gate: `PUBLIC_IDENTITY_VISUAL_REGRESSION_READY` para revisión humana. No representa una Preview alojada.
