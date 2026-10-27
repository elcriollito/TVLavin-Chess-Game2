# Release Dependency Map

Status: IMPLEMENTED as coordination evidence.

Each lane is independently approvable. Do not merge the coordination branch as a substitute for merging an implementation branch.

| Lane | Base | Candidate | Dependencies | Production prerequisite |
| --- | --- | --- | --- | --- |
| AUTH-004 | `6e912be5...` | `439fe763...` | Legal copy approval; age choice; Google/Clerk approvals are separate | protected preview; auth/browser/Mobile Safari callback tests; owner approval |
| Scanner privacy | `6e912be5...` | `846899ea...` | Migration follows existing Scanner feedback schema | disposable/protected staging migration, storage reconciliation, rollback runbook, owner approval |
| Security | `6e912be5...` | `d72cf4dd...` | No dependency on Premium; Premium intentionally remains inactive | Worker staging/smoke tests and owner approval |
| Data rights | `6e912be5...` | `698a5019...` | Policy/retention and processor evidence | synthetic staging fixtures and destructive-action approval before any executor |
| IP | `6e912be5...` | `d61cd0dc...` | Owner license/js-dos/source decisions | notice/source review before affected distribution changes |
| Coordination | `6e912be5...` | The commit containing this package; verify with `git rev-parse HEAD` after checkout | Reads evidence from all lanes | documentation only |

## Ordering

1. AUTH legal publication may be approved without Google OAuth activation or age-policy activation.
2. Scanner application changes and its migration should be reviewed together but deployed through separate controlled steps; migration first only after rehearsal, then application, then smoke tests.
3. Security can release independently. If Downloads Worker cannot be updated safely, disable the affected download route rather than restore caller-controlled Premium.
4. Data-rights planner and IP evidence are non-production tooling/docs and do not authorize destructive or licensing actions.

## Protected preview policy

Only create a preview where it exercises the lane without production writes. Database migrations, Cloudflare Workers and offline governance tools require isolated infrastructure or test evidence instead of a Vercel UI preview.

- AUTH protected preview: `https://caissa-chess-mnqjnkiwe-elcriollitos-projects.vercel.app` (`dpl_DBwXxmN74TZrA5pNBP7tR25dVmJk`).
- Scanner protected preview: `https://caissa-chess-9js4qzkup-elcriollitos-projects.vercel.app` (`dpl_B745mdNCYrLefhn5oq2XaW4QhBDa`).
- Security app-build preview: `https://caissa-chess-ssde5pvri-elcriollitos-projects.vercel.app` (`dpl_FZCgsXYJHzZRLbq5NeczJG32286Z`). The affected Downloads Worker still requires isolated Cloudflare Worker staging; the Vercel preview does not deploy it.
- Data-rights branch auto-preview: `https://caissa-chess-nmolwaxzi-elcriollitos-projects.vercel.app` (`dpl_28jKkgd9zLHdyuBYAuvRPiWpfKvo`). Build provenance is verified, but the tool is offline/dry-run and has no useful browser surface.
- IP branch auto-preview: `https://caissa-chess-kwft78tbg-elcriollitos-projects.vercel.app` (`dpl_D1qRyktsNdc7pqKRmmUzZ6S1cvtL`). Build provenance is verified; the material change is repository evidence, not a production UI.
