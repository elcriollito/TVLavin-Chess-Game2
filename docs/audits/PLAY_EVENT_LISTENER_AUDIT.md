# Play Event Listener Audit

Audit version: 1.0.0. Scope: Simplified Play and directly connected surfaces.

| Surface | Event/observer | Target | Owner | Attach | Detach | Re-entry | Risk/decision |
| --- | --- | --- | --- | --- | --- | ---: | --- |
| Route controller | popstate | window | route | initialize | dispose | 1 | Existing named handler is bounded |
| Simplified shell | click, resize, orientationchange, transitionend | shell/window/document | shell | activate | deactivate/dispose | repeated | Migrated to scoped lifecycle |
| Games/Bots/Coach | change, click, toggle/custom | panel roots/window | panel | mount | dispose | lazy/reopen | Existing retained handler arrays are bounded |
| Players | click, keydown | panel root | panel | mount | unmount/dispose | repeated | Delegated and explicitly removed |
| PostGame | click, change | PostGame root | panel | mount | unmount/dispose | rerender | Delegated action handler; no rerender attachment |
| Guided Replay | click, submit | replay root | panel | mount | unmount/dispose | reopen | Retained handler array removes all |
| Board adapter | pointer, keyboard, resize observer | board/widget | board | initialize | unmount/dispose | position updates | Precise Board API ownership retained |
| Themes | media change | MediaQueryList | application | initialize | dispose | theme changes | Single stored handler |
| Accessibility | focus and live-region controls | shell | accessibility-manager | activate | dispose | shell re-entry | One manager and two live regions |
| Worker | message, error, messageerror | Worker | worker-context | generation initialize | terminate/dispose | restart | Three listeners per generation; lifecycle audit remains authoritative |
| Lazy actions | Promise completion | internal | lazy-loader | route/action | settle/dispose | repeated | Token guards reject stale completion |
| Legacy application/modals | click, keydown, DOMContentLoaded, timers | document/window/elements | application/modal | application initialize | page lifetime/modal removal | application lifetime | Isolated; no behavioral migration |

Global scan also covered load, hash/pop/page/visibility lifecycle events, pointer/touch/mouse,
keyboard and form events, Mutation/Resize/Intersection observers, timers, RAF loops, and
inline/property handlers. Legacy application-lifetime bindings remain outside the migrated
scope; no new anonymous global listener was introduced.

The versioned lifecycle owns only registration, duplicate suppression, scoped removal,
timer clearing, observer disconnection, and payload-free diagnostics. It does not own
routing, board/game state, Worker behavior, FairPlay, engines, providers, or persistence.
