# Season 9.2: Public Disclosure Review and Guided Study Entry

## Public-disclosure principles

Public pages describe learner benefits, current product behavior, and necessary
operating or legal information. They do not need to publish vendor inventories,
internal contracts, storage topology, engineering sequencing, or protected core
repository links. This is a communication boundary, not a claim that obscurity is
a security control.

Required engine and third-party license attribution remains available. Removing
an inaccurate whole-product open-source marketing claim does not alter any
software license or third-party notice.

## Findings and copy decisions

The review covered the homepage, About, roadmap, Academy surfaces, Endgame
Trainer, Endgame Library, Blog, Classic, Polyglot, ECO, Help, Settings,
metadata, structured data, sitemap, public links, runtime assets, and public
deployment behavior.

The former About content named specific chess, hosting, storage, and AI
components; promoted the protected core through an invalid repository link; and
made absolute local-processing, tracking, game visibility, and key-storage
claims that were broader than the complete product behavior. Those statements
were replaced with bounded descriptions of browser-based tools, guided study,
optional connected features, and responsible data handling.

The former roadmap exposed vendors, endpoint and synchronization architecture,
conflict handling, dates, and detailed implementation sequencing. The public
roadmap now communicates completed, current, and planned user outcomes at a
high level. Visible unfinished features may still say that more experiences are
planned, without publishing the engineering blueprint.

No credential, token, private key, or database connection string was found.
Environment-variable names in server-side source were not credentials.
Repository architecture and authoring documents were directly retrievable from
the former deployment even though they were not sitemap-linked. Deployment
exclusions now keep internal documentation and authored Knowledge source files
out of the public artifact while retaining the immutable browser release assets.

Vercel archive-mode uploads do not reliably apply directory patterns from
`.vercelignore`. The public-release builder therefore starts from Git-tracked
files and physically omits protected paths before deployment. Its audit fails if
a protected path survives or a required runtime page or pinned release manifest
is absent. Production uploads should use this generated `.public-release`
directory rather than the live workspace.

Privacy copy is intentionally bounded. This milestone verifies statements
against the current code and public runtime, but it is not a substitute for a
formal legal privacy-policy review.

Protected terminology and detailed contracts—including Knowledge schemas,
release construction, fingerprints, loaders, graph indexes, editorial workflow,
and Coaching, Training Memory, Mastery, and Recommendation internals—belong in
internal documentation rather than public marketing.

## Guided-study eligibility

A released unit is eligible only when it is published, uses the supported
schema, contains at least one structurally valid instructional FEN, includes a
demonstration or guided-practice learning object, provides authored coaching
prompts, and has a learning objective. Ineligible units remain readable and do
not receive a broken action. The UI does not synthesize missing instruction.

## Release boundary and handoff

The browser adapter consumes only pinned release
`rel-a26763c6382b7878595ed8ae0da603c4679bf906e4357fdb406952db5867e2e1`
through the existing immutable browser reader. It does not import authored
modules, drafts, mutable aliases, or filesystem paths.

Eligible Library details link to the existing Endgame Trainer Guided Workspace
with explicit `studyUnit` and `release` query parameters. The workspace validates
both values, loads the released unit, displays its title, objective, released
positions, and deterministic authored prompts, and uses Board API v1 in
non-interactive mode. The return link restores the originating Library detail.
Malformed IDs, release mismatch, missing units, ineligible units, and unavailable
release assets produce a safe explanatory state without fallback content.

## No-write guarantees and deferred work

This entry is an instructional preview. It does not score moves, record
completion, write Training Memory, update Mastery, mutate Recommendations, or
request runtime AI. Refresh is deterministic because identity is encoded in the
URL, not because learner state is persisted.

Move interactivity, completion rules, deterministic Coaching integration,
Training Memory, Mastery, and personalized Recommendations remain deferred.
Any later integration must define explicit eligibility and persistence contracts
without weakening the immutable release boundary.
