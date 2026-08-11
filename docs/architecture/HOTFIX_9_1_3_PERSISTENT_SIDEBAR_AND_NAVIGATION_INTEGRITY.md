# Hotfix 9.1.3: Persistent Sidebar and Navigation Integrity

Baseline: `07796a9b2e81c59b677c5f81959a3cfba760f097`.

## Root causes

The baseline had four effective primary navigation definitions: hard-coded application markup in `index.html`, its generated `yahoo-classic.html` derivative, a Trainer-specific list, and the standalone renderer's private list. Endgame Library and About used isolated horizontal headers instead. The lists differed, so entries disappeared when users crossed page boundaries.

Help and Settings links on route-based pages used nonexistent `section` values. Help was implemented only as a main-application modal action. Settings had no section or navigation handler, although the existing game menu contains the released settings controls.

## Architecture

`js/caissa-primary-navigation.js` is the immutable ordered inventory and shared renderer input. It supports application sections, internal routes, external links, and actions. The application shell, generated Classic shell, Trainer, and standalone renderer consume it. Existing hard-coded application markup remains only as a non-JavaScript fallback and is replaced before navigation initialization; it is no longer authoritative.

The deterministic public-route companion is [`CaissaPublicRouteInventory@1.0.0`](./CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md). Any task that changes a public destination or its routing status must regenerate and validate that inventory before checkpoint.

Endgame Library and About now use the existing standalone CAISSA shell. Library retains its filters, detail routing, pinned release consumer, instructional board, and read-only behavior.

URL/path state remains authoritative for active items. Application sections use `?section=...`; standalone routes declare their active inventory key. Help and Settings use `?action=...`, opening the existing Help and game-menu/settings modals.

## Classic routing

The recent `/yahoo-classic` rewrite, legacy-query middleware redirect, SEO landing content, and responsive header styles are unchanged. Explicit valid `section` queries already outrank stored/default state. The reported Analyze cold-load fallback did not reproduce locally, so no router rewrite was made and Hotfix 9.1.4 is not currently required for that symptom.

## Legacy exceptions

The application and generated Classic documents retain their old static item markup as a no-script fallback. Runtime behavior is canonical because the shared inventory replaces those hosts before `CaissaNavigation` caches or binds them. Trainer retains its specialized visual shell and mobile drawer but consumes the same inventory.
