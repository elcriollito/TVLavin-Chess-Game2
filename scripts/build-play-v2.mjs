import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../index.html', import.meta.url);
const outputPath = new URL('../play-v2.html', import.meta.url);
const publicBetaOutputPath = new URL('../play-v2-public-beta.html', import.meta.url);
const publicBetaDocumentModulePath = new URL('../api/_lib/play-v2-public-beta-document.js', import.meta.url);
const unavailableOutputPath = new URL('../play-v2-unavailable.html', import.meta.url);
const promotionQaOutputPath = new URL('../play-v2-promotion-qa.html', import.meta.url);
const ipadAnalyzeDiagnosticOutputPath = new URL('../play-v2-ipad-analyze-diagnostic.html', import.meta.url);

let html = await readFile(sourcePath, 'utf8');

const forbiddenElements = [
  /\s*<link[^>]+href="css\/fics-client\.css[^>]*>\r?\n/gi,
  /\s*<script[^>]+src="js\/fics-style12\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/fics-client\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/fics-(?:observability|match-research|research-actions|computer-challenge)\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/spectator-tv-state\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/spectator-tv-catalog\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/spectator-tv-section\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/legacy-canonical-section-route-policy\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/play\/players\/[^">]+"[^>]*><\/script>\r?\n/gi,
  /\s*<!-- Lazy manifest order \(inert\):[^>]*players-panel\.js -->\r?\n/gi,
  /\s*<link[^>]+href="css\/academy\.css[^>]*>\r?\n/gi,
  /\s*<script[^>]+src="\/js\/(?:caissa-clarity|caissa-vercel-analytics)\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="(?:mentor-prompts|mentor-ai)\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/academy-section\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/play\/analytics\/play-mentor-engagement-analytics\.js[^>]*><\/script>\r?\n/gi,
  /\s*<link[^>]+href="css\/caissa-onboarding\.css[^>]*>\r?\n/gi,
  /\s*<script[^>]+src="js\/caissa-onboarding\.js[^>]*><\/script>\r?\n/gi,
  /\s*<!-- Lazy manifest order \(inert\):[^>]*(?:coach-profile|endgame-phase-classifier)[^>]*-->\r?\n/gi
];

for (const pattern of forbiddenElements) html = html.replace(pattern, '\n');

html = html
  .replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '\n')
  .replace(/\s*<!-- CSP: FICS WebSocket[^>]*-->/i, '\n')
  .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i,
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' https://cdn.jsdelivr.net; script-src-elem \'self\' https://cdn.jsdelivr.net; style-src \'self\' \'unsafe-inline\'; img-src \'self\' https://img.clerk.com data:; font-src \'self\'; worker-src \'self\'; connect-src \'self\' https://*.clerk.accounts.dev https://api.clerk.com https://clerk-telemetry.com; frame-src \'self\' https://*.clerk.accounts.dev; object-src \'none\'; base-uri \'self\';">')
  .replace(/<title>[\s\S]*?<\/title>/i, '<title>CAISSA Play v2 · Internal</title>')
  .replace(/<meta name="title"[^>]*>/i, '<meta name="title" content="CAISSA Play v2 · Internal">')
  .replace(/<meta name="description"[^>]*>/i, '<meta name="description" content="Internal CAISSA-native chess play preview.">')
  .replace(/<meta property="og:(?:title|description)"[^>]*>/gi, '')
  .replace(/<meta name="twitter:(?:title|description)"[^>]*>/gi, '')
  .replace(/<meta (?:property="og:(?:url|image(?::[^" ]+)?)"|name="twitter:(?:url|image)")[^>]*>/gi, '')
  .replace(/<meta (?:property="og:image:alt"|name="twitter:image:alt")[^>]*>/gi,
    '<meta name="image:alt" content="CAISSA internal chess play preview.">')
  .replace(/<meta name="robots"[^>]*>/i, '<meta name="robots" content="noindex, nofollow">')
  .replace(/<link rel="canonical"[^>]*>/i, '<link rel="canonical" href="/play/beta">')
  .replace('<section id="yahooClassicSection" class="content-section active">',
    '<section id="yahooClassicSection" class="content-section" hidden inert aria-hidden="true">')
  .replace('<nav id="mainNav" class="main-navigation">',
    '<nav id="mainNav" class="main-navigation" aria-label="CAISSA main navigation">')
  .replace('<section id="ficsSection" class="content-section">',
    '<section id="ficsSection" class="content-section" hidden inert aria-hidden="true">')
  .replace('<section id="spectatorSection" class="content-section">',
    '<section id="spectatorSection" class="content-section" hidden inert aria-hidden="true">')
  .replace(/\s*<!-- SECTION: CAISSA Academy -->[\s\S]*?(?=\s*<!-- SECTION: Spectator TV -->)/i, '\n')
  .replace(/\s*<button id="mentorBtn"[^>]*>[\s\S]*?<\/button>/i, '\n')
  .replace(/\s*<div class="panel analyze-mentor-panel">[\s\S]*?<\/div>\s*<\/div>\s*(?=<\/main>)/i, '\n')
  .replace(/\s*<div id="legacyHelpContent"[\s\S]*?(?=\s*<!-- CAISSA Mentor AI Panel)/i, '\n')
  .replace(/\s*<!-- CAISSA Mentor AI Panel[\s\S]*?(?=\s*<!-- CAISSA Library Panel)/i, '\n')
  .replace(/\s*<button[^>]+data-section="(?:mentor|academy)"[^>]*>[\s\S]*?<\/button>/gi, '\n')
  .replace(/\s*<(?:button|a)[^>]+data-section="(?:yahooClassic|fics|spectator)"[^>]*>[\s\S]*?<\/(?:button|a)>/gi, '\n')
  .replace(/^.*data-section="academy".*\r?\n/gim, '')
  .replace(/\s+ws:\/\/localhost:8081 ws:\/\/127\.0\.0\.1:8081 wss:\/\/fics-gateway\.caissa-chess\.org/g, '')
  .replace("script-src 'self' 'unsafe-eval'", "script-src 'self'")
  .replace(" https://challenges.cloudflare.com blob:; script-src-elem", " https://challenges.cloudflare.com; script-src-elem")
  .replace(" https://challenges.cloudflare.com blob:; style-src", " https://challenges.cloudflare.com; style-src")
  .replace("worker-src 'self' blob:", "worker-src 'self'")
  .replace(/connect-src 'self'[^;]+;/, "connect-src 'self' https://api.chess.com https://lichess.org https://caissa-game-fetcher.elcriollito.workers.dev https://*.clerk.accounts.dev https://api.clerk.com https://clerk-telemetry.com;")
  .replace('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    '/assets/vendor/font-awesome/css/all-6.4.0.min.css')
  .replace('https://code.jquery.com/jquery-3.6.0.min.js',
    '/assets/vendor/jquery/jquery-3.6.0.min.js')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js',
    '/assets/vendor/chess.js/chess-0.10.3.min.js')
  .replace('https://cdn.jsdelivr.net/npm/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js',
    '/assets/vendor/chessboard.js/chessboard-1.0.0.min.js')
  .replace(
    '    <script src="js/play/play-route-controller.js?v=1.1.0"></script>',
    '    <script src="js/play/play-v2-fics-isolation.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-native-players-policy.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-players-presentation-policy.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-coach-boundary.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-mentor-review-boundary.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-post-game-exit-policy.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-product-boundary.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-beta-entry.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-invite-policy.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-route-controller.js?v=1.1.0"></script>'
  )
  .replace('    <script src="js/play/post-game-experience.js?v=1.8.0"></script>',
    '    <script src="js/play/play-v2-post-game-policy.js?v=1.1.0"></script>\n' +
    '    <script src="js/play/play-v2-inline-analyze.js?v=1.3.0"></script>\n' +
    '    <script src="js/play/post-game-core.js?v=1.4.0"></script>')
  .replace('<body data-clarity-mask>', '<body data-caissa-play-v2-entry="qa-only" data-clarity-mask>')
  .replace('</head>', '    <link rel="stylesheet" href="css/play-v2-invite-feedback.css?v=1.0.0">\n</head>')
  .replace('</body>', '    <script src="js/play/play-v2-manual-qa-feedback-policy.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-manual-qa-report.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-invite-client.js?v=1.0.0"></script>\n</body>')
  .replace(/[ \t]+(?=\r?$)/gm, '');

if (!html.includes('data-caissa-play-v2-entry="qa-only"')) throw new Error('PLAY_V2_BODY_MARKER_MISSING');
if (!html.includes('js/play/play-v2-fics-isolation.js?v=1.0.0')) throw new Error('PLAY_V2_CONTRACT_MISSING');
if (!html.includes('js/play/play-v2-native-players-policy.js?v=1.0.0')) throw new Error('PLAY_V2_NATIVE_PLAYERS_POLICY_MISSING');
if (!html.includes('js/play/play-v2-players-presentation-policy.js?v=1.0.0')) throw new Error('PLAY_V2_PLAYERS_PRESENTATION_POLICY_MISSING');
if (!html.includes('js/play/play-v2-product-boundary.js?v=1.0.0')) throw new Error('PLAY_V2_PRODUCT_BOUNDARY_MISSING');
if (!html.includes('js/play/play-v2-coach-boundary.js?v=1.0.0')) throw new Error('PLAY_V2_COACH_BOUNDARY_MISSING');
if (!html.includes('js/play/play-v2-mentor-review-boundary.js?v=1.0.0')) throw new Error('PLAY_V2_MENTOR_REVIEW_BOUNDARY_MISSING');
if (!html.includes('js/play/play-v2-post-game-exit-policy.js?v=1.0.0')) throw new Error('PLAY_V2_POST_GAME_EXIT_POLICY_MISSING');
if (!html.includes('js/play/play-v2-beta-entry.js?v=1.0.0')) throw new Error('PLAY_V2_BETA_ENTRY_CONTRACT_MISSING');
if (!html.includes('js/play/play-v2-invite-policy.js?v=1.0.0')) throw new Error('PLAY_V2_INVITE_POLICY_MISSING');
if (!html.includes('js/play/play-v2-post-game-policy.js?v=1.1.0')) throw new Error('PLAY_V2_POST_GAME_POLICY_MISSING');
if (!html.includes('js/play/play-v2-identity-policy.js?v=1.0.0')) throw new Error('PLAY_V2_IDENTITY_POLICY_MISSING');
if (!html.includes('js/play/play-v2-mode-transition-policy.js?v=1.0.0')) throw new Error('PLAY_V2_MODE_TRANSITION_POLICY_MISSING');
if (!html.includes('js/play/play-v2-inline-analyze.js?v=1.3.0')) throw new Error('PLAY_V2_INLINE_ANALYZE_MISSING');
if (!html.includes("worker-src 'self';") || /worker-src[^;]*(?:blob:|https?:)/.test(html))
  throw new Error('PLAY_V2_WORKER_CSP_INVALID');
if (/script-src[^;]*'unsafe-eval'/.test(html)) throw new Error('PLAY_V2_UNSAFE_EVAL_CSP');
const resourceElements = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
const prohibitedResources = resourceElements.filter(element =>
  /js\/play\/players\//i.test(element)
  || /players-(?:panel|stack)/i.test(element)
  || (/fics/i.test(element) && !/play-v2-fics-isolation\.js/i.test(element))
  || (/(?:academy|coach|mentor|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library))/i.test(element)
    && !/(?:play-v2-(?:product|coach|mentor-review)-boundary\.js|js\/mentor\/mentor-(?:context-contract|floating-shell)\.js|css\/mentor-floating-shell\.css)/i.test(element))
);
if (prohibitedResources.length) throw new Error(`PROHIBITED_PLAY_V2_RESOURCE: ${prohibitedResources.join(', ')}`);
const playProductHtml = html.replace(/<nav\b[^>]*\bid="mainNav"[\s\S]*?<\/nav>/i, '');
if (/id="(?:academySection|mentorPanel|analyzeMentor)"|data-section="(?:academy|mentor)"|href="\/endgame-(?:trainer|practice|library)"/i.test(playProductHtml))
  throw new Error('PROHIBITED_PLAY_V2_EDUCATIONAL_DOM');
if (/(?:id=["']playersPanel["']|data-(?:play|shell)-mode=["']players["']|data-players-panel)/i.test(html))
  throw new Error('PROHIBITED_PLAY_V2_PLAYERS_DOM');
if (/<meta[^>]+(?:players|fics|legacy play|matchmaking)|data-section=["'](?:yahooClassic|fics|spectator)["']/i.test(html))
  throw new Error('PROHIBITED_PLAY_V2_MULTIPLAYER_METADATA');
for (const legacyId of ['yahooClassicSection', 'ficsSection', 'spectatorSection']) {
  const match = html.match(new RegExp(`<section[^>]+id=["']${legacyId}["'][^>]*>`, 'i'))?.[0] || '';
  if (!/\bhidden\b/i.test(match) || !/\binert\b/i.test(match) || !/aria-hidden=["']true["']/i.test(match))
    throw new Error(`PLAY_V2_LEGACY_PRESENTATION_NOT_INERT: ${legacyId}`);
}
if (/caissa-onboarding/i.test(resourceElements.join('\n'))) throw new Error('PROHIBITED_PLAY_V2_ONBOARDING_RESOURCE');
if (/caissa-clarity\.js/i.test(resourceElements.join('\n'))) throw new Error('PROHIBITED_PLAY_V2_CLARITY_RESOURCE');
if (resourceElements.some(element => /(?:src|href)=["']https?:\/\//i.test(element)))
  throw new Error('PROHIBITED_PLAY_V2_EXTERNAL_STATIC_RESOURCE');
if (!/connect-src 'self'[^;]*https:\/\/\*\.clerk\.accounts\.dev/.test(html))
  throw new Error('PLAY_V2_AUTH_CONNECT_CSP_MISSING');

await writeFile(outputPath, html);
const publicBetaHtml = html
  .replace('<title>CAISSA Play v2 · Internal</title>', '<title>Play Chess Online | CAISSA Chess</title>')
  .replace('<meta name="title" content="CAISSA Play v2 · Internal">', '<meta name="title" content="Play Chess Online | CAISSA Chess">')
  .replace('<meta name="description" content="Internal CAISSA-native chess play preview.">', '<meta name="description" content="Play chess online with CAISSA Games, Bots, and Coach modes.">')
  .replace('<meta name="image:alt" content="CAISSA internal chess play preview.">', '<meta name="image:alt" content="CAISSA chess board and play controls.">')
  .replace('<link rel="canonical" href="/play/beta">', '<link rel="canonical" href="https://www.caissa-chess.org/play">')
  .replace('<meta name="robots" content="noindex, nofollow">', '<meta name="robots" content="index, follow">')
  .replace('data-caissa-play-v2-entry="qa-only"', 'data-caissa-play-v2-entry="official"')
  .replaceAll('data-navigation-mode="application"', 'data-navigation-mode="routes"')
  .replace('<script src="js/play/play-v2-beta-entry.js?v=1.0.0"></script>',
    '<script src="js/play/play-v2-public-beta-policy.js?v=1.0.0"></script>')
  .replace(/\s*<script src="js\/play\/play-v2-invite-client\.js\?v=1\.0\.0"><\/script>/, '')
  .replace('</head>', '    <script src="/js/caissa-vercel-analytics.js?v=1.0.0" defer></script>\n</head>')
  .replace('</body>', '    <script src="js/play/play-v2-public-beta-ui.js?v=1.0.0"></script>\n</body>')
  .replace(/[ \t]+(?=\r?$)/gm, '');
for (const required of ['data-caissa-play-v2-entry="official"', 'href="https://www.caissa-chess.org/play"', 'play-v2-public-beta-policy.js',
  'play-v2-public-beta-ui.js', 'play-v2-manual-qa-report.js']) {
  if (!publicBetaHtml.includes(required)) throw new Error(`PLAY_V2_PUBLIC_BETA_BUILD_MISSING: ${required}`);
}
if (/play-v2-beta-entry\.js|play-v2-invite-client\.js|play-v2-invite-redemption\.js/.test(publicBetaHtml))
  throw new Error('PLAY_V2_PUBLIC_BETA_INVITE_RUNTIME_PRESENT');
await writeFile(publicBetaOutputPath, publicBetaHtml);
const unavailableHtml = await readFile(unavailableOutputPath, 'utf8');
const publicBetaDocumentModule = `// Generated by scripts/build-play-v2.mjs. Do not edit directly.\n` +
  `export const PLAY_V2_PUBLIC_BETA_DOCUMENT = ${JSON.stringify(publicBetaHtml)};\n` +
  `export const PLAY_V2_UNAVAILABLE_DOCUMENT = ${JSON.stringify(unavailableHtml)};\n`;
await writeFile(publicBetaDocumentModulePath, publicBetaDocumentModule);
const promotionQaHtml = html
  .replace(/\s*<script[^>]+src="(?:\/js\/caissa-clarity\.js|js\/play\/analytics\/[^\"]+)"[^>]*><\/script>\r?\n/gi, '\n')
  .replace(/<title>CAISSA Play v2 .* Internal<\/title>/, '<title>CAISSA Play v2 - Internal Promotion QA</title>')
  .replace('<link rel="canonical" href="/play/beta">', '<link rel="canonical" href="/play/beta/qa/promotion">')
  .replace('</head>', '    <link rel="stylesheet" href="css/play-v2-physical-promotion-qa.css?v=1.0.0">\n' +
    '    <script src="js/play/play-v2-physical-promotion-qa-policy.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-physical-promotion-qa-boot.js?v=1.0.0"></script>\n</head>')
  .replace('<body data-caissa-play-v2-entry="qa-only" data-clarity-mask>',
    '<body data-caissa-play-v2-entry="qa-only" data-caissa-physical-promotion-qa="internal" data-clarity-mask>')
  .replace('</body>', '    <script src="js/play/play-v2-physical-promotion-qa-harness.js?v=1.0.0"></script>\n</body>')
  .replace(/[ \t]+(?=\r?$)/gm, '');
for (const required of ['Play v2 - Internal Promotion QA', 'play-v2-physical-promotion-qa-policy.js',
  'play-v2-physical-promotion-qa-boot.js', 'play-v2-physical-promotion-qa-harness.js',
  'play-v2-physical-promotion-qa.css', 'data-caissa-physical-promotion-qa="internal"']) {
  if (!promotionQaHtml.includes(required)) throw new Error(`PLAY_V2_PHYSICAL_PROMOTION_QA_BUILD_MISSING: ${required}`);
}
await writeFile(promotionQaOutputPath, promotionQaHtml);
const ipadAnalyzeDiagnosticHtml = html
  .replace(/\s*<script[^>]+src="(?:\/js\/caissa-clarity\.js(?:\?[^\"]*)?|js\/play\/analytics\/[^\"]+)"[^>]*><\/script>\r?\n/gi, '\n')
  .replace(/<title>CAISSA Play v2 .* Internal<\/title>/, '<title>CAISSA Play v2 - Internal iPad Analyze Diagnostic</title>')
  .replace('<link rel="canonical" href="/play/beta">', '<link rel="canonical" href="/play/beta/qa/ipad-analyze-diagnostic">')
  .replace('</head>', '    <link rel="stylesheet" href="css/play-v2-physical-ipad-analyze-diagnostic.css?v=1.0.0">\n' +
    '    <script src="js/play/play-v2-physical-ipad-analyze-diagnostic-policy.js?v=1.1.0"></script>\n' +
    '    <script src="js/play/play-v2-physical-ipad-analyze-diagnostic-boot.js?v=1.1.0"></script>\n</head>')
  .replace('<body data-caissa-play-v2-entry="qa-only" data-clarity-mask>',
    '<body data-caissa-play-v2-entry="qa-only" data-caissa-ipad-analyze-diagnostic="internal" data-clarity-mask>')
  .replace('</body>', '    <script src="js/play/play-v2-physical-ipad-analyze-diagnostic.js?v=1.1.0"></script>\n</body>')
  .replace(/[ \t]+(?=\r?$)/gm, '');
for (const required of ['Internal iPad Analyze Diagnostic', 'physical-ipad-analyze-diagnostic-policy.js',
  'physical-ipad-analyze-diagnostic-boot.js', 'physical-ipad-analyze-diagnostic.js',
  'physical-ipad-analyze-diagnostic.css', 'data-caissa-ipad-analyze-diagnostic="internal"']) {
  if (!ipadAnalyzeDiagnosticHtml.includes(required)) throw new Error(`PLAY_V2_IPAD_ANALYZE_DIAGNOSTIC_BUILD_MISSING: ${required}`);
}
await writeFile(ipadAnalyzeDiagnosticOutputPath, ipadAnalyzeDiagnosticHtml);
console.log('Generated Play v2 internal, public-beta, promotion, and iPad diagnostic HTML from index.html');
