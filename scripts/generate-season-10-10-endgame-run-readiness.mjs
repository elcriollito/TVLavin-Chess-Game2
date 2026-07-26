import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './endgame-remote-tablebase.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'endgame-pools/private/endgame-run-readiness');
const jsonPath = resolve(directory, 'endgame-run-public-readiness-1.0.0.json');
const markdownPath = resolve(directory, 'endgame-run-public-readiness-1.0.0.md');
export const ALLOWED_DECISIONS = Object.freeze([
  'approve-public-beta', 'approve-limited-preview', 'requires-more-content',
  'requires-accessibility-review', 'requires-privacy-observability-work',
  'approve-with-readiness-corrections', 'defer-public-release',
  'reject-public-release', 'requires-new-run-design'
]);
export const HUMAN_FIELDS = Object.freeze([
  'reviewDecision','reviewRationale','reviewerReference','reviewRevision',
  'approvedPublicName','approvedReleaseTier','approvedMinimumItemCount','approvedObjectiveDiversity',
  'approvedSessionLength','approvedSelectionPolicy','approvedEntryPoint','approvedBetaLabel',
  'approvedResultPolicy','approvedHintPolicy','approvedSkipPolicy','approvedRetryPolicy',
  'approvedAbandonmentPolicy','approvedAccessibilityGate','approvedPrivacyPolicy',
  'approvedObservabilityPolicy','approvedConsentModel','approvedKillSwitch','approvedRollbackPolicy',
  'approvedSigningRequirement','approvedBrowserPolicy','approvedLocalizationScope','approvedSupportScope',
  'reviewedRunArtifactDigest','reviewedReadinessPacketDigest'
]);
const domain = (name, status, evidence, gap, severity, blocking, action, owner, approval) =>
  ({ name, status, evidence, gap, severity, classification: blocking ? 'blocking' : 'nonblocking',
    recommendedAction: action, ownerCategory: owner, approvalRequired: approval });

export function buildReadinessPacket() {
  const readinessDomains = [
    domain('product-clarity','partial','The hidden run has truthful local-session copy and fixed progression.','Public purpose, audience, naming, entry point, and beta promise are unapproved.','high',true,'Approve a bounded product brief.','product','product-owner'),
    domain('content-sufficiency','not-ready','Exactly two human-approved items cover one offensive and one defensive objective.','Below the proposed five-item, three-objective threshold; repetition is immediate.','critical',true,'Author and human-review at least three additional distinct items.','chess-content','product-and-chess-review'),
    domain('session-length','partial','A fixed two-item session is deterministic and compact.','No public session-length policy or completion research exists.','medium',true,'Approve fixed five-item preview policy before public exposure.','product','product-owner'),
    domain('objective-diversity','not-ready','Promote and stop-promotion demonstrate two objective contracts.','No third contract, second offensive item, second defensive item, or distinct conversion item.','high',true,'Meet the proposed diversity floor.','chess-content','chess-review'),
    domain('educational-value','partial','Each current item has reviewed hints, truthful feedback, and a bounded instructional objective.','The pair is too small to establish a coherent public learning progression.','high',true,'Review a five-item instructional sequence.','education','educational-review'),
    domain('hint-policy','technical-ready','Three stages exist and final reveal removes independent eligibility.','Public wording and reveal-confirmation policy are unapproved.','medium',false,'Keep staged hints secondary and approve disclosure copy.','product-accessibility','product-owner'),
    domain('result-semantics','technical-ready','Independent, assisted, objective failure, drawing miss, technical unavailable, and abandonment are distinct.','Internal names require user-facing terminology approval.','medium',false,'Approve plain-language public labels.','product-education','product-owner'),
    domain('retry-and-abandonment','technical-ready','Retry Item, Retry Run, Exit, and stale ownership are tested.','No approved exit-confirmation or pause policy.','medium',false,'Keep ephemeral retry; approve confirmation rules.','product','product-owner'),
    domain('accessibility','not-reviewed','Automated Axe, keyboard paths, responsive layouts, and focus transitions pass.','Required human screen-reader, high-contrast, zoom, touch, and device review is unset.','critical',true,'Complete the human accessibility plan and resolve failures.','accessibility','accessibility-lead'),
    domain('responsive-behavior','automated-pass','Automated 320–1920 px matrix passes in three browser engines.','Physical mobile devices, landscape, safe-area, browser chrome, and orientation changes are unreviewed.','high',true,'Complete physical-device review for preview targets.','accessibility-qa','accessibility-lead'),
    domain('privacy','partial','The run controller stores no cookies, localStorage, sessionStorage, account IDs, or results; it fetches three static artifacts.','Hosting request logs, third-party IP processing, retention, and site-level external-script behavior are not established by run code.','high',true,'Complete infrastructure/privacy-owner audit and update notice if needed.','privacy-legal','privacy-owner'),
    domain('observability','absent','No run telemetry, analytics events, or reporting service exists.','No operational failure-rate signal or approved event/retention policy.','medium',true,'Choose no telemetry or minimal privacy-preserving operational events with legal review.','operations-privacy','product-and-privacy'),
    domain('security','technical-pass','Exact gates, item allowlists, artifact hashes, stale guards, textContent rendering, and private-path exclusions are tested.','Public threat-model sign-off and cache/config review remain pending; no high issue is currently evidenced.','medium',true,'Perform release threat-model review.','security','security-owner'),
    domain('artifact-integrity','pass','Run and item artifacts have locked fingerprints and SHA-256 verification.','Artifacts remain unsigned.','medium',false,'Allow unsigned invite-only preview only if approved; require signing decision for beta.','release-security','release-owner'),
    domain('operational-rollback','partial','Removing the hidden flag or reverting the deployment returns normal V2 without migration.','No public runbook, alert threshold, owner roster, or communication template.','high',true,'Approve and rehearse rollback runbook.','release-operations','release-owner'),
    domain('kill-switch','not-implemented','Current hidden gate fails closed and can be removed by deployment.','No authenticated rapid server-side disable without redeploy.','high',true,'Add an authenticated edge/environment kill switch with normal V2 fallback before preview.','operations-security','release-and-security'),
    domain('performance','technical-pass','Artifacts total 14,530 bytes; one board and zero Workers are used.','No formal budgets, physical-device measurements, retry-run memory profile, or cache policy sign-off.','medium',false,'Measure against proposed budgets on target devices.','performance-qa','engineering-lead'),
    domain('browser-compatibility','automated-pass','Chromium, Firefox, and WebKit complete the run locally and in production.','No physical Edge, Android Chrome, or iOS Safari review; minimum versions unapproved.','high',true,'Approve browser policy and test physical mobile targets.','qa','product-and-qa'),
    domain('public-navigation-readiness','intentionally-hidden','No navigation or normal Modes exposure exists.','Entry point and information architecture are unapproved.','high',true,'Keep hidden until tier and entry point receive approval.','product-ia','product-owner'),
    domain('support-and-documentation','not-ready','Private architecture and technical QA exist.','No public help, FAQ, limitations, privacy explanation, or support escalation path.','high',true,'Prepare and approve public support copy before preview.','support-content','product-and-support'),
    domain('legal-and-provenance-boundary','partial','Reviewed artifacts publish safe contracts while reviewer/evidence materials remain private.','No legal review of preview terms, telemetry choice, accessibility claims, or support promises.','high',true,'Obtain legal/privacy review without making guarantees.','legal-privacy','legal-review'),
    domain('localization-readiness','not-ready','Current English copy is concise.','Runtime strings, counts, results, hints, errors, and announcements are hardcoded.','medium',false,'Permit English-only invite preview; require extraction and pluralization before broader beta.','localization-engineering','product-owner'),
    domain('public-naming','unapproved','Internal name Endgame Run is compact.','Potential confusion with Quick Challenge and competitive connotations has not been human-reviewed.','medium',true,'Approve Endgame Practice as public candidate and retain technical internal ID.','product-marketing','product-owner'),
    domain('beta-labeling','unapproved','Current shell says local technical session.','No approved expectation, limitations, or support copy.','high',true,'Use Limited Preview only after approval; reserve Beta for full gates.','product-legal','product-owner'),
    domain('production-support-burden','not-ready','Rollback is technically simple because sessions are ephemeral.','No ownership, incident severity, response targets, known-issues page, or escalation path.','high',true,'Define support ownership and incident handling.','support-operations','product-and-operations')
  ];
  const contentModels = [
    { model:'A-two-item-technical-demo', itemCount:2, minimumObjectiveDiversity:2, verificationWorkload:'complete', authoringWorkload:'none', humanReviewWorkload:'complete for items; product/accessibility pending', runtimeComplexity:'current', userValue:'low technical proof', repetitionRisk:'very-high', readiness:'invite-only-after-blockers', recommendation:'retain hidden for now' },
    { model:'B-five-item-limited-preview', itemCount:5, minimumObjectiveDiversity:3, verificationWorkload:'three new immutable artifacts', authoringWorkload:'medium', humanReviewWorkload:'three item reviews plus sequence review', runtimeComplexity:'low-to-medium', userValue:'moderate', repetitionRisk:'medium', readiness:'recommended preview target', recommendation:'preferred next target' },
    { model:'C-ten-item-public-beta', itemCount:10, minimumObjectiveDiversity:4, verificationWorkload:'eight additional artifacts', authoringWorkload:'high', humanReviewWorkload:'high plus complete run review', runtimeComplexity:'medium', userValue:'high', repetitionRisk:'low', readiness:'future beta target', recommendation:'do not begin until five-item preview evidence' },
    { model:'D-configurable-session', itemCount:'3/5/10', minimumObjectiveDiversity:4, verificationWorkload:'large matrix', authoringWorkload:'very-high', humanReviewWorkload:'very-high', runtimeComplexity:'high', userValue:'potentially high', repetitionRisk:'selection-dependent', readiness:'not-ready', recommendation:'defer beyond beta' }
  ];
  const scorecard = [
    ['content-sufficiency',6,20,'high',true], ['accessibility',5,15,'high',true],
    ['product-clarity',5,10,'medium',true], ['security',8,10,'medium',true],
    ['privacy',5,10,'medium',true], ['observability',1,5,'high',true],
    ['rollback-and-kill-switch',4,10,'high',true], ['performance',4,5,'medium',false],
    ['browser-mobile',3,5,'medium',true], ['artifact-integrity',5,5,'high',false],
    ['support-documentation',1,5,'high',true]
  ].map(([name,score,maximum,confidence,blocker]) => ({ name, score, maximum, confidence,
    evidence: readinessDomains.find(item => item.name === name)?.evidence ?? 'See related readiness domains.',
    blocker, remediation: readinessDomains.find(item => item.name === name)?.recommendedAction ?? 'Complete owner review.' }));
  const accessibilityAreas = [
    'windows-narrator','nvda','voiceover-macos-or-ios','keyboard-only-desktop','touch-only-mobile',
    'zoom-200','zoom-400','high-contrast','reduced-motion','focus-after-item-transition',
    'focus-after-summary','live-region-verbosity','chess-loss-vs-objective-miss',
    'retry-item-vs-retry-run','board-square-identification','promotion-dialog','hint-reveal','technical-unavailable'
  ].map(area => ({ area, status:'not-reviewed', reviewer:null, notes:null }));
  const humanReviewTemplate = Object.fromEntries(HUMAN_FIELDS.map(field => [field, null]));
  const base = {
    packetSchemaVersion:'1.0.0', packetId:'endgame-run-public-readiness-1.0.0',
    runArtifactId:'endgame-run-technical-two-item', runArtifactVersion:'1.0.0',
    baselineCommit:'bffc171f4fdb83e6f0218f9664b6d1e87e93d123',
    currentState:{ technicalFunctional:true, hidden:true, localOnly:true, ephemeral:true, deterministic:true,
      itemCount:2, orderedItemIds:['kp-coordinate-support-promote@1.0.0','rule-square-a-pawn-catch-stop-promotion@1.0.0'],
      publicApproved:false, runtimeModifiedByPacket:false },
    readinessDomains, contentModels,
    minimumContentStandardCandidates:{
      proposedPreview:{ minimumItems:5, minimumObjectiveContracts:3, offensiveItems:2, defensiveItems:2,
        conversionItems:1, uniqueStartingFen:true, uniqueInstructionalIdea:true, humanApproved:true,
        immutable:true, integrityChecked:true, offlineSafe:true, accessible:true, browserTested:true, approvalStatus:'candidate-unapproved' },
      proposedBeta:{ minimumItems:10, minimumObjectiveContracts:4, approvalStatus:'candidate-unapproved' }
    },
    sessionLengthCandidates:[
      { policy:'fixed-2', suitability:'technical-demo-only', risk:'repetition' },
      { policy:'fixed-5', suitability:'recommended-limited-preview', risk:'manageable cognitive load' },
      { policy:'fixed-10', suitability:'future-public-beta', risk:'higher abandonment and mobile load' },
      { policy:'time-based', suitability:'not-recommended', risk:'accessibility and competitive pressure' },
      { policy:'configurable', suitability:'future-production', risk:'content and test explosion' }
    ],
    selectionPolicyCandidates:[
      { policy:'deterministic-fixed', preview:'recommended', beta:'acceptable-curated-sets', production:'low replay value' },
      { policy:'curated-rotation', preview:'future', beta:'recommended', production:'recommended' },
      { policy:'seeded-local-shuffle', preview:'not-recommended', beta:'conditional', production:'conditional' },
      { policy:'objective-balanced', preview:'content-insufficient', beta:'preferred', production:'preferred' }
    ],
    publicNameCandidates:[
      { name:'Endgame Run', clarity:'medium', competitiveTone:'medium', recommendation:'internal continuity only' },
      { name:'Endgame Challenge', clarity:'medium', competitiveTone:'high', recommendation:'reject' },
      { name:'Endgame Sprint', clarity:'low', competitiveTone:'high', recommendation:'reject' },
      { name:'Endgame Practice', clarity:'high', competitiveTone:'low', recommendation:'preferred public candidate' },
      { name:'Endgame Course Run', clarity:'low', competitiveTone:'low', recommendation:'reject' },
      { name:'CAISSA Endgame Run', clarity:'medium', competitiveTone:'medium', recommendation:'not preferred' }
    ],
    entryPointCandidates:[
      { entry:'invite-only-query', preview:'recommended', beta:'insufficient-discoverability', rollback:'immediate' },
      { entry:'modes-dialog', preview:'after approval', beta:'recommended', rollback:'simple' },
      { entry:'trainer-landing-card', preview:'not recommended', beta:'optional', rollback:'simple' },
      { entry:'endgame-library', preview:'not recommended', beta:'contextual option', rollback:'simple' },
      { entry:'academy', preview:'not recommended', beta:'future', rollback:'medium' },
      { entry:'primary-navigation', preview:'reject', beta:'reject until production maturity', rollback:'medium' }
    ],
    betaLabelCandidates:[
      { label:'Technical Preview', use:'hidden technical validation' }, { label:'Limited Preview', use:'invite-only preview' },
      { label:'Beta', use:'only after all beta gates' }, { label:'Experimental', use:'not preferred; weak trust' },
      { label:'Early Access', use:'not preferred; implies product access program' }
    ],
    resultPolicyCandidates:{
      display:['objectives-completed','independent-completions','completed-with-hints','objectives-not-completed','technical-skips','concise-per-item-feedback'],
      hide:['internal-enum-names','rating','leaderboard','percentile','elo','competitive-score','global-rank','permanent-score'],
      recommendedWording:{ independent:'Completed independently', assisted:'Completed with hints',
        failure:'Objective not completed', drawingMiss:'Game may remain drawn; training objective not completed',
        technical:'Technical issue — result not affected', abandoned:'Run ended without saving results' }
    },
    hintPolicyCandidates:{ recommended:'staged-hints-secondary', finalReveal:'removes-independent-eligibility',
      penalties:false, confirmationForFinalReveal:'candidate-desirable-for-beta', currentBehaviorChanged:false },
    skipPolicyCandidates:{ preview:'technical-unavailable-only', beta:'technical-unavailable-only-unless-user-research-approves-voluntary-skip',
      voluntarySkipImplemented:false },
    retryPolicyCandidates:{ retryItem:'unlimited-local', retryRun:'from-summary', resetHints:true,
      firstAttemptHistoryPersistence:false, recommendedClassification:'success after retry must not be described as first-attempt independent' },
    abandonmentPolicyCandidates:{ preview:'exit-with-clear-ephemeral-warning', beta:'confirm-exit-after-progress',
      browserBack:'neutral-abandonment', refresh:'session-lost', pause:'none', persistence:false },
    accessibilityReviewPlan:{ allowedStatuses:['not-reviewed','pass','pass-with-notes','fail','not-available'], areas:accessibilityAreas },
    accessibilityReleaseGateCandidates:{
      mandatory:['keyboard-only','one-windows-screen-reader','one-apple-screen-reader','zoom-200','zoom-400',
        'high-contrast','reduced-motion','mobile-touch','axe','no-critical-wcag','all-terminal-states-accessible'],
      desirable:['second-screen-reader-combination','multiple-physical-mobile-devices'],
      approvalStatus:'candidate-unapproved'
    },
    privacyAudit:{
      runDataCollectedByCode:'none beyond static HTTP requests needed to load page and three artifacts',
      notCollectedByRun:['cookies','localStorage','sessionStorage','account-id','email','move-history-logging','analytics-events','browser-fingerprint'],
      processorsKnownFromRunCode:[], processorsUnknown:['hosting/CDN request processing and retention','site-shell third-party behavior outside run modules'],
      consentRequirement:'unknown pending privacy/legal review of infrastructure and any future observability',
      privacyPolicyImpact:'no run-specific policy text exists'
    },
    observabilityCandidates:[
      { policy:'no-telemetry', privacyRisk:'lowest', operationalValue:'low', recommendation:'acceptable while hidden' },
      { policy:'aggregate-counters', privacyRisk:'low if server aggregation minimizes request data', operationalValue:'medium', recommendation:'candidate preview minimum' },
      { policy:'privacy-preserving-operational-events', privacyRisk:'medium', operationalValue:'high', recommendation:'preferred only after privacy/legal approval' },
      { policy:'full-analytics', privacyRisk:'high', operationalValue:'high', recommendation:'reject for current scope' }
    ],
    consentAnalysis:{ currentRun:'no run telemetry and no run-specific consent needed by run code',
      futureMinimalEvents:'privacy notice or consent cannot be determined until processor, retention, IP handling, cookies, and jurisdiction are approved',
      legalReviewRequired:true, cookieBannerImplemented:false },
    errorTaxonomy:{
      public:['This run is temporarily unavailable.','This item could not be loaded.','Your result was not affected.','Return to Endgame Trainer.'],
      privateCodes:['RUN_ARTIFACT_LOAD_FAILED','RUN_ARTIFACT_INTEGRITY_FAILED','ITEM_ARTIFACT_LOAD_FAILED',
        'ITEM_CONTROLLER_INIT_FAILED','STALE_CALLBACK_REJECTED','BOARD_STATE_MISMATCH','TRANSITION_FAILED','SUMMARY_FAILED'],
      exclusions:['private-digests','stack-traces','reviewer-data','private-evidence']
    },
    killSwitchCandidates:[
      { mechanism:'deployment-revert', speed:'minutes', authenticated:true, redeploy:true, recommendation:'current fallback' },
      { mechanism:'vercel-environment-edge-gate', speed:'fast', authenticated:true, redeploy:'configuration-dependent', recommendation:'preferred candidate' },
      { mechanism:'static-public-config', speed:'cache-dependent', authenticated:false, redeploy:false, recommendation:'reject unless signed and fail-closed' },
      { mechanism:'client-query-override', speed:'fast', authenticated:false, recommendation:'reject' }
    ],
    rollbackPlan:[
      { trigger:'UI exposure issue', owner:'product/release', action:'remove entry while retaining hidden route', verification:'navigation absent and V2 fallback works', communication:'status and support notice', restoration:'product sign-off' },
      { trigger:'artifact/controller/item integration failure', owner:'release/engineering', action:'disable route or revert deployment', verification:'normal V2 and standalone items pass', communication:'incident record', restoration:'root cause and regression pass' },
      { trigger:'accessibility or browser regression', owner:'accessibility/QA/release', action:'disable preview', verification:'affected path unavailable and fallback accessible', communication:'known issue', restoration:'human retest' },
      { trigger:'technical-unavailable spike', owner:'operations/release', action:'activate kill switch', verification:'fallback and error rate normalize', communication:'operations alert', restoration:'artifact/service verification' }
    ],
    signingReadiness:{ current:'honestly-unsigned', limitedPreviewCandidate:'unsigned only with explicit approval and immutable hash checks',
      publicBetaRecommendation:'signed artifacts', requirements:['security-owned-key','rotation','revocation','CI-verification','public-key-distribution','compromised-key-runbook'],
      keysGenerated:false },
    securityAudit:{ critical:[], high:[], medium:['kill-switch-not-implemented','public-threat-model-not-approved','unsigned-artifacts'],
      low:['hardcoded-English-copy'], informational:['client-side integrity is tamper detection, not server attestation'],
      publicReleaseBlocked:true },
    performanceAudit:{ artifactBytes:{ run:1329, promote:7659, stopPromotion:5542, total:14530 },
      boardMountCount:1, workers:0, expectedStaticRequests:3, transitionModel:'same-board/local-controller',
      unmeasured:['physical-device-latency','retry-memory-profile','listener-count-in-production','CDN-cache-behavior'],
      budgets:{ totalRunArtifactsBytes:25000, boardMounts:1, workers:0, itemTransitionMs:250, summaryMs:100,
        duplicateDomNodes:0, duplicateListeners:0, technicalNetworkRequests:3 } },
    browserPolicyCandidates:{ preview:'current stable Chromium, Firefox, Safari/WebKit plus physical Android Chrome and iOS Safari smoke',
      beta:'current and previous major for Chrome/Edge/Firefox/Safari where feasible; graceful normal-V2 fallback',
      olderBrowsers:'unsupported with truthful copy after policy approval', physicalDeviceTestingPerformed:false },
    mobileReview:{ emulatedWidthsPassed:[320,375,390,768,820,1024,1280,1440,1920],
      physicalDeviceAreas:['mobile-landscape','ios-safe-area','android-browser-chrome','touch-promotion','soft-keyboard','orientation-change'],
      physicalDeviceStatus:'not-reviewed' },
    localizationReadiness:{ current:'hardcoded-English', gaps:['pluralization','dynamic-counts','results','objectives','hints','errors','buttons','announcements'],
      previewRecommendation:'English-only with explicit scope', betaRecommendation:'extract strings and validate pluralization before beta',
      initialLanguagesCandidate:['en'], approvedLanguages:null },
    supportRequirements:{ requiredTopics:['purpose','objectives','hints','chess-loss-vs-objective-miss','retry','neutral-technical-failure',
        'no-saved-results','privacy','beta-limitations','problem-reporting'],
      placementCandidate:['concise-inline-help','first-class-Help-section','FAQ'], escalationOwner:null, responseTarget:null, ready:false },
    scorecard:{ domains:scorecard, score:scorecard.reduce((sum,item)=>sum+item.score,0), maximum:100,
      mandatoryBlockerOverride:true, numericalScoreIsApproval:false },
    blockingIssues:[
      'two-items-below-minimum-content-candidate','objective-diversity-below-candidate',
      'human-accessibility-review-not-performed','physical-mobile-review-not-performed',
      'privacy-infrastructure-unknowns','observability-policy-unapproved','kill-switch-not-implemented',
      'public-product-name-entry-label-unapproved','support-materials-not-ready','human-product-approval-absent'
    ],
    nonblockingIssues:['artifact-signing-before-limited-preview-candidate','localization-beyond-English','final-performance-budget-approval'],
    recommendedDecision:{
      primary:'defer-public-release',
      findings:['requires-more-content','requires-accessibility-review','requires-privacy-observability-work'],
      limitedPreview:'not-yet-approved',
      publicBeta:'not-approved',
      confidence:'high for repository evidence; manual, legal, privacy infrastructure, and product evidence remain unset'
    },
    recommendedNextTasks:[
      'Human product owner reviews this exact packet without inferred approval.',
      'Define and review three or more additional verified items reaching the five-item/three-objective candidate floor.',
      'Complete the human accessibility and physical-device plan.',
      'Complete infrastructure privacy audit and approve observability/consent policy.',
      'Design and approve an authenticated fail-closed kill switch and rollback drill.',
      'Prepare public naming, preview labeling, help, limitations, and support ownership.'
    ],
    humanReviewTemplate, allowedHumanDecisions:[...ALLOWED_DECISIONS]
  };
  return { ...base, packetDigest: sha256(base) };
}

export function renderMarkdown(packet) {
  const blockers = packet.blockingIssues.map(item => `- ${item}`).join('\n');
  const domains = packet.readinessDomains.map(item =>
    `| ${item.name} | ${item.status} | ${item.severity} | ${item.classification} | ${item.gap} | ${item.recommendedAction} |`
  ).join('\n');
  const models = packet.contentModels.map(item =>
    `| ${item.model} | ${item.itemCount} | ${item.minimumObjectiveDiversity} | ${item.runtimeComplexity} | ${item.repetitionRisk} | ${item.readiness} |`
  ).join('\n');
  return `# Endgame Run Public-Readiness Decision Packet 1.0.0

## 1. Baseline

This packet binds governance analysis to commit \`${packet.baselineCommit}\` and the immutable run \`${packet.runArtifactId}@${packet.runArtifactVersion}\`.

## 2. Current run state

The run is technically functional, hidden, local-only, ephemeral, deterministic, one-board, zero-Worker, and not publicly approved. It contains exactly promote followed by stop-promotion.

## 3. Why public release is not automatic

Technical correctness does not supply product approval, adequate content, human accessibility review, infrastructure privacy facts, observability policy, a rapid kill switch, public support material, or operational ownership.

## 4. Readiness domains

| Domain | Status | Severity | Gate | Gap | Recommended action |
|---|---|---|---|---|---|
${domains}

## 5. Content sufficiency

Two items demonstrate orchestration but create immediate repetition and cover only two objective contracts. They are insufficient for the proposed limited-preview and beta standards.

## 6. Minimum content standard

Candidate limited-preview floor: five immutable, human-approved, offline-safe, browser-tested items; three objective contracts; at least two offensive, two defensive, and one conversion item; unique FENs and instructional ideas. This candidate remains unapproved.

## 7. Session length

Fixed two is technical-demo only. Fixed five is the recommended limited-preview candidate. Fixed ten is a future beta candidate. Timed sessions are not recommended. Configurable length is deferred.

## 8. Selection policy

Use deterministic fixed order for limited preview. Consider reviewed curated rotation for beta and objective-balanced selection only after sufficient content exists.

## 9. Public name

Recommended candidate: **Endgame Practice**. Retain \`endgame-run-technical-two-item\` as the internal technical identity. No rename is approved or implemented.

## 10. Entry point

Keep invite-only query access for any future limited preview until explicitly approved. A Modes entry is the beta candidate. Primary navigation is not recommended.

## 11. Beta labeling

Use **Technical Preview** while hidden and **Limited Preview** for an approved invite tier. Reserve **Beta** until every mandatory beta gate passes.

## 12. Results

Public candidates are Completed independently, Completed with hints, Objective not completed, Game may remain drawn but the training objective was not completed, and Technical issue—result not affected. Internal enums remain hidden.

## 13. Hints

Keep staged hints secondary. The final reveal removes independent eligibility and should receive a confirmation review for beta. Hints never create penalties.

## 14. Skip

Allow Skip only for technical-unavailable during preview. Do not add voluntary Skip without user research and explicit semantics approval.

## 15. Retry

Allow local Retry Item and Retry Run without persistent attempt history. Public copy must not describe success after help or retry as first-attempt independent success.

## 16. Abandonment

Exit and browser navigation abandon neutrally. Preview should clearly warn that local progress disappears; beta should consider confirmation after progress. No pause or persistence is proposed.

## 17. Accessibility plan

All eighteen manual areas in the JSON packet remain \`not-reviewed\`. Automated Axe and browser results are evidence, not human assistive-technology validation.

## 18. Accessibility release gate

Mandatory candidate: keyboard, Windows and Apple screen readers, 200% and 400% zoom, high contrast, reduced motion, mobile touch, Axe, no critical WCAG defect, and accessible terminal states. Human approval remains unset.

## 19. Privacy

Run code records no results and uses no cookie, localStorage, sessionStorage, account ID, telemetry event, or fingerprint. Hosting/CDN request processing, retention, IP handling, and unrelated shell behavior remain unknown pending infrastructure review.

## 20. Observability

No telemetry is implemented. Aggregate counters or tightly minimized operational events are candidates only after privacy and legal review. Full analytics is rejected for this scope.

## 21. Consent

The present run has no run-specific telemetry. Future consent requirements cannot be determined until data fields, processor, retention, cookies, IP handling, and jurisdictions are approved.

## 22. Error taxonomy

Use neutral public messages and the bounded private codes in the JSON packet. Never expose digests, stack traces, reviewer data, or evidence.

## 23. Kill switch

Current fallback is deployment revert. Preferred candidate is an authenticated fail-closed Vercel/edge environment gate that routes to normal V2. Client overrides and unsigned cached public configuration are rejected.

## 24. Rollback

Disable exposure first, then the run route, or revert the deployment depending on scope. Verify normal V2 and standalone items, communicate status, and restore only after root cause and relevant human/automated gates pass.

## 25. Signing

Artifacts are honestly unsigned. An invite-only preview could remain unsigned only with explicit approval; public beta should require security-owned signing, rotation, revocation, CI verification, and compromised-key response.

## 26. Security

No critical or high issue is currently evidenced. Public release remains blocked by missing threat-model approval, kill switch, cache/config review, and unsigned-artifact decision.

## 27. Performance

The three artifacts total 14,530 bytes, use one board, zero Workers, and three expected static requests. Proposed budgets are recorded in JSON; physical-device and retry-memory measurements remain open.

## 28. Browser support

Automation passes Chromium, Firefox, and WebKit. Preview additionally requires physical Android Chrome and iOS Safari smoke. No physical-device testing is claimed.

## 29. Mobile

Emulated widths 320–1920 pass. Landscape, safe areas, browser chrome, touch promotion, soft keyboard, and orientation changes remain unreviewed on physical devices.

## 30. Localization

Current copy is hardcoded English. English-only is the preview candidate. Beta requires string extraction, pluralization, and accessibility-announcement review.

## 31. Support

Public help must explain purpose, objectives, hints, objective misses, retry, neutral technical failure, ephemeral results, privacy, limitations, and problem reporting. Ownership and response targets are unset.

## 32. Scorecard

Repository-evidence score: **${packet.scorecard.score}/${packet.scorecard.maximum}**. This is not approval. Mandatory blockers override the number.

## 33. Decision logic

Public beta requires content, accessibility, privacy, rollback/kill switch, observability, browser, support, security, and explicit product approval. Limited preview requires invite-only exposure, approved labeling, minimum manual accessibility, privacy completion, kill switch, and explicit human acceptance of its content limits.

## 34. Human review

Every human decision and binding field is null. Allowed decisions are strictly: ${packet.allowedHumanDecisions.join(', ')}.

## 35. Public/private boundary

This JSON, Markdown handoff, architecture, tests, audits, and human review fields remain private. Season 10.9 runtime and all public artifacts remain byte-identical.

## 36. Tests

Private tests must reproduce the packet digest, enforce null human fields and decision allowlists, verify scorecard/blocker rules, and lock all public boundaries.

## 37. Known limitations

Repository evidence cannot establish legal conclusions, infrastructure retention, human accessibility outcomes, physical-device behavior, user demand, or support capacity.

## 38. Recommended decision

**DEFER PUBLIC RELEASE**, with findings **REQUIRES MORE CONTENT**, **REQUIRES ACCESSIBILITY REVIEW**, and **REQUIRES PRIVACY OR OBSERVABILITY WORK**. This is an evidence-backed recommendation, not human approval.

Mandatory blockers:

${blockers}

## 39. Season 10.11 options

1. Content expansion review packet for a five-item, three-objective limited preview.
2. Human accessibility and physical-device review execution.
3. Privacy/observability and consent decision.
4. Authenticated kill-switch and rollback rehearsal design.
5. Human product-owner decision against this exact packet.

Packet digest: \`${packet.packetDigest}\`
`;
}

export async function generateReadinessPacket() {
  const packet = buildReadinessPacket();
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(packet, null, 2)}\n`),
    writeFile(markdownPath, renderMarkdown(packet))
  ]);
  return packet;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packet = await generateReadinessPacket();
  console.log(`${packet.packetId} ${packet.packetDigest} ${packet.scorecard.score}/${packet.scorecard.maximum}`);
}
