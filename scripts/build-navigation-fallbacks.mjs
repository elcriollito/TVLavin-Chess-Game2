import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const navigationSource = await readFile(new URL('js/caissa-primary-navigation.js', root), 'utf8');
const documentStub = { querySelectorAll: () => [] };
const sandbox = { window: {}, document: documentStub };
vm.runInNewContext(navigationSource, sandbox, { filename: 'caissa-primary-navigation.js' });
const navigation = sandbox.window.CaissaPrimaryNavigation;
const checkOnly = process.argv.includes('--check');

function replaceElementContents(html, attribute, content) {
  const openPattern = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\b${attribute}(?:=["'][^"']*["'])?[^>]*>`, 'i');
  const match = openPattern.exec(html);
  if (!match) throw new Error(`NAVIGATION_FALLBACK_HOST_MISSING: ${attribute}`);
  const tag = match[1];
  const tokenPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = match.index + match[0].length;
  let depth = 1;
  let token;
  while ((token = tokenPattern.exec(html))) {
    depth += token[0][1] === '/' ? -1 : 1;
    if (depth === 0) {
      const start = match.index + match[0].length;
      return `${html.slice(0, start)}${content}${html.slice(token.index)}`;
    }
  }
  throw new Error(`NAVIGATION_FALLBACK_HOST_UNCLOSED: ${attribute}`);
}

async function build(file, adapterName, activeKey) {
  const url = new URL(file, root);
  const original = await readFile(url, 'utf8');
  const adapter = navigation.adapters[adapterName];
  const options = { activeKey };
  let generated = replaceElementContents(
    original,
    'data-caissa-primary-groups',
    `${adapter.renderGroups(options)}${adapter.renderConnect(options)}`
  );
  generated = replaceElementContents(
    generated,
    'data-caissa-primary-support',
    adapter.renderSupport(options)
  );
  if (checkOnly && generated !== original) throw new Error(`NAVIGATION_FALLBACK_OUTDATED: ${file}`);
  if (!checkOnly) await writeFile(url, generated);
}

await build('index.html', 'application', '');
await build('yahoo-classic.html', 'application', 'yahooClassic');
await build('play-v2-public-beta.html', 'application', 'play');
await build('endgame-trainer.html', 'trainer', 'endgame-trainer');
console.log(checkOnly ? 'Navigation fallbacks are current' : 'Generated navigation fallbacks');
