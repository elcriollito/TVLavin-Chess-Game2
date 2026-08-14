import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://www.caissa-chess.org';
const contractId = 'CaissaPublicRouteInventory@1.0.0';

function loadNavigation() {
  const window = {};
  const document = { querySelectorAll: () => [] };
  vm.runInNewContext(read('js/caissa-primary-navigation.js'), { window, document });
  return window.CaissaPrimaryNavigation;
}

const navigation = loadNavigation();
const vercel = JSON.parse(read('vercel.json'));
const sitemapPaths = [...read('public/sitemap.xml').matchAll(/<loc>https:\/\/www\.caissa-chess\.org([^<]*)<\/loc>/g)]
  .map(match => match[1] || '/');
const exactRewrites = new Map(vercel.rewrites.filter(rule => !/[:*]/.test(rule.source)).map(rule => [rule.source, rule.destination]));
const groupIds = ['play-and-compete', 'learn-and-improve', 'analyze-and-watch', 'tools'];
const groupById = new Map(navigation.inventory.groups.flatMap((group, index) => group.map(item => [item.id, groupIds[index]])));

const primaryNavigation = [...navigation.inventory.primary, ...navigation.inventory.connect].map((item, index) => {
  const external = /^https?:|^mailto:/.test(item.route);
  return {
    id: item.id,
    label: item.label,
    canonicalPath: external ? null : item.route,
    absoluteUrl: external ? item.route : `${origin}${item.route}`,
    type: external ? 'external-destination' : 'internal-page',
    group: external ? 'connect-with-caissa-chess' : groupById.get(item.id),
    navigationPosition: index + 1,
    visibleInPrimaryNavigation: true,
    activeIdentity: external ? null : item.id,
    owner: 'CaissaPrimaryNavigation',
    target: item.newTab ? '_blank' : '_self',
    rel: item.newTab ? 'noopener noreferrer' : null,
    status: 'public',
    explicitClickRequired: external
  };
});

const additionalMetadata = new Map([
  ['/play/games', ['play-games', 'Play Games', 'PlayV2RouteController']],
  ['/play/bots', ['play-bots', 'Play Bots', 'PlayV2RouteController']],
  ['/play/coach', ['play-coach', 'Play Coach', 'PlayV2RouteController']],
  ['/about', ['about', 'About CAISSA Chess', 'CaissaPrimaryNavigation.support']],
  ['/help', ['help', 'Help', 'CaissaPrimaryNavigation.support']],
  ['/premium', ['premium', 'Premium', 'vercel.json']],
  ['/roadmap', ['roadmap', 'Roadmap', 'vercel.json']],
  ['/database', ['database', 'Chess Database', 'vercel.json']],
  ['/library', ['library-page', 'Library', 'vercel.json']],
  ['/signin', ['signin', 'Sign In', 'vercel.json']],
  ['/signup', ['signup', 'Sign Up', 'vercel.json']]
]);
for (const sitemapPath of sitemapPaths.filter(value => value.startsWith('/blog/'))) {
  const slug = sitemapPath.split('/').pop();
  additionalMetadata.set(sitemapPath, [`blog-${slug}`, slug.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' '), 'public/sitemap.xml']);
}

const primaryPaths = new Set(primaryNavigation.map(item => item.canonicalPath).filter(Boolean));
const playModePaths = new Set(vercel.redirects.filter(rule => rule.source.startsWith('/play/beta/')).map(rule => rule.destination));
const publicCanonicalRoutes = [...additionalMetadata].filter(([canonicalPath]) => {
  if (primaryPaths.has(canonicalPath)) return false;
  return exactRewrites.has(canonicalPath) || sitemapPaths.includes(canonicalPath) || playModePaths.has(canonicalPath);
}).map(([canonicalPath, [id, label, owner]]) => ({
  id, label, canonicalPath, absoluteUrl: `${origin}${canonicalPath}`, type: 'internal-page', group: null,
  navigationPosition: null, visibleInPrimaryNavigation: false, activeIdentity: id,
  owner, target: '_self', rel: null, status: 'public'
})).sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath));

const redirectsAndAliases = vercel.redirects.map(rule => ({
  id: `redirect-${rule.source.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}`,
  label: `${rule.source} to ${rule.destination}`,
  canonicalPath: rule.destination,
  absoluteUrl: `${origin}${rule.destination}`,
  type: 'redirect', owner: 'vercel.json and middleware', status: 'public',
  redirectFrom: rule.source, redirectTo: rule.destination, expectedStatus: rule.permanent ? 308 : 307
}));

const protectedRoutes = [
  { id: 'players', label: 'Players', canonicalPath: '/play/players', type: 'protected-route', owner: 'PlayV2RouteController', status: 'fail-closed', notes: 'Unavailable until CAISSA-native player infrastructure exists.' },
  { id: 'beta-qa', label: 'Play beta and QA descendants', canonicalPath: '/play/beta/:path*', type: 'protected-route-family', owner: 'middleware', status: 'fail-closed' },
  { id: 'direct-play-documents', label: 'Direct generated Play documents', canonicalPath: '/play-v2*.html', type: 'protected-route-family', owner: 'middleware', status: 'fail-closed', notes: 'Five allowlisted generated document names remain unavailable directly.' },
  { id: 'unknown-play-descendants', label: 'Unknown Play descendants', canonicalPath: '/play/:unknown', type: 'protected-route-family', owner: 'PlayV2BetaEntryGate', status: 'fail-closed' },
  { id: 'retired-beta-api', label: 'Retired beta API', canonicalPath: '/api/play-beta/:path*', type: 'protected-route-family', owner: 'middleware', status: 'fail-closed' }
];

const externalDestinations = primaryNavigation.filter(item => item.type === 'external-destination');
const counts = {
  primaryNavigationEntries: primaryNavigation.length,
  internalPrimaryPages: primaryNavigation.filter(item => item.type === 'internal-page').length,
  publicCanonicalRoutesNotInPrimaryNavigation: publicCanonicalRoutes.length,
  externalDestinations: externalDestinations.length,
  redirects: redirectsAndAliases.length,
  protectedRouteFamilies: protectedRoutes.length,
  totalInventoriedRecords: primaryNavigation.length + publicCanonicalRoutes.length + redirectsAndAliases.length + protectedRoutes.length
};

const inventory = {
  contractId, origin,
  sources: ['js/caissa-primary-navigation.js', 'js/play/play-route-controller.js', 'middleware.js', 'server.js', 'vercel.json', 'public/sitemap.xml'],
  counts, primaryNavigation, publicCanonicalRoutes, redirectsAndAliases, protectedRoutes, externalDestinations
};

const cell = value => String(value ?? '—').replaceAll('|', '\\|');
const table = (headers, rows) => `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.map(cell).join(' | ')} |`).join('\n')}`;
const markdown = `# CAISSA Public Route and Navigation Inventory

Contract: \`${contractId}\`

This document and [the machine-readable inventory](../../config/caissa-public-route-inventory.json) are generated deterministically from the routing and navigation owners. Do not edit either output manually.

## Sources of truth

${inventory.sources.map(source => `- \`${source}\``).join('\n')}

## Calculated summary

- Primary navigation entries: ${counts.primaryNavigationEntries}
- Internal primary pages: ${counts.internalPrimaryPages}
- Public canonical routes not in primary navigation: ${counts.publicCanonicalRoutesNotInPrimaryNavigation}
- External destinations: ${counts.externalDestinations}
- Redirects: ${counts.redirects}
- Protected route families: ${counts.protectedRouteFamilies}
- Total inventoried records: ${counts.totalInventoriedRecords}

## Primary navigation

${table(['Position', 'Group', 'Label', 'Canonical destination', 'Type', 'Owner'], primaryNavigation.map(item => [item.navigationPosition, item.group, item.label, item.canonicalPath || item.absoluteUrl, item.type, item.owner]))}

## Public canonical routes outside primary navigation

${table(['Label', 'Canonical path', 'Owner', 'Status'], publicCanonicalRoutes.map(item => [item.label, item.canonicalPath, item.owner, item.status]))}

## Redirects and aliases

${table(['From', 'To', 'Status', 'Owner'], redirectsAndAliases.map(item => [item.redirectFrom, item.redirectTo, item.expectedStatus, item.owner]))}

## Protected and fail-closed routes

${table(['Label', 'Route or family', 'Owner', 'Status'], protectedRoutes.map(item => [item.label, item.canonicalPath, item.owner, item.status]))}

## External destinations

${table(['Label', 'URL', 'Target', 'Rel', 'Explicit click'], externalDestinations.map(item => [item.label, item.absoluteUrl, item.target, item.rel, item.explicitClickRequired]))}

## Change rule

Any task that adds, removes, renames, redirects, protects, or reorders a public CAISSA destination must regenerate and validate CaissaPublicRouteInventory before checkpoint.

The visible order remains owned only by \`CaissaPrimaryNavigation\`; adapters must never introduce private navigation arrays. Add or remove a route in its real routing owner first, then run \`node scripts/build-caissa-public-route-inventory.mjs\` and the inventory guard.

\`PLAY & COMPETE\` includes the credited Playchess and Fritz gateways at positions 4 and 5. These routes embed public ChessBase services without changing CAISSA Play, CAISSA Classic, or FICS behavior.
`;

fs.mkdirSync(path.join(root, 'config'), { recursive: true });
fs.writeFileSync(path.join(root, 'config/caissa-public-route-inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
fs.writeFileSync(path.join(root, 'docs/architecture/CAISSA_PUBLIC_ROUTE_AND_NAVIGATION_INVENTORY.md'), markdown);
console.log(`Generated ${contractId}: ${counts.totalInventoriedRecords} records`);
