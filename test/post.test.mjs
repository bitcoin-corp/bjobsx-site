// /post: the form model (lib/post-form.js), the card preview (same renderer as /contracts), the markdown preview
// (lib/md.js) and the client that sends a job to the bit-sign registry (lib/post-client.js).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDraft, cleanDraft, validate, toRow, toPayload, fieldFromApi, normTicker, MSG, CATEGORIES } from '../lib/post-form.js';
import { createPostClient, submit, endpoint, mapResponse } from '../lib/post-client.js';
import { normalise, contractArticle, payNotes, TOKEN_PAY_NOTE } from '../lib/contracts-view.js';
import { mdToHtml, mdToText } from '../lib/md.js';
import configHandler, { postConfig, DEFAULT_VERIFF_URL } from '../api/post-config.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const good = () => ({
  ...emptyDraft(),
  title: 'Checkout flow for a shop', summary: 'A two-step checkout with BRC-100 pay.', description: 'Build **it**.\n\n- `src/checkout/`',
  category: 'Software', doneWhen: 'A test wallet can buy one item.', time: 'About 3 hours',
  pay: [{ type: 'bsv', amount: '0.5' }, { type: 'equity', company: 'Acme Widgets Ltd', number: 'sc 123456' }],
  readRules: true,
});
const card = (d, who = {}) => contractArticle(normalise(toRow(d, who)));

// ── form ─────────────────────────────────────────────────────────────────────
test('a new form: one empty BSV part, open to all, IP assigned, English law; every required field flagged in order', () => {
  const d = emptyDraft();
  assert.deepEqual(d.pay, [{ type: 'bsv', amount: '' }]);
  assert.equal(d.takers, 'open'); assert.equal(d.ip, 'assign'); assert.equal(d.law, 'England and Wales');
  assert.deepEqual(CATEGORIES, ['Software', 'Design', 'Content', 'Research', 'Testing your own systems', 'Token work']);
  assert.deepEqual(Object.keys(validate(d)), ['title', 'summary', 'description', 'category', 'doneWhen', 'time', 'pay.0.amount', 'readRules']);
  assert.deepEqual(validate(good()), {});
});

test('pay checks: BSV amount, token ticker and amount (or terms), company name and Companies House number', () => {
  const v = (pay) => validate({ ...good(), pay });
  assert.equal(v([])['pay'], MSG.pay);
  assert.equal(v([{ type: 'bsv', amount: '0' }])['pay.0.amount'], MSG.bsv);
  assert.equal(v([{ type: 'bsv', amount: 'lots' }])['pay.0.amount'], MSG.bsv);
  assert.deepEqual(v([{ type: 'bsv', amount: '.25' }]), {});
  assert.equal(v([{ type: 'token', ticker: '', amount: '5' }])['pay.0.ticker'], MSG.ticker);
  assert.equal(v([{ type: 'token', ticker: '$ACME', amount: '' }])['pay.0.amount'], MSG.tokenAmount);
  assert.deepEqual(v([{ type: 'token', ticker: 'acme', amount: '50,000' }]), {});
  assert.deepEqual(v([{ type: 'token', ticker: '$ACME', amount: '', terms: true }]), {});
  assert.equal(v([{ type: 'equity', company: '', number: '16735102' }])['pay.0.company'], MSG.company);
  assert.equal(v([{ type: 'equity', company: 'Acme Ltd (5%)', number: '16735102' }])['pay.0.company'], MSG.companyTerms);
  assert.equal(v([{ type: 'equity', company: 'Acme Ltd', number: '1234' }])['pay.0.number'], MSG.number);
  assert.equal(normTicker(' acme '), '$ACME');
});

test('licence, law, promotion and the rules box', () => {
  assert.equal(validate({ ...good(), ip: 'licence', licence: '' }).licence, MSG.licence);
  assert.equal(validate({ ...good(), law: ' ' }).law, MSG.law);
  const p = validate({ ...good(), promotes: true });
  assert.deepEqual([p.promoBasis, p.promoText, p.promoLawful], [MSG.promoBasis, MSG.promoText, MSG.promoLawful]);
  assert.deepEqual(validate({ ...good(), promotes: true, promoBasis: 'exempt', promoText: 'Art. 19 investment professionals', promoLawful: true }), {});
  assert.equal(validate({ ...good(), readRules: false }).readRules, MSG.readRules);
});

test('a draft from localStorage is cleaned: unknown fields and types dropped, at most four pay parts', () => {
  const d = cleanDraft({ title: 'x'.repeat(500), category: 'Gambling', takers: 'everyone', adult: 'yes', pay: [{ type: 'equity', company: 'A', shares: 5000, pct: 5 }, null, { type: 'evil' }, {}, {}, {}], hack: '<script>' });
  assert.equal(d.title.length, 140); assert.equal(d.category, ''); assert.equal(d.takers, 'open'); assert.equal(d.adult, false);
  assert.equal(d.pay.length, 3);
  assert.deepEqual(d.pay[0], { type: 'equity', company: 'A', number: '' });
  assert.ok(!('hack' in d));
  assert.deepEqual(cleanDraft(null), emptyDraft());
});

// ── preview card ─────────────────────────────────────────────────────────────
test('preview: the /contracts card, with the poster line, BSV + equity and the CEO shares notice (no share count)', () => {
  const html = card(good(), { alias: 'acme' });
  assert.match(html, /<article class="contract" aria-labelledby="c-preview"/);
  assert.ok(html.includes('<h3 id="c-preview">Checkout flow for a shop</h3>'));
  assert.ok(html.includes('<span class="pay">0.5 BSV + equity in Acme Widgets Ltd</span>'));
  assert.ok(html.includes('<span class="badge equity">Equity</span>'));
  assert.ok(html.includes("Posted and paid by Your legal name ($acme). bCorp runs bJobsX and isn&#39;t a party") || html.includes("Posted and paid by Your legal name ($acme). bCorp runs bJobsX and isn't a party"));
  assert.ok(html.includes("Pay includes shares in Acme Widgets Ltd. Terms are given to the chosen contractor. bCorp doesn't value or endorse them."));
  assert.ok(!html.includes(TOKEN_PAY_NOTE));
  assert.ok(html.includes('<li>A test wallet can buy one item.</li>'));
  assert.ok(html.includes('Build it. <code>src/checkout/</code>.'));
  assert.ok(!/claim|mailto/.test(html));
});

test('preview: token pay shows the token notice; "terms given" when there is no amount; empty fields get placeholders', () => {
  const tok = card({ ...good(), pay: [{ type: 'token', ticker: 'acme', amount: '50,000' }] });
  assert.ok(tok.includes('<span class="pay">50,000 $ACME</span>'));
  assert.ok(tok.includes("Paid in a token, not BSV. bCorp doesn't value or endorse it."));
  const terms = card({ ...good(), pay: [{ type: 'bsv', amount: '1' }, { type: 'token', ticker: '$ACME', amount: '9', terms: true }] });
  assert.ok(terms.includes('1 BSV + $ACME (terms given to the chosen contractor)'));
  assert.ok(terms.includes(TOKEN_PAY_NOTE));
  const empty = card(emptyDraft());
  assert.ok(empty.includes('Your job title') && empty.includes('… BSV') && empty.includes('Posted and paid by Your legal name.'));
  const eq = normalise(toRow({ ...emptyDraft(), pay: [{ type: 'equity', company: '', number: '' }] }));
  assert.deepEqual(payNotes(eq), ["Pay includes shares in the company. Terms are given to the chosen contractor. bCorp doesn't value or endorse them."]);
  assert.equal(card({ ...good(), legalName: 'Ada Testwright' }).includes('Posted and paid by Ada Testwright.'), true);
});

test('preview: everything typed is escaped', () => {
  const html = card({ ...good(), title: '<img src=x onerror=alert(1)>', doneWhen: '<script>x</script>', description: '<b onclick=x>', pay: [{ type: 'equity', company: '"><svg onload=1>', number: '16735102' }] });
  assert.ok(!/<img|<script|<svg|<b /.test(html));
});

// ── markdown ─────────────────────────────────────────────────────────────────
test('markdown preview: the marks we allow, and nothing else', () => {
  assert.equal(mdToHtml('## Hi\n**b** *i* `<x>`'), '<h5>Hi</h5>\n<p><strong>b</strong> <em>i</em> <code>&lt;x&gt;</code></p>');
  assert.equal(mdToHtml('- a\n- b\n\n1. c'), '<ul><li>a</li><li>b</li></ul>\n<ol><li>c</li></ol>');
  assert.equal(mdToHtml('[ok](https://x.y/z)'), '<p><a href="https://x.y/z" target="_blank" rel="noopener nofollow ugc">ok</a></p>');
  assert.equal(mdToHtml('[no](javascript:alert(1))'), '<p>[no](javascript:alert(1))</p>');
  assert.ok(!/<script|<img|onerror="/.test(mdToHtml('<script>alert(1)</script>\n<img src=x onerror="y">\n```\n<b>\n```')));
  assert.equal(mdToText('# Head\nA **b** line\n- item [l](https://x)'), 'A b line. item l.');
});

// ── client ───────────────────────────────────────────────────────────────────
test('client: no base URL -> nothing is sent, ever', async () => {
  let calls = 0;
  const f = async () => { calls++; return new Response('{}'); };
  globalThis.fetch = f;
  for (const base of ['', null, undefined, 'http://insecure.example', 'javascript:alert(1)', '//evil.example']) {
    const c = createPostClient({ base, fetch: f });
    assert.equal(c.enabled, false, String(base));
    assert.deepEqual(await c.submit(good()), { unavailable: true });
  }
  assert.deepEqual(await submit(good()), { unavailable: true });
  assert.equal(calls, 0);
});

test('client: posts the payload as JSON to <base>/api/bitsign/contracts and maps ok / errors / needs', async () => {
  assert.equal(endpoint('https://www.bit-sign.online/'), 'https://www.bit-sign.online/api/bitsign/contracts');
  assert.equal(endpoint('https://www.bit-sign.online/api/bitsign/contracts'), 'https://www.bit-sign.online/api/bitsign/contracts');
  let seen;
  const reply = (status, body) => async (url, init) => { seen = { url, init }; return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); };
  const base = 'https://www.bit-sign.online';
  let r = await createPostClient({ base, fetch: reply(201, { id: 'c_123', status: 'pending_review' }) }).submit(good(), { identityKey: '02ab' });
  assert.deepEqual(r, { ok: true, id: 'c_123', status: 'pending_review' });
  assert.equal(seen.url, 'https://www.bit-sign.online/api/bitsign/contracts');
  assert.equal(seen.init.method, 'POST'); assert.equal(seen.init.credentials, 'include');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.site, 'bjobsx.com'); assert.equal(body.identity_key, '02ab'); assert.equal(body.line, 'A two-step checkout with BRC-100 pay.');
  assert.deepEqual(body.pay_parts, [{ unit: 'BSV', amount: '0.5' }, { unit: 'equity', company: 'Acme Widgets Ltd', company_number: 'SC123456' }]);
  assert.ok(!/share_count|percent|pct/.test(seen.init.body));
  assert.deepEqual([body.takers, body.adult, body.ip, body.governing_law, body.promotion, body.read_rules], ['open', false, { mode: 'assign' }, 'England and Wales', null, true]);

  r = await createPostClient({ base, fetch: reply(422, { errors: { title: 'Too vague.', 'pay_parts.1.company_number': 'Not on Companies House.', done_when: 'Needs a test.', weird: 'Something else.' } }) }).submit(good());
  assert.deepEqual(r, { errors: { title: 'Too vague.', 'pay.1.number': 'Not on Companies House.', doneWhen: 'Needs a test.', _form: 'Something else.' } });
  r = await createPostClient({ base, fetch: reply(400, { errors: [{ field: 'line', message: 'One line, please.' }, { field: 'pay_parts[0].ticker', message: 'Unknown token.' }] }) }).submit(good());
  assert.deepEqual(r, { errors: { summary: 'One line, please.', 'pay.0.ticker': 'Unknown token.' } });
  r = await createPostClient({ base, fetch: reply(403, { needs: ['veriff', 'legal_name', 'uk_resident', 'companies_house', '<bad>'] }) }).submit(good());
  assert.deepEqual(r, { needs: ['veriff', 'legal_name', 'uk_resident', 'companies_house'] });
  assert.deepEqual(await createPostClient({ base, fetch: reply(401, {}) }).submit(good()), { needs: ['connect'] });
  assert.match((await createPostClient({ base, fetch: reply(500, { error: 'Registry down.' }) }).submit(good())).error, /Registry down/);
  assert.match((await createPostClient({ base, fetch: reply(200, {}) }).submit(good())).error, /didn’t confirm/);
  assert.match((await createPostClient({ base, fetch: async () => { throw new Error('offline'); } }).submit(good())).error, /couldn’t reach/);
});

test('client: registry field names map back to the form', () => {
  assert.equal(fieldFromApi('governing_law'), 'law');
  assert.equal(fieldFromApi('promotion.statement'), 'promoText');
  assert.equal(fieldFromApi('pay_parts.2.ticker'), 'pay.2.ticker');
  assert.equal(fieldFromApi('pay_parts.9.ticker'), 'pay');
  assert.equal(fieldFromApi('nope'), '');
  assert.deepEqual(mapResponse(201, { id: 7, errors: {} }), { ok: true, id: '7', status: 'pending_review' });
});

test('payload: licence, promotion, legal name and UK residence go through when given', () => {
  const p = toPayload({ ...good(), ip: 'licence', licence: 'MIT', promotes: true, promoBasis: 'approved', promoText: 'Approved by X Ltd, FRN 123456', promoLawful: true, adult: true, takers: 'approve', legalName: ' Ada Testwright ', ukResident: true });
  assert.deepEqual(p.ip, { mode: 'licence', licence: 'MIT' });
  assert.deepEqual(p.promotion, { basis: 'approved', statement: 'Approved by X Ltd, FRN 123456', lawful: true });
  assert.equal(p.adult, true); assert.equal(p.takers, 'approve'); assert.equal(p.legal_name, 'Ada Testwright'); assert.equal(p.uk_resident, true);
});

// ── config ───────────────────────────────────────────────────────────────────
test('GET /api/post-config: postApi only when CONTRACTS_POST_API is https; Veriff link from VERIFF_URL or the default', () => {
  assert.deepEqual(postConfig({}), { postApi: null, veriffUrl: DEFAULT_VERIFF_URL });
  assert.deepEqual(postConfig({ CONTRACTS_POST_API: 'https://www.bit-sign.online', VERIFF_URL: 'https://www.bchatx.com/kyc?site=bjobsx' }), { postApi: 'https://www.bit-sign.online', veriffUrl: 'https://www.bchatx.com/kyc?site=bjobsx' });
  assert.deepEqual(postConfig({ CONTRACTS_POST_API: 'javascript:alert(1)', VERIFF_URL: 'http://x' }), { postApi: null, veriffUrl: DEFAULT_VERIFF_URL });
  const res = { code: 0, headers: {}, body: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
  delete process.env.CONTRACTS_POST_API;
  configHandler({ method: 'GET' }, res);
  assert.equal(res.code, 200); assert.equal(res.body.postApi, null);
  configHandler({ method: 'POST' }, res);
  assert.equal(res.code, 405);
});
