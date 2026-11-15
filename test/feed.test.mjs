import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/feed.js';
import { cleanFeed, flagged, postHTML, linkify, profileHref, FEED_SOURCE, BCHATX } from '../lib/feed-view.js';
import { isTokenPay, tokenPayNote, TOKEN_PAY_NOTE, normalise, contractArticle, homeRows } from '../lib/contracts-view.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

async function call(method = 'GET') {
  const res = { code: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  await handler({ method, query: {}, headers: {} }, res);
  return res;
}
const tx = (n) => String(n).repeat(64).slice(0, 64);
const source = { feed: 'bChat Open Feed', posts: [
  { txid: tx('a'), url: 'https://www.bitcoinchat.online/feed/p/' + tx('a'), text: 'Hello <script>alert(1)</script> see https://example.com/x?a=1&b=2.', author: { name: 'Ada <img src=x onerror=alert(1)>', handle: 'ada' }, source: 'bchat', sourceLabel: 'bChat', sourceUrl: 'javascript:alert(1)', at: 2000, likes: 3, replies: 1, replyTo: null, extra: 'dropped' },
  { txid: tx('b'), text: 'Not for work', author: { name: 'X' }, nsfw: true, at: 3000 },
  { txid: tx('c'), text: 'Blurred one', author: { name: 'Y' }, blurred: true, at: 3000 },
  { txid: tx('d'), text: 'Sensitive media', author: { name: 'Z' }, media: [{ sensitive: true }], at: 3000 },
  { txid: tx('e'), text: 'Labelled', author: { name: 'W' }, labels: ['NSFW'], at: 3000 },
  { txid: tx('f'), text: 'Newer, from Treechat', author: { name: 'Bo', handle: null, address: '1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH' }, sourceLabel: 'Treechat', sourceUrl: 'https://app.treechat.com/p/1', at: 5000, likes: -4 },
  { txid: tx('1'), text: '', author: { name: 'Empty' }, at: 1 },
  { txid: tx('a'), text: 'duplicate id', author: { name: 'Dup' }, at: 1 },
] };

test('GET: cleaned posts, newest first, only safe fields, cached 60 s', async () => {
  let asked = '';
  globalThis.fetch = async (u) => { asked = String(u); return new Response(JSON.stringify(source), { status: 200, headers: { 'content-type': 'application/json' } }); };
  const r = await call();
  assert.equal(asked, FEED_SOURCE);
  assert.equal(r.code, 200);
  assert.equal(r.headers['cache-control'], 'public, s-maxage=60, stale-while-revalidate=300');
  assert.equal(r.body.live, true);
  const ps = r.body.posts;
  assert.deepEqual(ps.map((p) => p.id), [tx('f'), tx('a')]);
  for (const p of ps) {
    assert.deepEqual(Object.keys(p).sort(), ['at', 'author', 'id', 'likes', 'replies', 'reply', 'sourceLabel', 'sourceUrl', 'text', 'url']);
    assert.deepEqual(Object.keys(p.author).sort(), ['handle', 'href', 'name']);
    assert.equal(p.url, `${BCHATX}/feed/p/${p.id}`);
  }
  const [bo, ada] = ps;
  assert.equal(ada.author.href, `${BCHATX}/u/ada`);
  assert.equal(ada.sourceUrl, '', 'javascript: link dropped');
  assert.equal(bo.author.href, `${BCHATX}/k/1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH`);
  assert.equal(bo.likes, 0);
  assert.equal((await call('POST')).code, 405);
});

test('nsfw, blurred and sensitive posts are dropped', () => {
  for (const p of source.posts.slice(1, 5)) assert.equal(flagged(p), true, p.text);
  assert.equal(flagged(source.posts[0]), false);
  const ids = cleanFeed(source).map((p) => p.id);
  for (const k of ['b', 'c', 'd', 'e']) assert.ok(!ids.includes(tx(k)), k);
  assert.equal(cleanFeed({ posts: [{ txid: tx('9'), text: 'x', author: { name: 'n', nsfw: 'true' } }] }).length, 0);
});

test('rendering escapes everything; only http(s) links become links', () => {
  const [, ada] = cleanFeed(source);
  const html = postHTML(ada, 10000);
  assert.ok(!/<script/i.test(html));
  assert.ok(!/<img/i.test(html));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Ada &lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('<a href="https://example.com/x?a=1&amp;b=2" target="_blank" rel="nofollow noopener ugc">'), 'link without the trailing full stop');
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes(`href="${BCHATX}/u/ada"`));
  assert.equal(linkify('javascript:alert(1) "x"'), 'javascript:alert(1) &quot;x&quot;');
  assert.ok(!/href="https:\/\/a\.b\/"/.test(linkify('https://a.b/"onmouseover=alert(1)')), 'a quote never closes the href');
  assert.equal(profileHref({ href: '/u/bob' }), `${BCHATX}/u/bob`);
  assert.equal(profileHref({ href: 'https://evil.example/u/bob' }), '');
  assert.equal(profileHref({ handle: '<b>' }), '');
});

test('slow, down or nonsense source: 200 with an empty list, never an error', async () => {
  globalThis.fetch = (u, opts) => new Promise((_, no) => opts.signal.addEventListener('abort', () => no(opts.signal.reason)));
  const t = Date.now();
  let r = await call();
  assert.ok(Date.now() - t < 5000, 'gives up at the timeout');
  assert.equal(r.code, 200);
  assert.deepEqual(r.body.posts, []);
  assert.equal(r.body.live, false);
  assert.equal(r.headers['cache-control'], 'public, s-maxage=15');
  globalThis.fetch = async () => { throw new Error('down'); };
  r = await call();
  assert.equal(r.code, 200); assert.deepEqual(r.body.posts, []);
  globalThis.fetch = async () => new Response('<html>oops</html>', { status: 502 });
  r = await call();
  assert.equal(r.code, 200); assert.deepEqual(r.body.posts, []);
  globalThis.fetch = async () => new Response(JSON.stringify({ posts: 'nope' }), { status: 200 });
  r = await call();
  assert.equal(r.code, 200); assert.deepEqual(r.body.posts, []);
});

test('pay not in BSV carries the CEO token line; BSV pay does not', () => {
  assert.equal(TOKEN_PAY_NOTE, "Paid in a token, not BSV. bCorp doesn't value or endorse it.");
  assert.equal(isTokenPay({ pay: '1 BSV' }), false);
  assert.equal(isTokenPay({ pay: 'Up to 10 BSV' }), false);
  assert.equal(isTokenPay({ pay: '50,000 $ACME' }), true);
  assert.equal(isTokenPay({ pay: '' }), false);
  assert.equal(isTokenPay({ pay: '1 BSV', payUnit: 'ACME' }), true, 'the unit wins over the text');
  assert.equal(isTokenPay({ pay: '1', payUnit: 'bsv' }), false);
  const row = { id: 'org-2', title: 'Logo', status: 'open', poster: { legalName: 'Acme Widgets Ltd' }, pay: { amount: '50,000', unit: '$ACME' } };
  const c = normalise(row);
  assert.equal(c.pay, '50,000 $ACME', 'shown exactly as given');
  assert.equal(c.payUnit, '$ACME');
  assert.equal(tokenPayNote(c), TOKEN_PAY_NOTE);
  assert.equal(homeRows([c])[0].payUnit, '$ACME');
  assert.ok(contractArticle(c).includes("Paid in a token, not BSV. bCorp doesn't value or endorse it."));
  const bsv = normalise({ ...row, pay: '1 BSV' });
  assert.equal(tokenPayNote(bsv), '');
  assert.ok(!contractArticle(bsv).includes('Paid in a token'));
});
