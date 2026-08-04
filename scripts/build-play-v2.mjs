import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../index.html', import.meta.url);
const outputPath = new URL('../play-v2.html', import.meta.url);

let html = await readFile(sourcePath, 'utf8');

const forbiddenElements = [
  /\s*<link[^>]+href="css\/fics-client\.css[^>]*>\r?\n/gi,
  /\s*<script[^>]+src="js\/fics-style12\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/fics-client\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/play\/players\/[^">]+"[^>]*><\/script>\r?\n/gi,
  /\s*<!-- Lazy manifest order \(inert\):[^>]*players-panel\.js -->\r?\n/gi,
  /\s*<link[^>]+href="css\/academy\.css[^>]*>\r?\n/gi,
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
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; script-src-elem \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data:; font-src \'self\'; worker-src \'self\'; connect-src \'self\'; frame-src \'self\'; object-src \'none\'; base-uri \'self\';">')
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
  .replace(/\s*<a[^>]+href="\/endgame-(?:trainer|practice|library)"[^>]*>[\s\S]*?<\/a>/gi, '\n')
  .replace(/^.*data-section="academy".*\r?\n/gim, '')
  .replace(/\s+ws:\/\/localhost:8081 ws:\/\/127\.0\.0\.1:8081 wss:\/\/fics-gateway\.caissa-chess\.org/g, '')
  .replace("script-src 'self' 'unsafe-eval'", "script-src 'self'")
  .replace(" https://challenges.cloudflare.com blob:; script-src-elem", " https://challenges.cloudflare.com; script-src-elem")
  .replace(" https://challenges.cloudflare.com blob:; style-src", " https://challenges.cloudflare.com; style-src")
  .replace("worker-src 'self' blob:", "worker-src 'self'")
  .replace(/connect-src 'self'[^;]+;/, "connect-src 'self' https://api.chess.com https://lichess.org https://caissa-game-fetcher.elcriollito.workers.dev;")
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
    '    <script src="js/play/play-route-controller.js?v=1.1.0"></script>'
  )
  .replace('    <script src="js/play/post-game-experience.js?v=1.8.0"></script>',
    '    <script src="js/play/play-v2-post-game-policy.js?v=1.1.0"></script>\n' +
    '    <script src="js/play/play-v2-inline-analyze.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/post-game-core.js?v=1.0.0"></script>')
  .replace('<body data-clarity-mask>', '<body data-caissa-play-v2-entry="qa-only" data-clarity-mask>')
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
if (!html.includes('js/play/play-v2-post-game-policy.js?v=1.1.0')) throw new Error('PLAY_V2_POST_GAME_POLICY_MISSING');
if (!html.includes('js/play/play-v2-inline-analyze.js?v=1.0.0')) throw new Error('PLAY_V2_INLINE_ANALYZE_MISSING');
if (!html.includes("worker-src 'self';") || /worker-src[^;]*(?:blob:|https?:)/.test(html))
  throw new Error('PLAY_V2_WORKER_CSP_INVALID');
if (/script-src[^;]*'unsafe-eval'/.test(html)) throw new Error('PLAY_V2_UNSAFE_EVAL_CSP');
const resourceElements = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
const prohibitedResources = resourceElements.filter(element =>
  /js\/play\/players\//i.test(element)
  || /players-(?:panel|stack)/i.test(element)
  || (/fics/i.test(element) && !/play-v2-fics-isolation\.js/i.test(element))
  || (/(?:academy|coach|mentor|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library))/i.test(element)
    && !/play-v2-(?:product|coach|mentor-review)-boundary\.js/i.test(element))
);
if (prohibitedResources.length) throw new Error(`PROHIBITED_PLAY_V2_RESOURCE: ${prohibitedResources.join(', ')}`);
if (/id="(?:academySection|mentorPanel|analyzeMentor)"|data-section="(?:academy|mentor)"|href="\/endgame-(?:trainer|practice|library)"/i.test(html))
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
if (resourceElements.some(element => /(?:src|href)=["']https?:\/\//i.test(element)))
  throw new Error('PROHIBITED_PLAY_V2_EXTERNAL_STATIC_RESOURCE');
if (!/connect-src 'self';/.test(html) || /connect-src[^;]*https?:/.test(html))
  throw new Error('PLAY_V2_CONNECT_CSP_NOT_SAME_ORIGIN');

await writeFile(outputPath, html);
console.log('Generated play-v2.html from index.html');
