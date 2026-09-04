# Portuguese localization checkpoint

Status: **PENDING PHYSICAL CERTIFICATION**

## Identity

- Locale: `pt`
- Public native name: **Português**
- Catalog: 446 keys, with exact EN/ES/PT parity
- Checkpoint commit: `feat(i18n): add complete portuguese localization`
- Preview: assigned after the GL-002 checkpoint deployment

This file records a freeze candidate. Portuguese is not `FROZEN / APPROVED` until Alexander completes physical certification.

## Certified surfaces

- Shared shell, sidebar, authentication states, navigation, support, help, about, and language selector
- Play setup at `/play`
- Games at `/play/games`
- Bots at `/play/bots`
- Coach at `/play/coach`
- Game Library at `/game-library`
- PGN Replayer at `/pgn-replayer`
- Dynamic statuses, errors, loading and empty states, setup summaries, dialogs, tooltips, post-game states, and accessible attributes

## Terminology decisions

- The catalog uses broadly understandable international Portuguese with a practical Brazilian UI preference.
- `Jogar`, `Partida`, `Lance`, `Brancas`, `Pretas`, `Empate`, `Xeque-mate`, `Afogamento`, and `Abandonar` are the core chess terms.
- `Bullet` and `Blitz` remain established chess-platform terms. `Rapid` is localized as `Rápida`.
- `Coach` remains the product-mode name; surrounding language is Portuguese.
- CAISSA, CAISSA Classic, Stockfish, PGN, FEN, Elo, FICS, player names, bot names, opening names, and move notation are not translated.
- `pt-BR` and `pt-PT` normalize to `pt`; automatic Portuguese suggestion remains disabled until GL-007.

## Shared catalog additions

Two legitimate dynamic keys were added to EN, ES, and PT: `pgn.resultTemplate` and `pgn.moveTemplate`. They replace Spanish-only runtime string construction and raise every catalog from 444 to 446 keys.

## Automated QA

- Exact key and placeholder parity
- Static English/Spanish residual and terminology checks
- Live EN → PT, ES → PT, PT → EN, and PT → ES switching
- Reload and cross-route persistence
- Initial and post-interaction residual detector
- Accessible names, titles, placeholders, dialogs, setup summaries, and bot cards
- Responsive matrix at 320, 360, 375, 390, 412, 430, 768, 1024, 1280, 1440, and 1920 px
- Effective desktop panel with expanded and compact sidebar
- Chromium and WebKit
- UX-011 pseudo-expanded copy regression

## Exceptions and next action

No visible English fallback is accepted on the certified Portuguese surfaces. Proper names and the established terms listed above are intentional exceptions. French, German, Russian, and Hindi have not been started.

Alexander must physically certify the GL-002 Preview before this status can become `FROZEN / APPROVED` and before GL-003 begins.
