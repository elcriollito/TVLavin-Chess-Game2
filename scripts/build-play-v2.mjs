import { readFile, writeFile } from 'node:fs/promises';

const sourcePath = new URL('../index.html', import.meta.url);
const outputPath = new URL('../play-v2.html', import.meta.url);

let html = await readFile(sourcePath, 'utf8');

const forbiddenElements = [
  /\s*<link[^>]+href="css\/fics-client\.css[^>]*>\r?\n/gi,
  /\s*<script[^>]+src="js\/fics-style12\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/fics-client\.js[^>]*><\/script>\r?\n/gi,
  /\s*<script[^>]+src="js\/play\/players\/[^">]+"[^>]*><\/script>\r?\n/gi,
  /\s*<!-- Lazy manifest order \(inert\):[^>]*players-panel\.js -->\r?\n/gi
];

for (const pattern of forbiddenElements) html = html.replace(pattern, '\n');

html = html
  .replace(/\s+ws:\/\/localhost:8081 ws:\/\/127\.0\.0\.1:8081 wss:\/\/fics-gateway\.caissa-chess\.org/g, '')
  .replace(
    '    <script src="js/play/play-route-controller.js?v=1.1.0"></script>',
    '    <script src="js/play/play-v2-fics-isolation.js?v=1.0.0"></script>\n' +
    '    <script src="js/play/play-route-controller.js?v=1.1.0"></script>'
  )
  .replace('<body data-clarity-mask>', '<body data-caissa-play-v2-entry="qa-only" data-clarity-mask>')
  .replace(/[ \t]+(?=\r?$)/gm, '');

if (!html.includes('data-caissa-play-v2-entry="qa-only"')) throw new Error('PLAY_V2_BODY_MARKER_MISSING');
if (!html.includes('js/play/play-v2-fics-isolation.js?v=1.0.0')) throw new Error('PLAY_V2_CONTRACT_MISSING');
const resourceElements = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
const prohibitedResources = resourceElements.filter(element =>
  /js\/play\/players\//i.test(element) || (/fics/i.test(element) && !/play-v2-fics-isolation\.js/i.test(element))
);
if (prohibitedResources.length) throw new Error(`PROHIBITED_PLAY_V2_RESOURCE: ${prohibitedResources.join(', ')}`);

await writeFile(outputPath, html);
console.log('Generated play-v2.html from index.html');
