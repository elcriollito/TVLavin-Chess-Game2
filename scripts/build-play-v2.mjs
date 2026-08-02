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
  .replace(/\s*<!-- SECTION: CAISSA Academy -->[\s\S]*?(?=\s*<!-- SECTION: Spectator TV -->)/i, '\n')
  .replace(/\s*<button id="mentorBtn"[^>]*>[\s\S]*?<\/button>/i, '\n')
  .replace(/\s*<div class="panel analyze-mentor-panel">[\s\S]*?<\/div>\s*<\/div>\s*(?=<\/main>)/i, '\n')
  .replace(/\s*<div id="legacyHelpContent"[\s\S]*?(?=\s*<!-- CAISSA Mentor AI Panel)/i, '\n')
  .replace(/\s*<!-- CAISSA Mentor AI Panel[\s\S]*?(?=\s*<!-- CAISSA Library Panel)/i, '\n')
  .replace(/\s*<button[^>]+data-section="(?:mentor|academy)"[^>]*>[\s\S]*?<\/button>/gi, '\n')
  .replace(/\s*<a[^>]+href="\/endgame-(?:trainer|practice|library)"[^>]*>[\s\S]*?<\/a>/gi, '\n')
  .replace(/^.*data-section="academy".*\r?\n/gim, '')
  .replace(/\s+ws:\/\/localhost:8081 ws:\/\/127\.0\.0\.1:8081 wss:\/\/fics-gateway\.caissa-chess\.org/g, '')
  .replace("script-src 'self' 'unsafe-eval'", "script-src 'self'")
  .replace(" https://challenges.cloudflare.com blob:; script-src-elem", " https://challenges.cloudflare.com; script-src-elem")
  .replace(" https://challenges.cloudflare.com blob:; style-src", " https://challenges.cloudflare.com; style-src")
  .replace("worker-src 'self' blob:", "worker-src 'self'")
  .replace(/connect-src 'self'[^;]+;/, "connect-src 'self' https://api.chess.com https://lichess.org https://caissa-game-fetcher.elcriollito.workers.dev;")
  .replace(
    '    <script src="js/play/play-route-controller.js?v=1.1.0"></script>',
    '    <script src="js/play/play-v2-fics-isolation.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-product-boundary.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-v2-beta-entry.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-route-controller.js?v=1.1.0"></script>'
  )
  .replace('    <script src="js/play/post-game-experience.js?v=1.8.0"></script>',
    '    <script src="js/play/post-game-core.js?v=1.0.0"></script>')
  .replace('<body data-clarity-mask>', '<body data-caissa-play-v2-entry="qa-only" data-clarity-mask>')
  .replace(/[ \t]+(?=\r?$)/gm, '');

if (!html.includes('data-caissa-play-v2-entry="qa-only"')) throw new Error('PLAY_V2_BODY_MARKER_MISSING');
if (!html.includes('js/play/play-v2-fics-isolation.js?v=1.0.0')) throw new Error('PLAY_V2_CONTRACT_MISSING');
if (!html.includes('js/play/play-v2-product-boundary.js?v=1.0.0')) throw new Error('PLAY_V2_PRODUCT_BOUNDARY_MISSING');
if (!html.includes('js/play/play-v2-beta-entry.js?v=1.0.0')) throw new Error('PLAY_V2_BETA_ENTRY_CONTRACT_MISSING');
if (!html.includes("worker-src 'self';") || /worker-src[^;]*(?:blob:|https?:)/.test(html))
  throw new Error('PLAY_V2_WORKER_CSP_INVALID');
if (/script-src[^;]*'unsafe-eval'/.test(html)) throw new Error('PLAY_V2_UNSAFE_EVAL_CSP');
const resourceElements = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
const prohibitedResources = resourceElements.filter(element =>
  /js\/play\/players\//i.test(element)
  || (/fics/i.test(element) && !/play-v2-fics-isolation\.js/i.test(element))
  || (/(?:academy|coach|mentor|guided[-_/]?replay|educational|knowledge|training[-_/]?memory|mastery|endgame[-_/]?(?:trainer|library))/i.test(element)
    && !/play-v2-product-boundary\.js/i.test(element))
);
if (prohibitedResources.length) throw new Error(`PROHIBITED_PLAY_V2_RESOURCE: ${prohibitedResources.join(', ')}`);
if (/id="(?:academySection|mentorPanel|analyzeMentor)"|data-section="(?:academy|mentor)"|href="\/endgame-(?:trainer|practice|library)"/i.test(html))
  throw new Error('PROHIBITED_PLAY_V2_EDUCATIONAL_DOM');
if (/caissa-onboarding/i.test(resourceElements.join('\n'))) throw new Error('PROHIBITED_PLAY_V2_ONBOARDING_RESOURCE');

await writeFile(outputPath, html);
console.log('Generated play-v2.html from index.html');
