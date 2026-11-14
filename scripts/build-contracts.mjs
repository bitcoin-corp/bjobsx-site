// Writes the static copies of data/contracts.json into the pages, so they paint (and work without JavaScript)
// before /api/contracts answers:
//   index.html     <script type="application/json" id="jobs-data">  the home carousel's first paint
//   contracts.html between <!-- contracts:SCOPE --> and <!-- /contracts:SCOPE -->  the contract cards
// Usage: pnpm contracts          (write)
//        pnpm contracts --check  (exit 1 if a page is out of date; the tests run this)
// House contracts only: the registry is read live by /api/contracts, never baked in.
import { readFileSync, writeFileSync } from 'node:fs';
import { listContracts } from '../api/_contracts.js';
import { homeRows, contractArticle, gridFor } from '../lib/contracts-view.js';

const root = new URL('../', import.meta.url);
const check = process.argv.includes('--check');

export async function render() {
  const { contracts } = await listContracts({ registryUrl: '' });
  const ids = contracts.map((c) => c.id);
  if (new Set(ids).size !== ids.length) throw new Error('Two contracts share an id.');
  const out = {};

  const index = readFileSync(new URL('index.html', root), 'utf8');
  const snap = '[\n' + homeRows(contracts).map((r) => '  ' + JSON.stringify(r).replace(/</g, '\\u003c')).join(',\n') + '\n]';
  const re = /(<script type="application\/json" id="jobs-data">)[\s\S]*?(<\/script>)/;
  if (!re.test(index)) throw new Error('index.html has no #jobs-data block.');
  out['index.html'] = index.replace(re, (_, a, b) => a + snap + b);

  let page = readFileSync(new URL('contracts.html', root), 'utf8');
  const scopes = [...page.matchAll(/<!-- contracts:([^ ]+) -->/g)].map((m) => m[1]);
  const own = scopes.filter((s) => s !== '*');
  for (const scope of scopes) {
    const q = scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cards = gridFor(contracts, scope, own).map(contractArticle).join('\n\n');
    page = page.replace(new RegExp(`(<!-- contracts:${q} -->)[\\s\\S]*?(<!-- /contracts:${q} -->)`), (_, a, b) => (cards ? `${a}\n${cards}\n${b}` : a + b));
  }
  out['contracts.html'] = page;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = await render();
  let stale = [];
  for (const [f, text] of Object.entries(out)) {
    const was = readFileSync(new URL(f, root), 'utf8');
    if (was === text) continue;
    stale.push(f);
    if (!check) writeFileSync(new URL(f, root), text);
  }
  if (check && stale.length) { console.error(`Out of date: ${stale.join(', ')}. Run pnpm contracts.`); process.exit(1); }
  console.log(stale.length ? `${check ? 'Stale' : 'Wrote'}: ${stale.join(', ')}` : 'Pages match data/contracts.json.');
}
