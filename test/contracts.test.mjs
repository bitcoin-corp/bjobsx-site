import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler from '../api/contracts.js';
import { render } from '../scripts/build-contracts.mjs';
import { contractArticle, normalise, posterLine, posterShort, homeRows } from '../lib/contracts-view.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; delete process.env.CONTRACTS_REGISTRY_URL; delete process.env.POST_CONTRACT_URL; });

async function call(method = 'GET') {
  const res = { code: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ method, query: {}, headers: {} }, res);
  return res;
}
const house = JSON.parse(readFileSync(new URL('../data/contracts.json', import.meta.url), 'utf8')).contracts;

test('GET: every house contract, open first, cached 60 s at the CDN, no post link by default', async () => {
  const r = await call();
  assert.equal(r.code, 200);
  assert.equal(r.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=300');
  const cs = r.body.contracts;
  assert.deepEqual(cs.map((c) => c.id).sort(), house.map((c) => c.id).sort());
  assert.equal(new Set(cs.map((c) => c.id)).size, cs.length);
  const rank = { open: 0, taken: 1, done: 2 };
  assert.deepEqual(cs.map((c) => rank[c.status]), [...cs.map((c) => rank[c.status])].sort());
  for (const c of cs) {
    for (const k of ['id', 'ref', 'version', 'status', 'title', 'line', 'scope', 'kind', 'pay', 'time', 'color', 'href']) assert.ok(c[k], `${c.id}.${k}`);
    assert.ok(c.art || c.ghost, c.id);
    assert.equal(c.room, false);
    assert.deepEqual(c.poster, { house: true, name: 'The Bitcoin Corporation Ltd', handle: '', short: 'bCorp' });
  }
  assert.equal(r.body.postUrl, null);
  assert.equal(r.body.registry, 'off');
  assert.equal((await call('POST')).code, 405);
});

test('post link only for an https POST_CONTRACT_URL', async () => {
  process.env.POST_CONTRACT_URL = 'https://www.bchatx.com/contracts/new?return=https://bjobsx.com/contracts';
  assert.equal((await call()).body.postUrl, process.env.POST_CONTRACT_URL);
  process.env.POST_CONTRACT_URL = 'javascript:alert(1)';
  assert.equal((await call()).body.postUrl, null);
});

test('registry: merged by id (registry wins, house is the fallback), rows cleaned, never ours unless the id is', async () => {
  process.env.CONTRACTS_REGISTRY_URL = 'https://www.bit-sign.online/api/bitsign/contracts?status=open';
  let asked = '';
  globalThis.fetch = async (u) => { asked = String(u); return new Response(JSON.stringify({ contracts: [
    { id: 'tn-01', title: 'Level pack format and checker', version: '2', status: 'taken' },
    { id: 'org-1', title: 'Fix <script>alert(1)</script>', line: 'x', poster: { legalName: 'Acme Widgets Ltd', handle: 'acme' }, art: 'javascript:alert(1)', href: 'javascript:alert(1)', color: 'red;}', pay: '2 BSV' },
    { id: 'Bad id!', title: 'dropped' },
    { id: 'org-2', title: 'no poster, dropped' },
    { id: 'fake', title: 'claims to be us', poster: { legalName: 'The Bitcoin Corporation Ltd' } },
    { id: 'tn-03', poster: { legalName: 'Someone Else Ltd' } },
  ] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const r = await call();
  assert.equal(asked, process.env.CONTRACTS_REGISTRY_URL);
  assert.equal(r.body.registry, 'ok');
  const by = Object.fromEntries(r.body.contracts.map((c) => [c.id, c]));
  assert.equal(by['tn-01'].version, '2');
  assert.equal(by['tn-01'].status, 'taken');
  assert.equal(by['tn-01'].poster.house, true);
  assert.equal(by['tn-01'].detail.anchor, 'c01'); // house detail kept when the registry row has none
  assert.equal(r.body.contracts.at(-1).id, 'tn-01'); // taken goes after the open ones
  assert.deepEqual(by['org-1'].poster, { house: false, name: 'Acme Widgets Ltd', handle: '$acme', short: '$acme' });
  assert.equal(by['org-1'].art, '');
  assert.equal(by['org-1'].href, '/contracts');
  assert.equal(by['org-1'].color, '#ffd24d');
  assert.ok(!by['bad id!'] && !by['org-2']);
  assert.equal(by.fake.poster.house, false);
  assert.equal(by['tn-03'].poster.house, false);
  assert.equal(by['tn-03'].poster.name, 'Someone Else Ltd');
});

test('registry down, wrong shape or slow: skipped quietly, house contracts still served', async () => {
  process.env.CONTRACTS_REGISTRY_URL = 'https://www.bit-sign.online/api/bitsign/contracts?status=open';
  globalThis.fetch = async () => new Response('Not Found', { status: 404 });
  let r = await call();
  assert.equal(r.code, 200); assert.equal(r.body.registry, 'skipped'); assert.equal(r.body.contracts.length, house.length);
  globalThis.fetch = async () => new Response('{"oops":1}', { status: 200 });
  assert.equal((await call()).body.registry, 'skipped');
  globalThis.fetch = (u, o) => new Promise((_, no) => o.signal.addEventListener('abort', () => no(o.signal.reason)));
  const t = Date.now();
  r = await call();
  assert.ok(Date.now() - t < 4000);
  assert.equal(r.body.registry, 'skipped'); assert.equal(r.body.contracts.length, house.length);
});

test('poster wording (CEO, 14 Nov) and the card short form', () => {
  const ours = normalise({ id: 'a', title: 't' }, { house: true });
  assert.equal(posterLine(ours), 'Posted and paid by The Bitcoin Corporation Ltd');
  assert.equal(posterShort(ours), 'Posted by bCorp');
  const theirs = normalise({ id: 'b', title: 't', poster: { legalName: 'Acme Widgets Ltd', handle: '$acme' } });
  assert.equal(posterLine(theirs), "Posted and paid by Acme Widgets Ltd ($acme). bCorp runs bJobsX and isn't a party to this contract. bCorp doesn't hold the payment.");
  assert.equal(posterShort(theirs), 'Posted by $acme');
});

test('cards: claim only when open, taken/done say so, room link only when room is true, all text escaped', () => {
  const base = { ...house[0] };
  const open = contractArticle(normalise(base, { house: true }));
  assert.match(open, /<a class="btn btn-gold" href="mailto:support@bwalletx\.com\?subject=Contract%20TN-01&amp;body=[^"]+">Claim TN-01<\/a>/);
  assert.ok(!open.includes('Talk about this contract'));
  const taken = contractArticle(normalise({ ...base, status: 'taken' }, { house: true }));
  assert.ok(!taken.includes('Claim TN-01') && taken.includes('Taken'));
  const done = contractArticle(normalise({ ...base, status: 'done' }, { house: true }));
  assert.ok(!done.includes('Claim TN-01') && done.includes('Done'));
  const room = contractArticle(normalise({ ...base, room: true }, { house: true }));
  assert.ok(room.includes('href="https://www.bchatx.com/contracts/tn-01/talk">Talk about this contract'));
  const evil = contractArticle(normalise({ id: 'x', title: '<img src=x onerror=alert(1)>', poster: { name: '"><b>' }, detail: { build: '`<script>`', done: ['<i>'], claim: { href: 'javascript:alert(1)' } } }));
  assert.ok(!/<img|<script|<i>|"><b>/.test(evil));
  assert.ok(!evil.includes('javascript:'));
  assert.equal(homeRows([normalise({ ...base, status: 'done' }, { house: true })]).length, 0);
});

test('the pages carry the current data (pnpm contracts) and the CEO-reviewed claim terms', async () => {
  const out = await render();
  for (const [f, text] of Object.entries(out)) assert.equal(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), text, `${f} is out of date: run pnpm contracts`);
  const page = out['contracts.html'];
  for (const s of ['reply "I accept" with your full legal name, matching your Veriff check', 'You must be 18 or over.', 'mailto:support@bwalletx.com?subject=Contract%20TN-01', 'Open a pull request', 'Title it with the id', 'Payment is for merged work only.']) assert.ok(page.includes(s), s);
});
