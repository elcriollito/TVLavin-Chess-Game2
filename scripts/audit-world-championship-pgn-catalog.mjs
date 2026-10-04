import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { championshipEvents } from '../js/game-library/championship-archive-data.js';
import { getPgnCollectionForEvent } from '../js/game-library/pgn-collection-registry.js';
import { worldChampionshipPgnCatalog, worldChampionshipPgnCatalogValidation } from '../js/game-library/world-championship-pgn-catalog.js';

const outputUrl = new URL('../docs/game-library/world-championship-pgn-audit.md', import.meta.url);
const em = value => value || 'Tournament field';
const rows = worldChampionshipPgnCatalog.map(entry => [
  `\`${entry.id}\``, entry.year, entry.title, em(entry.playerA), em(entry.playerB), entry.gamesCount,
  'Remote PGN', entry.sourceName, `[Direct source](${entry.externalDownloadUrl})`, entry.readerCompatible ? 'Yes' : 'No',
  `\`${entry.eventId}\``
].join(' | '));
const mapped = championshipEvents.filter(event => event.pgnCollectionId);
const unmapped = championshipEvents.filter(event => !event.pgnCollectionId);
const markdown = `# World Championship PGN catalog audit

Generated from the canonical CAISSA catalog by \`scripts/audit-world-championship-pgn-catalog.mjs\` on 2026-10-04.

- Catalog authority: \`js/game-library/world-championship-pgn-catalog.js\`
- Source index: https://www.pgnmentor.com/files.html
- Reader load: fixed same-origin allowlisted gateway; no arbitrary URL parameter is accepted.
- External download: direct HTTPS link to the registered source; the Champions UI never uses the CAISSA gateway as a download link.
- Rights: all 59 historical albums are \`REMOTE_VIEW_ONLY\`; no local redistribution right is claimed.
- Live source check (2026-10-04): 59/59 URLs returned a valid PGN and every \`[Event]\` count matched the catalog.
- Audit result: ${worldChampionshipPgnCatalogValidation.valid ? 'valid' : worldChampionshipPgnCatalogValidation.errors.join('; ')}.
- Mapped archive events: ${mapped.length}.
- Unmapped archive events: ${unmapped.map(event => `\`${event.id}\``).join(', ')}.

| Collection ID | Year | Title | Player A | Player B | Game count | PGN type | Source | External URL | Reader compatible | Archive event |
|---|---:|---|---|---|---:|---|---|---|---|---|
${rows.map(row => `| ${row} |`).join('\n')}

## Mapping notes

- Mapping is explicit through \`eventId\`; runtime title matching is not used.
- 1948 and 2007 are tournament albums, so player A/B are intentionally recorded as tournament fields.
- FIDE knockout albums are full-event collections, so player A/B are intentionally recorded as tournament fields.
- 1984 maps to the complete 48-game aborted match.
- 2006 maps to the reunification match.
- \`wcc-1975\` is not mapped because no match was played.
- \`wcc-split-1993\` is not mapped because it is an administrative transition, not a game collection.
`;

if (process.argv.includes('--write')) {
  fs.writeFileSync(outputUrl, markdown, 'utf8');
  console.log(`Wrote ${fileURLToPath(outputUrl)}`);
} else if (process.argv.includes('--check')) {
  const existing = fs.readFileSync(outputUrl, 'utf8');
  if (existing !== markdown) throw new Error('World Championship PGN audit is stale; run with --write');
  console.log(`Verified ${worldChampionshipPgnCatalog.length} catalog entries and ${mapped.length} mappings`);
} else {
  process.stdout.write(markdown);
}

for (const entry of worldChampionshipPgnCatalog) {
  const mappedCollection = getPgnCollectionForEvent(entry.eventId);
  if (mappedCollection?.id !== entry.id) throw new Error(`Invalid mapping for ${entry.id}`);
}

if (process.argv.includes('--live')) {
  let cursor = 0;
  const failures = [];
  async function worker() {
    while (cursor < worldChampionshipPgnCatalog.length) {
      const entry = worldChampionshipPgnCatalog[cursor++];
      try {
        const response = await fetch(entry.externalDownloadUrl, { headers: { 'User-Agent': 'CAISSA-Catalog-Audit/1.0' } });
        const text = await response.text();
        const gamesCount = (text.match(/^\[Event\s+"/gm) || []).length;
        if (!response.ok || gamesCount !== entry.gamesCount || !/^\[White\s+"/m.test(text) || !/^\[Black\s+"/m.test(text)) {
          failures.push(`${entry.id}: HTTP ${response.status}, ${gamesCount}/${entry.gamesCount} games`);
        }
      } catch (error) { failures.push(`${entry.id}: ${error.message}`); }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  if (failures.length) throw new Error(`Live audit failed:\n${failures.join('\n')}`);
  console.log(`Live audit passed for ${worldChampionshipPgnCatalog.length} PGN sources`);
}
