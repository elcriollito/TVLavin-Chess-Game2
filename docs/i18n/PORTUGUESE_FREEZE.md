# Portuguese localization checkpoint

Status: **FROZEN / APPROVED**

## Identity

- Locale: `pt`
- Public native name: **Português**
- Frozen baseline catalog: 446 keys, with exact EN/ES/PT parity
- Checkpoint commit: `feat(i18n): add complete portuguese localization`
- Visual-polish checkpoint: `fix(i18n): prevent mid-word breaks in multilingual ui`
- Approval date: **2026-09-03**
- Physically certified HEAD: `5fe129bf0b0315a34c79d1908e5e6bde06bb7d7f`
- Catalogs: **EN 446 / ES 446 / PT 446**
- Exact parity: **PASS**
- Physical certification: **PASS**
- UX-012 mobile navigation: **PASS**
- GL-002.1 visual polish: **PASS**
- New regressions: **0**

Alexander formally approved and froze the Portuguese localization after completing final physical certification.

## Physical certification result

Alexander physically confirmed that the Portuguese infrastructure, navigation, authentication, Play setup, and representative chess terminology work correctly. The remaining finding was responsive word fragmentation rather than a linguistic defect.

GL-002.1 replaces arbitrary mid-word breaks in Play mode tabs and shared navigation controls with natural wrapping at spaces. `Premium` remains whole, while `Melhorar plano` may occupy two lines without splitting either word. The policy is locale-neutral and applies equally to English, Spanish, Portuguese, and future languages.

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

### LIB-004 — first-party Game Library

LIB-004 adds 98 necessary shared `library.*` keys to EN, ES, and PT, raising all three catalogs from 446 to 544 keys with exact parity. The additions cover the new standalone Game Library shell, Positions/Games controls, search, advanced filters, Backup/Import, empty states, pagination, local-storage notice, accessible labels/placeholders, saved-item actions, dialogs, notifications, errors, and sync states.

This is an allowed frozen-catalog change under rule 2 (“a necessary new shared key”). No previously approved Portuguese value or terminology decision was changed. The public Game Library remains Under Construction; these strings also preserve the future functional surface without exposing it as released.

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
- Whole-word geometry checks for Play tabs, authentication labels, Premium, and the upgrade badge
- Narrow effective desktop panels and locale-neutral 40% pseudo-expansion

## Exceptions and next action

No visible English fallback is accepted on the certified Portuguese surfaces. Proper names and the established terms listed above are intentional exceptions. French, German, Russian, and Hindi have not been started.

Portuguese is frozen. Later work must not modify the PT catalog or the approved terminology decisions except for:

1. A confirmed bug.
2. A necessary new shared key, added with exact catalog parity.
3. A change explicitly authorized by Alexander.

Every future Portuguese change must be documented.

Global Languages expansion is voluntarily paused with English, Spanish, and Portuguese certified. French, German, Russian, and Hindi remain unstarted.
