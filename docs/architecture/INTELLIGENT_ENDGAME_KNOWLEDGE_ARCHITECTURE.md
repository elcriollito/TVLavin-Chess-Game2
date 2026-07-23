# CAISSA Intelligent Endgame Knowledge Architecture

Status: Season 8.3 architectural blueprint

Scope: future Intelligent Endgame Library

Audience: curriculum architects, chess reviewers, authors, engineers, localization teams, and release reviewers

## 1. Executive decision

CAISSA will model endgame knowledge as a versioned, source-independent graph. The central object is the **Knowledge Unit**: one teachable chess idea with stable identity, explicit educational intent, verification evidence, and relationships to other ideas.

A Knowledge Unit is not a FEN, exercise, lesson, chapter, course, book entry, or UI component. Those objects may reference it, but none owns its meaning. This separation allows one idea to support many positions, activities, languages, learning paths, and historical references without copying or depending on a particular source.

Season 8.3 defines contracts and boundaries only. It adds no positions, lessons, exercises, runtime behavior, dependencies, or product UI.

## 2. Current-system audit and compatibility boundary

The Feature Complete Beta v1.0 has a compact embedded curriculum:

- paths own ordered lesson arrays;
- lessons carry a category, theme, objective, role, prerequisites, completion rule, and candidate policy;
- Coaching consumes a lesson ID, theme, objective, verified geometry, and optional engine truth;
- Training Memory stores lesson ID and theme, then derives mastery and recommendations by theme;
- the progress store owns persistence and migration;
- the Training Workspace owns presentation, not educational truth.

This is correct for the beta, but it does not yet represent knowledge independently of lessons. A future library must not silently redefine existing IDs or schemas.

Compatibility rules:

1. Existing curriculum lesson IDs remain valid product identifiers.
2. Existing theme IDs remain valid aggregation keys until an explicit migration exists.
3. A future adapter may map one lesson to one or more Knowledge Units.
4. Knowledge metadata never writes directly to Board API, Session, Coaching, or Training Memory.
5. Existing Training Memory v1 remains readable; no schema bump is authorized by this document.
6. Existing deterministic Coaching remains authoritative for live classifications.
7. The library supplies declared knowledge and policies; runtime domains continue to own execution.

## 3. Educational object model

### 3.1 Formal definitions

| Object | Purpose | Owns | Does not own | Typical lifecycle |
| --- | --- | --- | --- | --- |
| **Position** | Represent one exact chess state. | Board state, side to move, provenance link, validation facts, immutable position version. | Pedagogy, sequencing, mastery, UI. | draft, validated, approved, retired |
| **Pattern** | Describe recognizable chess geometry or recurring relationship. | Recognition criteria, positive/negative examples, invariant features. | A single FEN or complete teaching plan. | proposed, verified, revised, deprecated |
| **Exercise** | Ask the learner to perform one assessable activity. | Prompt, activity type, accepted-response policy, completion contract, referenced positions/units. | The underlying concept or course order. | draft, tested, approved, published, retired |
| **Knowledge Unit** | Define one coherent teachable idea. | Meaning, objective, conceptual boundaries, relationships, verification state, coach/mistake policy references. | A fixed presentation, a single activity, or a source's wording. | draft through deprecated |
| **Lesson** | Orchestrate learning activities for one session-sized objective. | Activity sequence, presentation intent, session completion, referenced Knowledge Units. | Canonical chess truth or unit identity. | draft, reviewed, published, revised, retired |
| **Chapter** | Group lessons into a navigable pedagogical segment. | Local ordering, chapter outcomes, entry/exit expectations. | Global prerequisite truth. | draft, published, revised, archived |
| **Course** | Offer a goal-oriented learning route for an audience. | Route-level outcomes, enrollment context, chapter selection, course policy. | Exclusive ownership of units or themes. | planned, active, revised, archived |
| **Library** | Index and expose approved educational knowledge. | Discovery, version resolution, taxonomy and graph indexes, publication manifest. | Authoring drafts, runtime session state, learner records. | versioned releases |
| **Theme** | Provide a stable broad classification and mastery aggregation key. | Canonical ID, name, scope note, taxonomy placement. | Detailed instruction or sequencing. | proposed, active, merged, deprecated |
| **Subtheme** | Refine a Theme for discovery and analysis. | Canonical ID, parent link, narrower scope. | A lesson or knowledge unit. | proposed, active, moved, deprecated |

### 3.2 Ownership invariants

- Meaning is owned by the Knowledge Unit.
- Exact board state is owned by the Position.
- Recognition logic is owned by the Pattern.
- Assessment behavior is owned by the Exercise.
- Session orchestration is owned by the Lesson.
- Navigation order is owned by Chapter/Course manifests.
- Classification is owned by the taxonomy registry.
- Publication eligibility is owned by verification and release manifests.
- Learner history is owned by Training Memory, never by library content.

No child object embeds an editable copy of its parent's truth. References use stable IDs and version ranges or exact approved versions.

### 3.3 Cardinality

```text
Theme 1 ---- * Subtheme
  |               |
  +------ * Knowledge Unit * ------ * Knowledge Unit
                    |
                    +---- * Pattern
                    +---- * Position
                    +---- * Exercise
                    +---- * Lesson

Lesson * ---- * Chapter * ---- * Course
Library release ---- approved versions of all publishable objects
```

One position may demonstrate several units; one unit may use many positions. One exercise may assess several units but must declare one primary assessment target. Courses reuse units and lessons rather than cloning them.

## 4. Knowledge Unit contract

### 4.1 Required conceptual fields

| Field | Type | Requirement |
| --- | --- | --- |
| `id` | stable slug | Globally unique and never recycled. |
| `schemaVersion` | semantic version | Version of the Knowledge Unit document contract. |
| `contentVersion` | semantic version | Revision of this unit's educational meaning/content. |
| `status` | lifecycle enum | `draft`, `verification`, `review`, `approved`, `published`, `deprecated`. |
| `titleKey` | localization key | Public title is resolved outside the core record. |
| `summaryKey` | localization key | Source-independent original summary. |
| `coreIdea` | structured concept | Concise statement of what is true and teachable. |
| `instructionalObjective` | structured objective | Observable learner capability, not UI copy. |
| `themeIds` | ID array | At least one active Theme; first is primary. |
| `subthemeIds` | ID array | Optional narrower classifications. |
| `difficulty` | enum | Calibrated band plus rationale reference. |
| `prerequisiteEdges` | edge references | Required/recommended prior knowledge. |
| `relatedUnitEdges` | edge references | Typed non-hierarchical graph links. |
| `patternRefs` | references | Recognition patterns supporting the idea. |
| `positionRefs` | references | Approved or candidate evidence/examples. |
| `coachPolicyRef` | reference | Deterministic coaching policy compatibility. |
| `mistakeConceptRefs` | references | Conceptual misconceptions, not copied prose. |
| `followUpEdges` | edge references | Recommended continuation options. |
| `verification` | structured record | Chess, educational, provenance, and copyright gates. |
| `inspirationRefs` | references | Optional historical/source records. |
| `requiredCapabilities` | enum array | Engine, curated line, human review, exact WDL, etc. |
| `tags` | controlled IDs | Search facets; never free-form truth. |
| `createdAt`, `updatedAt` | timestamps | Editorial audit metadata. |

### 4.2 Optional extensions

- `requiredSkills`: skill IDs such as calculation or geometric recognition.
- `trainingObjectives`: reusable assessment intent IDs.
- `coachTemplateRefs`: localization-safe deterministic template references.
- `educationalNotes`: private author/reviewer notes with visibility classification.
- `audience`: rating/experience bands, never a replacement for difficulty.
- `localeReadiness`: availability and review state by locale.
- `deprecation`: replacement IDs, reason, and effective release.

### 4.3 Conceptual example

This invented metadata example demonstrates shape only and defines no lesson, exercise, or chess position:

```json
{
  "id": "ku:example-concept",
  "schemaVersion": "1.0.0",
  "contentVersion": "1.0.0",
  "status": "draft",
  "titleKey": "knowledge.example-concept.title",
  "summaryKey": "knowledge.example-concept.summary",
  "coreIdea": {
    "statementKey": "knowledge.example-concept.core",
    "scope": "bounded",
    "exceptionsRequired": true
  },
  "instructionalObjective": {
    "capability": "recognize",
    "target": "pattern:example-geometry"
  },
  "themeIds": ["theme:example"],
  "subthemeIds": ["subtheme:example:geometry"],
  "difficulty": {
    "band": "foundation",
    "rationaleRef": "review:difficulty:example-concept:v1"
  },
  "prerequisiteEdges": [],
  "relatedUnitEdges": [],
  "patternRefs": ["pattern:example-geometry@1"],
  "positionRefs": [],
  "coachPolicyRef": "coach-policy:general-safe@1",
  "mistakeConceptRefs": [],
  "followUpEdges": [],
  "requiredCapabilities": ["human-reviewed-required"],
  "tags": ["tag:recognition"],
  "verification": {
    "state": "unverified",
    "chessReview": null,
    "educationReview": null,
    "provenanceReview": null,
    "copyrightReview": null
  }
}
```

The namespace prefix makes cross-object references unambiguous. Human-facing text is localized by keys and is not a mutable identity.

## 5. Relationship graph

### 5.1 Edge types

| Edge | Semantics | Direction | Cycle policy |
| --- | --- | --- | --- |
| `requires` | Target must be sufficiently understood first. | directed | acyclic |
| `recommended-before` | Target usually improves readiness. | directed | acyclic per release |
| `next-option` | Target is one valid continuation. | directed | cycles allowed |
| `review-with` | Target reinforces retention. | bidirectional logical pair | allowed |
| `advanced-continuation` | Target deepens or qualifies source. | directed | acyclic |
| `related-concept` | Meaningful conceptual association. | bidirectional logical pair | allowed |
| `alternative-treatment` | Different pedagogy for comparable objective. | bidirectional logical pair | allowed |
| `common-confusion` | Learners frequently conflate the units. | bidirectional logical pair | allowed |
| `contrasts-with` | Comparison clarifies a boundary. | bidirectional logical pair | allowed |
| `supersedes` | New unit replaces an obsolete unit. | directed | acyclic |

Every edge has `from`, `to`, `type`, `strength`, `reasonKey`, `status`, `reviewRef`, and optional audience constraints. An edge is first-class versioned metadata, not a nested title string.

### 5.2 Graph validation

Publication validation must reject:

- unknown or deprecated targets without an explicit compatibility rule;
- self-edges;
- cycles in hard prerequisites or supersession;
- missing reverse declarations for symmetric relationships;
- a published unit depending on a draft unit;
- edges without review provenance;
- inaccessible prerequisite islands with no valid entry unit.

### 5.3 Multiple-path principle

Courses query the graph and select a route; they do not define the only route. A learner may reach the same unit through material family, theme, weakness remediation, recall review, or an advanced continuation. `next-option` is plural and ranked only in a course/recommendation context.

## 6. Taxonomy architecture

### 6.1 Faceted hierarchy

A single tree cannot represent endgame knowledge accurately. CAISSA uses one primary browse hierarchy plus orthogonal controlled facets.

Primary browse hierarchy:

```text
Endgames
|
+-- Pawn Endgames
|   +-- material-oriented families
|       +-- conceptual subfamilies
|
+-- Rook Endgames
+-- Minor-Piece Endgames
+-- Queen Endgames
+-- Mixed-Material Endgames
+-- Practical Conversion and Defense
```

The terminal browse nodes contain Knowledge Units, not exercises. Exact family names are future content decisions.

Orthogonal facets:

- material family;
- role: attack, defense, mixed;
- theoretical outcome scope;
- concept/theme/subtheme;
- difficulty;
- practical frequency;
- activity suitability: Learn, Solve, Recall;
- verification capability;
- provenance category;
- side-to-move relevance;
- board geometry/pattern;
- learner skill;
- publication and locale readiness.

### 6.2 Taxonomy record

Each taxonomy node has a stable ID, parent ID, label key, definition key, scope/exclusion notes, aliases for search, status, sort hint, and version. Moving a node does not change its ID. Aliases never become alternate canonical IDs.

### 6.3 Governance

- New tags require registry review.
- Free-form tags may exist only in private drafts and cannot publish.
- Themes are stable mastery aggregation keys.
- Subthemes may evolve more frequently but require merge/replacement metadata.
- Material is a facet, not the definition of a concept.
- Named historical techniques use a provenance-aware naming review.

## 7. Historical inspiration and provenance

### 7.1 Separation of concerns

```text
Educational concept  <--independent meaning--  Knowledge Unit
Historical/source record <--citation only-- Inspiration reference
Exact implementation <--own version-- Position/Pattern/Exercise
Presentation wording <--own copyright review-- Localization content
```

A source can inspire research without owning the Knowledge Unit. No source record is required at runtime to interpret the educational concept.

### 7.2 Source record

Source records may represent:

- historical game;
- classical study or composition;
- book or article;
- named theoretical position;
- CAISSA original composition;
- verified engine discovery;
- future AI-assisted candidate.

Minimum metadata:

- stable source ID and source type;
- bibliographic or historical citation;
- creator/author where known;
- publication/event date where known;
- access and rights notes;
- what was consulted;
- provenance confidence;
- copyright review state;
- factual verification references;
- explicit prohibition on storing copied explanatory text.

Unknown facts remain `unknown`; they are not inferred. “Public domain” is never automatic. Game facts, authored analysis, editorial selection, prose, and CAISSA reconstruction are reviewed separately.

### 7.3 Copyright-safe authoring rule

Authors may identify universal ideas, verify their theoretical or historical basis, reconstruct independently, validate, and write original CAISSA explanations. They may not reproduce source order, prose, annotations, diagram collections, or curated collections. A publishable unit needs a copyright review record even when it has no inspiration reference.

## 8. Verification architecture

Verification is multidimensional:

| Dimension | Examples of evidence | Required owner |
| --- | --- | --- |
| Chess legality | rules validation, legal state | automated validator |
| Theoretical truth | human review, curated line, exact WDL when available | chess reviewer |
| Engine truth | engine build/options/depth and reproducible output | engine validation |
| Educational truth | bounded claim, objective, misconception review | curriculum reviewer |
| Provenance | source identity and reconstruction notes | research reviewer |
| Copyright | original wording and permitted use | copyright reviewer |
| Runtime compatibility | capability contract and deterministic fixtures | engineering QA |

Verification states are `unverified`, `in-progress`, `changes-requested`, `verified`, `expired`, and `revoked`. Publication requires every mandatory dimension to be `verified`; absence is not approval.

Verification records are immutable evidence events with reviewer identity/role, timestamp, reviewed object version, method, result, limitations, and artifact hashes. A content change invalidates only affected dimensions according to a declared impact matrix.

## 9. Coaching integration

### 9.1 Boundary

The Knowledge Unit declares:

- the intended concept;
- safe coach policy/template references;
- supported classifications;
- misconception IDs;
- hint intent and disclosure ceiling;
- conditions under which a concept-specific claim is allowed.

Deterministic Coaching continues to own:

- normalization of live context;
- move classification;
- geometric/theoretical evidence checks;
- progressive hint level;
- final feedback;
- safe fallback language.

The library never returns an unverified live classification.

### 9.2 Conceptual flow

```text
Knowledge Unit ---- coach policy / mistake concepts ----+
                                                        |
Position + Session + verified analysis -----------------+--> Coaching
                                                              |
                                                              +--> structured feedback
                                                              +--> hint
                                                              +--> Training Memory event
```

If runtime evidence does not satisfy a Knowledge Unit's claim guard, Coaching uses general safe language. Metadata cannot override that safeguard.

### 9.3 Adapter contract

A future read-only adapter may expose:

- `getKnowledgeContext(unitIds, locale)`;
- `getCoachPolicy(policyId, version)`;
- `getMisconception(conceptId, locale)`;
- `getHintIntent(unitId, stage)`.

Results are immutable, versioned, and contain no session or learner state.

## 10. Training Memory and mastery integration

Training Memory records outcomes; the library describes what those outcomes relate to. A future event may add `knowledgeUnitIds` and taxonomy snapshots through a versioned migration, but Season 8.3 does not change v1.

Principles:

- session events retain the exact unit versions used;
- mastery aggregates by stable concept IDs, not localized titles;
- taxonomy changes do not rewrite historical events;
- merged/deprecated concepts use projection maps at query time;
- Knowledge Units never contain learner mastery;
- library publication cannot mutate existing Training Memory;
- progress portability must not require source documents.

## 11. Recommendation integration

### 11.1 Read interfaces

A future Recommendation Engine should query an immutable library snapshot:

```text
findCandidates({
  masteredUnitIds,
  attemptedUnitIds,
  weakThemeIds,
  failedUnitIds,
  dueReviewUnitIds,
  capabilityProfile,
  locale,
  limit
}) -> candidate descriptors

explainCandidate({
  candidateUnitId,
  learnerSignals,
  libraryRelease
}) -> reason codes
```

The library filters eligibility and describes relationships. Recommendation owns ranking and deterministic tie-breaking.

### 11.2 Eligibility filters

Candidates may be filtered by:

- published and locale-ready status;
- prerequisite satisfaction;
- runtime capability availability;
- verification freshness;
- audience/difficulty suitability;
- unresolved common confusion;
- review due state;
- course constraints;
- deprecated/replaced state.

### 11.3 Reason codes

Stable reason codes include:

- `weakest-theme`;
- `missing-prerequisite`;
- `recently-failed`;
- `review-due`;
- `reinforce-common-confusion`;
- `continue-after-mastery`;
- `course-next-option`;
- `first-entry-unit`.

Explanatory copy is localized outside the ranking algorithm. The system must be able to state why a recommendation was eligible and why it won.

## 12. Scalability

### 12.1 Scale stages

| Scale | Storage/index approach | Required safeguards |
| --- | --- | --- |
| 100 units | Reviewable source documents and generated manifest. | Full validation in one pass. |
| 500 units | Partition by namespace/family; generated graph and taxonomy indexes. | Incremental validation and ownership metadata. |
| 2,000 units | Sharded publication artifacts; precomputed reverse edges/search facets. | Changed-object validation, deterministic builds. |
| 10,000+ units | Content-addressed immutable artifacts, release manifests, lazy shard loading. | Dependency graph builds, cacheable indexes, audit and rollback tooling. |

### 12.2 Non-negotiable scale properties

- IDs never depend on array order or filenames.
- Relationships use IDs, never deep object copies.
- Authoring form is separate from generated runtime artifacts.
- Runtime reads a pinned library release, not a mutable working tree.
- Reverse indexes are generated, never hand-maintained.
- Search text is an index, not canonical truth.
- Validation can run per changed object plus transitive dependants.
- Publication is deterministic and reproducible.
- Large source notes and evidence are excluded from browser runtime bundles.

### 12.3 Performance envelope

The runtime manifest should include only fields needed for discovery and launch. Detailed copy, evidence, and position payloads load by shard. A release records counts, hashes, supported schema versions, locales, and shard locations. No browser should parse all 10,000 full units to show one recommendation.

## 13. Recommended repository organization

This is a future structure, not created by Season 8.3:

```text
knowledge/
|-- README.md
|-- schemas/
|   |-- knowledge-unit.schema.json
|   |-- relationship.schema.json
|   |-- taxonomy-node.schema.json
|   `-- verification.schema.json
|-- registry/
|   |-- themes/
|   |-- subthemes/
|   |-- tags/
|   `-- capabilities/
|-- units/
|   `-- <namespace>/<unit-id>/
|       |-- unit.json
|       |-- relationships.json
|       `-- locale/
|-- patterns/
|-- positions/
|-- activities/
|   |-- exercises/
|   `-- lessons/
|-- pathways/
|   |-- chapters/
|   `-- courses/
|-- sources/
|-- verification/
|-- releases/
|-- generated/
|   |-- manifests/
|   |-- indexes/
|   `-- shards/
`-- tooling/
```

Authoring sources and generated artifacts must be distinguishable. `generated/` is never edited by hand. Private copyrighted research notes must not be committed merely because a public source record exists.

## 14. Versioning strategy

### 14.1 Independent versions

- **Schema version:** contract shape; SemVer.
- **Content version:** educational meaning of an object; SemVer.
- **Verification version:** immutable evidence revision, tied to exact content hash.
- **Taxonomy version:** registry release.
- **Localization version:** per locale and content version.
- **Library release:** immutable aggregate identifier and manifest hash.

### 14.2 Change rules

| Change | Content version | Verification impact |
| --- | --- | --- |
| Typographic/localization correction | patch/localization only | copyright/editorial dimension |
| Clarified wording without meaning change | patch | educational and copyright review |
| Added relationship or tag | minor | graph/taxonomy review |
| Expanded conceptual scope or changed objective | major | all relevant dimensions |
| Position/FEN change | position version | legality, theory, education, provenance |
| Coach policy change | policy version | coaching/runtime and education |
| Deprecated unit | patch plus deprecation record | replacement review |

Published versions are immutable. Revisions create a new version; they do not overwrite evidence. Consumers declare supported schema ranges and pin a library release.

### 14.3 Translation

Translations reference an exact object content version and locale. They have independent review and fallback status. IDs, chess facts, tags, and relationships are locale-neutral; titles, summaries, prompts, explanations, and reason text are localized.

## 15. Authoring and publication workflow

```text
Concept proposal
      |
      v
Draft Knowledge Unit
      |
      v
Automated validation -----> changes requested
      |
      v
Chess / educational / provenance / copyright verification
      |
      v
Peer review -----------> changes requested
      |
      v
Approved version
      |
      v
Release assembly and compatibility validation
      |
      v
Published library release
      |
      +----> revised (new version)
      `----> deprecated (replacement or archive)
```

### 15.1 Roles

- proposer identifies a candidate concept;
- author creates original structured content;
- chess reviewer validates theoretical scope;
- curriculum reviewer validates teachability and difficulty;
- provenance reviewer validates inspiration records;
- copyright reviewer checks originality and permitted use;
- engineering QA validates schemas/capabilities;
- release owner assembles the immutable publication manifest.

One person may hold multiple roles only when governance explicitly permits it; the record must disclose that fact.

### 15.2 Gate criteria

Approval requires:

- stable identity and non-overlapping scope;
- valid taxonomy placement;
- resolved hard prerequisites;
- original wording;
- bounded theoretical claims;
- declared runtime capabilities;
- complete mandatory verification;
- no draft dependencies;
- deterministic validation;
- compatibility with the target library release.

Deprecation never deletes history. It declares reason, replacement, migration advice, and the last release containing the unit.

## 16. System diagrams

### 16.1 Knowledge graph

```text
                       +-------------------+
                       | Theme / Subtheme  |
                       +---------+---------+
                                 |
                                 v
+-----------+   supports   +-----+----------+   requires/relates   +----------------+
| Patterns  +------------->| Knowledge Unit |<-------------------->| Knowledge Unit |
+-----------+              +--+----+----+---+                      +----------------+
                              |    |    |
                    references|    |    |assessed by
                              v    |    v
                         Positions | Exercises
                                   |
                                   v
                           Lessons / Pathways
```

### 16.2 Educational hierarchy

```text
Library
|-- Taxonomy and graph
|-- Knowledge Units
|   |-- Patterns
|   `-- Position references
`-- Pathways
    `-- Course
        `-- Chapter
            `-- Lesson
                `-- Exercises referencing Knowledge Units
```

### 16.3 Learning flow

```text
Discover unit
    -> verify prerequisites
    -> choose Learn / Solve / Recall activity
    -> run session
    -> deterministic Coaching
    -> record Training Memory
    -> update derived mastery
    -> recommend review or continuation
```

### 16.4 Recommendation flow

```text
Training Memory signals ----+
Mastery / review due -------+--> Recommendation Engine
Course context -------------+          |
Library eligibility graph --+          v
                                  one explained candidate
                                           |
                                           v
                                  existing Training Workspace
```

### 16.5 Coach integration

```text
Unit coach policy + verified position facts + session analysis
                              |
                              v
                    Deterministic Coaching
                    /         |          \
             classification  hint     safe fallback
                    \         |          /
                              v
                       presentation + memory event
```

### 16.6 Repository and release flow

```text
Authoring sources --> schema/graph verification --> approved objects
                                                    |
                                                    v
                                           release manifest
                                          /        |       \
                                  taxonomy index  graph index  content shards
                                          \        |       /
                                                    v
                                           read-only library API
```

## 17. Architectural decisions

1. Knowledge Unit is the central semantic object.
2. The library is a graph with faceted taxonomy, not a single linear course.
3. Positions, patterns, exercises, and lessons are independent reusable objects.
4. Historical inspiration is cited separately from educational meaning and implementation.
5. Verification is multidimensional, immutable, and version-bound.
6. Runtime domains retain authority over board, session, coaching, memory, and recommendation ranking.
7. Existing beta IDs and Training Memory v1 remain untouched.
8. Authoring documents are compiled into immutable release artifacts.
9. IDs and relationships scale without dependence on filenames or source order.
10. Season 9.0 must begin with schemas, registries, validators, and adapters before content volume.

## 18. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Treating a position as knowledge | Enforce separate object schemas and references. |
| Taxonomy explosion | Govern registries and prefer controlled facets. |
| Rigid prerequisite tree | First-class typed graph with multiple next options. |
| Copyright contamination | Separate source records, original writing, mandatory review. |
| Unsupported theoretical certainty | Capability declarations and bounded verification. |
| Runtime/library coupling | Read-only adapters and immutable release snapshots. |
| Breaking Training Memory | Add future IDs only through explicit schema migration. |
| Stale verification | Version-bound evidence and expiry/revocation states. |
| Localized titles used as identity | Stable locale-neutral IDs and localization keys. |
| Loading an entire large library | Manifests, indexes, shards, and lazy retrieval. |
| Duplicate concepts | Scope definitions, graph search, and reviewer gate. |
| Recommendation opacity | Stable eligibility/reason codes and deterministic ranking owner. |

## 19. Season 9.0 readiness boundary

The architecture is ready for implementation planning when reviewers approve:

- object and edge schemas;
- ID namespace rules;
- taxonomy governance;
- verification impact matrix;
- read-only library query boundary;
- compatibility adapter for current lesson/theme IDs;
- deterministic build and validation strategy.

Season 9.0 should not begin by bulk-authoring content. Its first increment should prove the contracts with synthetic fixtures, schema tests, graph validation, release assembly, and a read-only adapter. Real Knowledge Units require a separately approved content and provenance workflow.

## 20. Explicit non-implementation confirmation

Season 8.3:

- creates no positions, patterns, exercises, lessons, chapters, or courses;
- copies no books and imports no PGNs;
- changes no Endgame Trainer runtime or UI;
- changes no Board API, Coaching, Training Memory, mastery, generator, or recommendation algorithm;
- adds no dependency, persistence schema, backend, or deployment behavior;
- defines documentation architecture only.
