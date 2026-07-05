# Season 4.4C - CAISSA Classic Sounds & Atmosphere Prep

## Objective

Season 4.4C prepares CAISSA Classic for future retro sound effects without introducing autoplay, external libraries, or changes to CAISSA core systems.

## Sound Toggle

The Classic table `Sound` button is now a real toggle:

- `[Sound: Off]`
- `[Sound: On]`

The button uses:

- `aria-pressed`
- keyboard-focusable native button behavior
- Win98-style pressed visual state
- descriptive `title` text

## Preference Storage

The sound preference is stored in localStorage under:

`caissaClassicSoundEnabled`

If the preference is unavailable because the browser blocks storage, the toggle safely falls back to Off.

## Sound Manager Prep

CAISSA Classic now has a lightweight internal sound manager hook prepared for these cue types:

- connect
- disconnect
- move
- join
- notify
- error

The manager records the latest cue and honors the user preference, but this phase does not play audio files and does not load any audio assets.

## Anti-Autoplay Rule

No audio plays on page load.

No audio plays before explicit user interaction.

No autoplay, audio loops, or external sound libraries were added.

Future sound assets can route through the prepared hook only after user activation.

## UI Feedback

When the user toggles sound:

- `Sound enabled.` or `Sound disabled.` is added to the system log.
- The Classic Activity Feed receives the same event.
- The Win98-style status bar shows `[Sound: On]` or `[Sound: Off]`.

## What Was Not Changed

This phase did not modify:

- Gateway
- FICS protocol
- Style12
- PGN
- Replay
- Authentication
- Board model
- Clock model
- State model
- Spectator TV
- Arena
- Analyze
- OpeningDB
- Core logic

## Validation Notes

Required validation for this phase:

- `node --check js/yahoo-classic-section.js`
- `git diff --check`
- local smoke for `/?section=yahooClassic`
- Watch/JOIN table smoke
- no autoplay verification
- no external library verification
- Production Validation Suite

