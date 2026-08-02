# Play v2 Players presentation policy

**Contract:** `PlayV2PlayersPresentationPolicy@1.0.0`

**Season:** 11.7.2

**Status:** Players presentation omitted; accepted locally for internal-beta boundaries only

## Product decision

The initial Play v2 beta omits Players completely. This is the honest expression of “Enter. Choose. Play.” while every CAISSA-native multiplayer capability is missing. There is no tab, disabled tab, card, panel, lobby, informational route, layout slot, promotion, or screen-reader-only message. “Players — Coming Soon” is prohibited until a separate product approval; even that approval cannot activate a runtime without independently certified CAISSA-native infrastructure and an explicit future policy version.

The policy also prohibits fictional users, simulated presence, fabricated ratings, simulated challenges, fake matchmaking, FICS handoff, Legacy Play handoff, and analytics transport. `publicReady` remains false.

## Complete presentation inventory

| Occurrence | Classification and disposition |
| --- | --- |
| Simplified shell mode map and snapshot | Future-policy/blocked-state references (`players: false`, `playersPanel: null`); produce no item, target, or slot. |
| Route controller reserved mode | Future-policy guard; direct and state requests fail closed to the deterministic unavailable behavior or canonical Games state. |
| Load registry and lazy loader | No Players group exists; `players-stack` is test-only hostile input and rejects. |
| `PlayV2NativePlayersPolicy@1.0.0` and presentation policy | Future-policy references; passive contracts only. |
| Generated `play-v2.html` | Active Play v2 surface has no Players panel, label, metadata, navigation entry, resource, or handoff. Compatibility-preserved Classic/FICS/Spectator roots are explicitly hidden, inert, aria-hidden, and unreachable. |
| `index.html`, `yahoo-classic.html`, FICS client and gateway | Classic-owned or Legacy FICS-owned; unchanged and intentionally retain legitimate Players terminology. |
| `js/play/players-panel.js` and `js/play/players/*` | Dormant implementation excluded from Play v2; not described as absent from the repository. |
| Analytics Players vocabulary | Dormant/test-only blocked-event characterization; transport is disabled and this presentation emits no event. |
| Browser/unit fixtures and historical QA manifests | Test-only superseded characterization or hostile-input evidence; not public presentation. |
| Architecture records | Documentation-only native capability and boundary evidence. |
| Generic chess uses of “player,” rating, or challenge | False positives unless they advertise or activate multiplayer Players. |

The generated entry inherits dormant Classic, FICS, and Spectator markup because removing those monolithic initialization owners breaks admitted-mode keyboard lifecycle. Their executable resources were already excluded. The deterministic builder now removes navigation and promotional metadata and makes all three legacy roots explicitly hidden, inert, aria-hidden, and unreachable only in `play-v2.html`; their source owners remain unchanged.

## Routes, navigation, and accessibility

`/play/beta/players`, mixed case, encoding, duplicate slashes, queries, fragments, storage, history, configuration, registry, lazy import, retry, and recovery cannot display Players or load Players/FICS resources. Beta-shaped invalid routes receive the runtime-free unavailable document, never Classic, FICS, or Legacy Play.

The visible mode rail contains exactly Games, Bots, Coach in that order. It has no Players tab, `aria-controls`, hidden focus target, announcement, empty track, or promotional text. Arrow navigation cycles coherently through the three admitted modes. Chromium and WebKit automation verifies the exact three equal tracks, zero overflow at 320/360/390/768/1440 CSS pixels, reduced motion, forced colors where supported, and no serious/critical structural axe findings. Physical-device and named-screen-reader certification remain pending.

## Security, privacy, and evidence

Omission creates no identity collection, profile storage, presence tracking, cookies, database, network destination, analytics transport, FICS connection, enumeration surface, or consent surface. Static builder guards reject future Players DOM, routes/resources, Classic/FICS presentation metadata, and legacy navigation in the dedicated entry while preserving legacy source documents. Contract tests freeze every declaration and future gate; browser tests cover route/state/resource bypasses, navigation, responsive layout, and accessibility. Existing native Players, FICS/product isolation, beta entry, Games, Bots, Coach, PostGame, and Mentor certifications remain independent regression owners.

Season 11.7.2 certifies omission only. It does not implement or advertise Players, authorize Coming Soon, close the 16 native capability gates, enable analytics, or advance public beta exposure.
