# CAISSA Mentor — My account as Insight raw-game intake

Continues 2901072ae03e7296ad22fadb5d4685d6a9d48b0f. Implements Alexander's reference image image(20261001-031036).png.

My account contains only CAISSA Insight's import form: online source (Chess.com/Lichess), username, latest 10/20/30/50 games, and time-control filter (All/Bullet/Blitz/Rapid/Classical). Default is ten games, matching the requested initial Mentor sample. The alternative Local PGN source has a file picker and bounded paste field. CAISSA native is listed as a disabled future platform option.

Removed the previous two-username save form and separate future native-history card. Switching input sources preserves drafts. No local username persistence remains in the page. Analysis results, training ideas and conversation belong in Chat, with its fixed composer hidden in My account. The existing Insight modal and app.js elsewhere are unchanged and are not booted in Mentor, avoiding duplicate game/engine/UI owners.

Scope is input UI only: import buttons are disabled and the single status explains that game import is not connected. Selecting a file or entering raw data does not read/analyze games, start engines, call AI, trigger the lightbulb or claim personal insight. Next integration must reuse/extract the real import and analysis pipeline with owner-scoped results, supported platform time-control mapping, bounded PGN validation and authenticated insight persistence. No credentials are requested.

Verification: 37/37 targeted tests PASS; syntax and git diff --check PASS. The source-selector behavior test checks retained raw inputs and no network/insight side effects. Browser visual/mobile QA and real import integration remain pending. Quiet Drag and shared board code are unchanged. No deploy or production change.
