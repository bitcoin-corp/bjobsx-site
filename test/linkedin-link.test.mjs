// Link LinkedIn (api/linkedin/_li.js): state seal/verify, off-when-unconfigured, and nothing secret in redirects.
// No network (fetch is mocked) and no packages: the session is passed in as `me`.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.BWALLETX_SESSION_SECRET = 'test-session-secret-0123456789abcdef-xyz';
const LI = await import('../api/linkedin/_li.js');
const { seal } = await import('../api/bwalletx/_auth.js');

const S = process.env.BWALLETX_SESSION_SECRET;
const ME = '02' + 'a'.repeat(64), OTHER = '03' + 'b'.repeat(64);
const CLIENT_ID = 'test-client-id-77', CLIENT_SECRET = 'test-client-secret-SHOULD-NEVER-LEAK';
const CODE = 'test-auth-code-SHOULD-NEVER-LEAK', TOKEN = 'test-access-token-SHOULD-NEVER-LEAK';
const EMAIL = 'ada.private@example.com';
const SECRETS = [CLIENT_SECRET, CODE, TOKEN, EMAIL, S];
const T0 = Date.UTC(2026, 10, 14, 12, 0, 0);

beforeEach(() => { process.env.LINKEDIN_CLIENT_ID = CLIENT_ID; process.env.LINKEDIN_CLIENT_SECRET = CLIENT_SECRET; });

/** A minimal Vercel-style res. */
const mkRes = () => {
  const r = { statusCode: 200, headers: {}, body: undefined, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
};
const cookiesOf = (res) => [].concat(res.headers['set-cookie'] || []);
const cookieVal = (res, name) => { const c = cookiesOf(res).find((x) => x.startsWith(name + '=')); return c ? decodeURIComponent(c.split(';')[0].slice(name.length + 1)) : null; };
/** Everything a browser could see: status, Location, cookies (names and attributes), JSON body. */
const visible = (res) => JSON.stringify({ s: res.statusCode, h: res.headers, b: res.body ?? null });
const noSecrets = (res) => { const v = visible(res); for (const x of SECRETS) assert.ok(!v.includes(x), `leaked: ${x.slice(0, 12)}…`); };

const LINKEDIN_USER = { sub: 'li-sub-123', name: 'Ada Testwright', given_name: 'Ada', family_name: 'Testwright', picture: 'https://media.licdn.com/dms/image/v2/abc/profile.jpg?e=1&t=x', email: EMAIL, email_verified: true, locale: 'en_GB' };
/** LinkedIn, mocked. Records every call. */
const mkFetch = ({ tokenOk = true, userOk = true, user = LINKEDIN_USER } = {}) => {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url, init });
    const reply = (ok, j) => ({ ok, status: ok ? 200 : 400, json: async () => j });
    if (url === LI.TOKEN_URL) return reply(tokenOk, tokenOk ? { access_token: TOKEN, expires_in: 3600 } : { error: 'invalid_grant', error_description: `bad code ${CODE}` });
    if (url === LI.USERINFO_URL) return reply(userOk, userOk ? user : { message: 'nope' });
    throw new Error('unexpected fetch ' + url);
  };
  f.calls = calls;
  return f;
};
const deps = (o = {}) => ({ me: async () => ('me' in o ? o.me : ME), fetch: o.fetch || mkFetch(), now: () => o.now ?? T0 });

/** Run /start and hand back {state, nonce} as the browser would carry them. */
async function begin(d = deps()) {
  const res = mkRes();
  await LI.start({ method: 'GET', headers: {}, query: {} }, res, d);
  const loc = new URL(res.headers.location);
  return { res, loc, state: loc.searchParams.get('state'), nonce: cookieVal(res, LI.NONCE_COOKIE) };
}
const cb = async (q, { nonce, cookie = '', d = deps() } = {}) => {
  const res = mkRes();
  const c = [cookie, nonce ? `${LI.NONCE_COOKIE}=${encodeURIComponent(nonce)}` : ''].filter(Boolean).join('; ');
  await LI.callback({ method: 'GET', headers: { cookie: c }, query: q }, res, d);
  return res;
};

// ── state ───────────────────────────────────────────────────────────────────
test('state: round trip; tampered, expired, wrong identity, wrong nonce, other-purpose seals all refused', () => {
  const { n, state } = LI.makeState(S, ME, T0);
  assert.deepEqual(LI.checkState(S, state, { identityKey: ME, nonce: n, now: T0 + 1000 }), { ok: true });
  assert.ok(!state.includes(ME) && !Buffer.from(state, 'base64url').toString('latin1').includes(ME), 'identity key is sealed, not readable');

  const i = Math.floor(state.length / 2);
  const tampered = state.slice(0, i) + (state[i] === 'A' ? 'B' : 'A') + state.slice(i + 1);
  assert.equal(LI.checkState(S, tampered, { identityKey: ME, nonce: n, now: T0 }).reason, 'state');
  assert.equal(LI.checkState(S, state.slice(0, -4), { identityKey: ME, nonce: n, now: T0 }).reason, 'state');
  assert.equal(LI.checkState(S, '', { identityKey: ME, nonce: n, now: T0 }).reason, 'state');
  assert.equal(LI.checkState('another-secret-0123456789abcdef-0000', state, { identityKey: ME, nonce: n, now: T0 }).reason, 'state');

  assert.equal(LI.checkState(S, state, { identityKey: ME, nonce: n, now: T0 + LI.STATE_MS + 1 }).reason, 'expired');
  assert.equal(LI.checkState(S, state, { identityKey: ME, nonce: n, now: T0 + LI.STATE_MS - 1 }).ok, true);
  assert.equal(LI.checkState(S, state, { identityKey: OTHER, nonce: n, now: T0 }).reason, 'session');
  assert.equal(LI.checkState(S, state, { identityKey: null, nonce: n, now: T0 }).reason, 'session');
  assert.equal(LI.checkState(S, state, { identityKey: ME, nonce: 'someone-elses-nonce', now: T0 }).reason, 'state');
  assert.equal(LI.checkState(S, state, { identityKey: ME, nonce: null, now: T0 }).reason, 'state');

  // A sign-in ticket (default label) or a stored link can't stand in for a state, even with the right fields.
  const asTicket = seal(S, { p: 'li', k: ME, n, exp: T0 + 60_000 });
  assert.equal(LI.checkState(S, asTicket, { identityKey: ME, nonce: n, now: T0 }).reason, 'state');
  const asLink = LI.sealLink(S, ME, { p: 'li', n, exp: T0 + 60_000 });
  assert.equal(LI.checkState(S, asLink, { identityKey: ME, nonce: n, now: T0 }).reason, 'state');
});

// ── off when unconfigured ───────────────────────────────────────────────────
test('off: no client id or secret -> start 503 with the exact words, callback says off, nothing is fetched', async () => {
  for (const missing of ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET']) {
    delete process.env[missing];
    assert.equal(LI.linkedinOn(), false);
    const f = mkFetch();
    const res = mkRes();
    await LI.start({ method: 'GET', headers: {}, query: {} }, res, deps({ fetch: f }));
    assert.equal(res.statusCode, 503);
    assert.deepEqual(res.body, { error: 'LinkedIn sign-in is not switched on yet.' });
    assert.equal(res.headers.location, undefined);
    const r2 = await cb({ code: CODE, state: 'x' }, { d: deps({ fetch: f }) });
    assert.equal(r2.statusCode, 302);
    assert.equal(r2.headers.location, '/studio?linkedin=error&reason=off');
    assert.equal(f.calls.length, 0);
    noSecrets(res); noSecrets(r2);
    process.env.LINKEDIN_CLIENT_ID = CLIENT_ID; process.env.LINKEDIN_CLIENT_SECRET = CLIENT_SECRET;
  }
  assert.equal(LI.linkedinOn(), true);
});

// ── start ───────────────────────────────────────────────────────────────────
test('start: no wallet session -> /studio?linkedin=signin; with one -> LinkedIn, redirect_uri from config, no secret', async () => {
  const r0 = mkRes();
  await LI.start({ method: 'GET', headers: {}, query: {} }, r0, deps({ me: null }));
  assert.equal(r0.statusCode, 302);
  assert.equal(r0.headers.location, '/studio?linkedin=signin');

  const { res, loc, state, nonce } = await begin();
  assert.equal(res.statusCode, 302);
  assert.equal(loc.origin + loc.pathname, LI.AUTH_URL);
  assert.equal(loc.searchParams.get('response_type'), 'code');
  assert.equal(loc.searchParams.get('client_id'), CLIENT_ID);
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://bjobsx.com/api/linkedin/callback');
  assert.equal(loc.searchParams.get('scope'), 'openid profile email');
  assert.ok(state && nonce);
  assert.ok(cookiesOf(res)[0].includes('HttpOnly') && cookiesOf(res)[0].includes('Path=/api/linkedin') && cookiesOf(res)[0].includes('Max-Age=600'));
  noSecrets(res);

  // The request's Host never steers redirect_uri.
  const r2 = mkRes();
  await LI.start({ method: 'GET', headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' }, query: {} }, r2, deps());
  assert.equal(new URL(r2.headers.location).searchParams.get('redirect_uri'), 'https://bjobsx.com/api/linkedin/callback');
  const r3 = mkRes();
  await LI.start({ method: 'POST', headers: {}, query: {} }, r3, deps());
  assert.equal(r3.statusCode, 405);
});

// ── callback ────────────────────────────────────────────────────────────────
test('callback: links; stores name, picture, verified flag, time, sub hash; never the email, code or token', async () => {
  const { state, nonce } = await begin();
  const f = mkFetch();
  const res = await cb({ code: CODE, state }, { nonce, d: deps({ fetch: f, now: T0 + 5000 }) });
  assert.equal(res.statusCode, 302);
  assert.equal(res.headers.location, '/studio?linkedin=linked');
  noSecrets(res);

  // The token swap went to LinkedIn only, with the same redirect_uri; the token went only to userinfo.
  assert.deepEqual(f.calls.map((c) => c.url), [LI.TOKEN_URL, LI.USERINFO_URL]);
  const form = new URLSearchParams(f.calls[0].init.body);
  assert.equal(form.get('redirect_uri'), 'https://bjobsx.com/api/linkedin/callback');
  assert.equal(form.get('code'), CODE);
  assert.equal(form.get('client_secret'), CLIENT_SECRET);
  assert.equal(f.calls[1].init.headers.authorization, `Bearer ${TOKEN}`);

  const sealed = cookieVal(res, LI.LINK_COOKIE);
  const attrs = cookiesOf(res).find((c) => c.startsWith(LI.LINK_COOKIE + '='));
  assert.ok(attrs.includes('HttpOnly') && attrs.includes('Secure') && attrs.includes('SameSite=Lax'));
  assert.ok(cookiesOf(res).some((c) => c.startsWith(LI.NONCE_COOKIE + '=;') && c.includes('Max-Age=0')), 'nonce cleared');

  const link = LI.linkFor(`${LI.LINK_COOKIE}=${encodeURIComponent(sealed)}`, ME);
  assert.deepEqual(link, { name: 'Ada Testwright', picture: LINKEDIN_USER.picture, emailVerified: true, linkedAt: new Date(T0 + 5000).toISOString() });
  // Inside the seal: the fields above plus the sub hash, and nothing else.
  const { open } = await import('../api/bwalletx/_auth.js');
  const inner = open(S, sealed, 'bjobsx linkedin link');
  assert.deepEqual(Object.keys(inner).sort(), ['emailVerified', 'k', 'linkedAt', 'name', 'p', 'picture', 'subHash']);
  assert.equal(inner.subHash, LI.subHash('li-sub-123'));
  assert.notEqual(inner.subHash, 'li-sub-123');
  assert.ok(!JSON.stringify(inner).includes(EMAIL) && !JSON.stringify(inner).includes('li-sub-123'));

  // Bound to the wallet: another identity (or a missing session) reads nothing.
  assert.equal(LI.linkFor(`${LI.LINK_COOKIE}=${encodeURIComponent(sealed)}`, OTHER), null);
  assert.equal(LI.linkFor(`${LI.LINK_COOKIE}=${encodeURIComponent(sealed)}`, null), null);
});

test('callback: refuses a state from another session, a missing/stolen nonce, an expired state, a lost session', async () => {
  const { state, nonce } = await begin();
  const f = mkFetch();
  const words = async (q, o) => (await cb(q, o)).headers.location;
  assert.equal(await words({ code: CODE, state }, { nonce, d: deps({ me: OTHER, fetch: f }) }), '/studio?linkedin=error&reason=session');
  assert.equal(await words({ code: CODE, state }, { d: deps({ fetch: f }) }), '/studio?linkedin=error&reason=state');
  assert.equal(await words({ code: CODE, state }, { nonce: 'not-the-nonce', d: deps({ fetch: f }) }), '/studio?linkedin=error&reason=state');
  assert.equal(await words({ code: CODE, state }, { nonce, d: deps({ fetch: f, now: T0 + LI.STATE_MS + 1 }) }), '/studio?linkedin=error&reason=expired');
  assert.equal(await words({ code: CODE, state: (state[0] === 'A' ? 'B' : 'A') + state.slice(1) }, { nonce, d: deps({ fetch: f }) }), '/studio?linkedin=error&reason=state');
  assert.equal(await words({ code: CODE, state }, { nonce, d: deps({ me: null, fetch: f }) }), '/studio?linkedin=signin');
  assert.equal(await words({ state }, { nonce, d: deps({ fetch: f }) }), '/studio?linkedin=error&reason=linkedin');
  assert.equal(f.calls.length, 0, 'LinkedIn is never called before the state checks out');
});

test('callback: LinkedIn errors map to fixed words; their text, the code and the token never come back', async () => {
  const { state, nonce } = await begin();
  const cancel = await cb({ error: 'user_cancelled_login', error_description: `The user cancelled <script>${EMAIL}</script>`, state }, { nonce });
  assert.equal(cancel.headers.location, '/studio?linkedin=error&reason=cancelled');
  const other = await cb({ error: 'access_denied', error_description: 'whatever LinkedIn says', state }, { nonce });
  assert.equal(other.headers.location, '/studio?linkedin=error&reason=linkedin');
  const badCode = await cb({ code: CODE, state }, { nonce, d: deps({ fetch: mkFetch({ tokenOk: false }) }) });
  assert.equal(badCode.headers.location, '/studio?linkedin=error&reason=linkedin');
  const noUser = await cb({ code: CODE, state }, { nonce, d: deps({ fetch: mkFetch({ userOk: false }) }) });
  assert.equal(noUser.headers.location, '/studio?linkedin=error&reason=linkedin');
  const noSub = await cb({ code: CODE, state }, { nonce, d: deps({ fetch: mkFetch({ user: { name: 'No Sub' } }) }) });
  assert.equal(noSub.headers.location, '/studio?linkedin=error&reason=linkedin');
  const thrown = await cb({ code: CODE, state }, { nonce, d: deps({ fetch: async () => { throw new Error(`network ${CODE}`); } }) });
  assert.equal(thrown.headers.location, '/studio?linkedin=error&reason=linkedin');
  for (const r of [cancel, other, badCode, noUser, noSub, thrown]) { noSecrets(r); assert.ok(!cookiesOf(r).some((c) => c.startsWith(LI.LINK_COOKIE + '='))); }
});

test('link: unverified email stays false; non-LinkedIn or http pictures are dropped; long names are capped', () => {
  assert.equal(LI.linkFrom({ sub: 'x', name: 'A', email_verified: 'true' }).emailVerified, false);
  assert.equal(LI.linkFrom({ sub: 'x', name: 'A' }).emailVerified, false);
  assert.equal(LI.linkFrom({ sub: 'x', picture: 'http://media.licdn.com/a.jpg' }).picture, null);
  assert.equal(LI.linkFrom({ sub: 'x', picture: 'https://evil.example/a.jpg' }).picture, null);
  assert.equal(LI.linkFrom({ sub: 'x', picture: 'https://licdn.com.evil.example/a.jpg' }).picture, null);
  assert.equal(LI.linkFrom({ sub: 'x', picture: 'javascript:alert(1)' }).picture, null);
  assert.equal(LI.linkFrom({ sub: 'x', name: 'n'.repeat(500) }).name.length, 120);
  assert.equal(LI.linkFrom({ sub: 'x', given_name: 'Ada', family_name: 'T' }).name, 'Ada T');
  assert.ok(!('email' in LI.linkFrom(LINKEDIN_USER)));
});

// ── unlink ──────────────────────────────────────────────────────────────────
test('unlink: needs our origin and a wallet session; clears only this wallet’s link', async () => {
  const mine = `${LI.LINK_COOKIE}=${encodeURIComponent(LI.sealLink(S, ME, LI.linkFrom(LINKEDIN_USER, T0)))}`;
  const theirs = `${LI.LINK_COOKIE}=${encodeURIComponent(LI.sealLink(S, OTHER, LI.linkFrom(LINKEDIN_USER, T0)))}`;
  const run = async (headers, d = deps()) => { const res = mkRes(); await LI.unlink({ method: 'POST', headers, query: {} }, res, d); return res; };
  assert.equal((await run({ origin: 'https://evil.example', cookie: mine })).statusCode, 403);
  assert.equal((await run({ origin: 'https://bjobsx.com', cookie: mine }, deps({ me: null }))).statusCode, 401);
  const ok = await run({ origin: 'https://bjobsx.com', cookie: mine });
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(ok.body, { linked: false });
  assert.ok(cookiesOf(ok).some((c) => c.startsWith(LI.LINK_COOKIE + '=;') && c.includes('Max-Age=0')));
  const other = await run({ origin: 'https://www.bjobsx.com', cookie: theirs });
  assert.equal(other.statusCode, 200);
  assert.equal(cookiesOf(other).length, 0, "another wallet's link is left alone");
  const r405 = mkRes(); await LI.unlink({ method: 'GET', headers: {}, query: {} }, r405, deps());
  assert.equal(r405.statusCode, 405);
});

test('nothing is logged on any path', async () => {
  const seen = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => seen.push(a.join(' '));
  try {
    const { state, nonce } = await begin();
    await cb({ code: CODE, state }, { nonce });
    await cb({ code: CODE, state }, { nonce, d: deps({ fetch: mkFetch({ tokenOk: false }) }) });
    await cb({ error: 'user_cancelled_login', state }, { nonce });
  } finally { Object.assign(console, orig); }
  assert.deepEqual(seen, []);
});
