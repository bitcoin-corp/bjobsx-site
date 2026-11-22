// Link LinkedIn to a connected bWalletX on bjobsx.com ("Sign In with LinkedIn using OpenID Connect").
// Wallet first: every route needs the bjobsx wallet session, and the link is bound to that wallet's identity key.
//
//   GET  /api/linkedin/start     -> 302 to LinkedIn (state sealed: identity key + nonce, 10 min) | 302 /studio?linkedin=signin
//   GET  /api/linkedin/callback  -> checks state + the same session, swaps the code, reads userinfo, stores the link,
//                                   302 /studio?linkedin=linked | /studio?linkedin=error&reason=<word>
//   POST /api/linkedin/unlink    -> removes it
//
// LinkedIn gives only name, picture, email and email_verified (no job history: that's the ZIP import).
// What is kept: { name, picture, emailVerified, linkedAt, subHash }. Never the email, the code or the token.
//
// Where it is kept: the push server's job profile can't take it (its profile schema is strict, and every write must
// carry the wallet's own signature, which this server can't make). So the link is sealed (AES-256-GCM, keyed from
// BWALLETX_SESSION_SECRET) into an HttpOnly cookie on bjobsx.com, bound to the identity key. Only this server can
// make or read one. Because there's no shared table, two wallets CAN link the same LinkedIn; subHash is kept so a
// store can refuse that later.
//
// Off until LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET are set: start answers 503, the page says "Coming soon".
import { createHash, randomBytes } from 'node:crypto';
import { open, ORIGIN, originOk, seal, secret, sessionToken } from '../bwalletx/_auth.js';

export const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
export const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
export const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
export const SCOPE = 'openid profile email';
export const STATE_MS = 10 * 60_000;
export const LINK_COOKIE = 'bjx_li';
export const NONCE_COOKIE = 'bjx_li_n';
const LINK_DAYS = 180;
const STATE_LABEL = 'bjobsx linkedin state', LINK_LABEL = 'bjobsx linkedin link';
export const OFF = 'LinkedIn sign-in is not switched on yet.';

/** The same string in both directions (authorize and token swap), from config, never the request. */
export const redirectUri = () => `${ORIGIN}/api/linkedin/callback`;
export const config = () => {
  const id = process.env.LINKEDIN_CLIENT_ID || '', sec = process.env.LINKEDIN_CLIENT_SECRET || '';
  return id && sec ? { id, sec } : null;
};
export const linkedinOn = () => !!config();

// ── cookies ─────────────────────────────────────────────────────────────────
export const readCookie = (header, name) => {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
};
const cookie = (name, value, maxAge, path = '/') =>
  `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${ORIGIN.startsWith('https') ? '; Secure' : ''}`;

// ── state: sealed, bound to the session's identity key and a per-browser nonce, 10 minutes ──────────────
export function makeState(s, identityKey, now = Date.now()) {
  const n = randomBytes(16).toString('base64url');
  return { n, state: seal(s, { p: 'li', k: identityKey, n, exp: now + STATE_MS }, STATE_LABEL) };
}
/** -> { ok:true } | { ok:false, reason: 'state'|'expired'|'session' } */
export function checkState(s, state, { identityKey, nonce, now = Date.now() }) {
  const t = state ? open(s, state, STATE_LABEL) : null;
  if (!t || t.p !== 'li' || typeof t.n !== 'string') return { ok: false, reason: 'state' };
  if (!(t.exp > now)) return { ok: false, reason: 'expired' };
  if (!identityKey || t.k !== identityKey) return { ok: false, reason: 'session' };
  if (!nonce || nonce !== t.n) return { ok: false, reason: 'state' };
  return { ok: true };
}

// ── the stored link ─────────────────────────────────────────────────────────
export const subHash = (sub) => createHash('sha256').update('bjobsx linkedin sub\n' + String(sub)).digest('hex');
/** Only LinkedIn's own image host, https, length-capped. */
export const safePicture = (u) => {
  try { const x = new URL(String(u)); return x.protocol === 'https:' && /(^|\.)licdn\.com$/.test(x.hostname) && x.href.length <= 1000 ? x.href : null; } catch { return null; }
};
/** userinfo -> what we keep. The email address is dropped here and never stored. */
export const linkFrom = (u, now = Date.now()) => ({
  name: String(u.name || [u.given_name, u.family_name].filter(Boolean).join(' ') || 'LinkedIn member').slice(0, 120),
  picture: safePicture(u.picture),
  emailVerified: u.email_verified === true,
  linkedAt: new Date(now).toISOString(),
  subHash: subHash(u.sub),
});
export const sealLink = (s, identityKey, link) => seal(s, { p: 'link', k: identityKey, ...link }, LINK_LABEL);
/** The signed-in wallet's link, for its owner only: { name, picture, emailVerified, linkedAt } | null. */
export function linkFor(cookieHeader, identityKey) {
  const s = secret(), v = readCookie(cookieHeader, LINK_COOKIE);
  if (!s || !v || !identityKey) return null;
  const t = open(s, v, LINK_LABEL);
  if (!t || t.p !== 'link' || t.k !== identityKey) return null;
  return { name: String(t.name || ''), picture: safePicture(t.picture), emailVerified: t.emailVerified === true, linkedAt: t.linkedAt || null };
}

// ── LinkedIn calls (fetch is passed in so tests run without a network) ────────────────────────
async function swapCode(f, code, c) {
  const r = await f(TOKEN_URL, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: c.id, client_secret: c.sec }).toString(),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => null);
  return r.ok && typeof j?.access_token === 'string' ? j.access_token : null;
}
async function userinfo(f, token) {
  const r = await f(USERINFO_URL, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => null);
  return r.ok && j?.sub ? j : null;
}

// ── handlers ────────────────────────────────────────────────────────────────
/** The wallet session's identity key (the same check as /api/profile). Loaded lazily so tests can pass their own. */
async function sessionKey(req) {
  const s = secret(); if (!s) return null;
  const { verifySession } = await import('@bwalletx/connect/server');
  return (await verifySession(sessionToken(req.headers.cookie), { secret: s }))?.sub || null;
}
const deps0 = { me: sessionKey, fetch: (...a) => fetch(...a), now: () => Date.now() };
const go = (res, to, cookies) => {
  res.setHeader('Cache-Control', 'no-store');
  if (cookies) res.setHeader('Set-Cookie', cookies);
  res.statusCode = 302; res.setHeader('Location', to); res.end();
};
const fail = (res, reason) => go(res, `/studio?linkedin=error&reason=${reason}`, [cookie(NONCE_COOKIE, '', 0, '/api/linkedin')]);

export async function start(req, res, d = deps0) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const c = config();
  if (!c) return res.status(503).json({ error: OFF });
  const s = secret(), me = s ? await d.me(req) : null;
  if (!me) return go(res, '/studio?linkedin=signin');
  const { n, state } = makeState(s, me, d.now());
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: redirectUri(), scope: SCOPE, state }).toString();
  return go(res, u.href, [cookie(NONCE_COOKIE, n, STATE_MS / 1000, '/api/linkedin')]);
}

export async function callback(req, res, d = deps0) {
  if (req.method !== 'GET') { res.setHeader('Cache-Control', 'no-store'); return res.status(405).end(); }
  const c = config(), s = secret();
  if (!c || !s) return fail(res, 'off');
  const q = req.query || {};
  // LinkedIn's own error text is never echoed back: only our fixed words go in the URL.
  if (q.error) return fail(res, /cancel/i.test(String(q.error)) ? 'cancelled' : 'linkedin');
  const me = await d.me(req);
  if (!me) return go(res, '/studio?linkedin=signin', [cookie(NONCE_COOKIE, '', 0, '/api/linkedin')]);
  const ok = checkState(s, q.state, { identityKey: me, nonce: readCookie(req.headers.cookie, NONCE_COOKIE), now: d.now() });
  if (!ok.ok) return fail(res, ok.reason);
  if (typeof q.code !== 'string' || !q.code || q.code.length > 2000) return fail(res, 'linkedin');
  let u = null;
  try { const token = await swapCode(d.fetch, q.code, c); u = token ? await userinfo(d.fetch, token) : null; } catch { u = null; }
  if (!u) return fail(res, 'linkedin');
  return go(res, '/studio?linkedin=linked', [
    cookie(LINK_COOKIE, sealLink(s, me, linkFrom(u, d.now())), LINK_DAYS * 86400),
    cookie(NONCE_COOKIE, '', 0, '/api/linkedin'),
  ]);
}

export async function unlink(req, res, d = deps0) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  const me = secret() ? await d.me(req) : null;
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  // This wallet's own link (or an unreadable one) is removed; another wallet's on this browser stays.
  const v = readCookie(req.headers.cookie, LINK_COOKIE), t = v ? open(secret(), v, LINK_LABEL) : null;
  if (v && (!t || t.k === me)) res.setHeader('Set-Cookie', cookie(LINK_COOKIE, '', 0));
  return res.status(200).json({ linked: false });
}
