// Connect bWalletX on bjobsx.com (@bwalletx/connect, BRC-100). bjobsx keeps no sign-in table, so instead of a
// nonce table the pending challenge is sealed (AES-256-GCM) into a `ticket` the browser carries back to
// /verify. It can't be read or forged; the nonce is still single-origin, single-key and expires in 2 min.
// Env: BWALLETX_SESSION_SECRET (32+ chars) signs the session cookie and keys the ticket.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readCookie, serializeCookie } from '@bwalletx/connect/server';

export const ORIGIN = process.env.SITE_ORIGIN || 'https://bjobsx.com';
/** The apex and its www twin both serve the site; the signed message always names the apex. */
export const originOk = (o) => { try { const h = new URL(String(o)).host; const a = new URL(ORIGIN).host; return h === a || h === 'www.' + a; } catch { return false; } };
export const secret = () => {
  const s = process.env.BWALLETX_SESSION_SECRET || '';
  return s.length >= 32 ? s : null;
};
// `label` keeps each use apart: a sealed ticket can't be replayed as a LinkedIn state, and so on.
const key = (s, label = 'bjobsx bwalletx ticket') => createHash('sha256').update(label + '\n' + s).digest();

export function seal(s, data, label) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(s, label), iv);
  const body = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}
export function open(s, ticket, label) {
  try {
    const b = Buffer.from(String(ticket), 'base64url');
    const d = createDecipheriv('aes-256-gcm', key(s, label), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
  } catch { return null; }
}

export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

// Cookies (security review, 22 Nov 2026). The session is a host-only `__Host-` cookie (Secure, Path=/, no Domain);
// `bwx_session` is the old name: read it once, then /api/bwalletx/session reissues it under the new name.
// The challenge's sealed ticket rides in its own HttpOnly `__Host-bwx_t_<nonce>` cookie (10 minutes), never in the
// page: /verify needs it and clears it on every attempt, so one verify body can't be replayed to mint sessions.
export const SESSION = '__Host-bwx_session';
export const OLD_SESSION = 'bwx_session';
export const SESSION_MAX_AGE = 7 * 86400;
const NONCE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const cookieOpts = (name, maxAge) => ({ name, maxAge, secure: true, sameSite: 'Lax', path: '/' });
export const sessionCookie = (token, maxAge = SESSION_MAX_AGE) => serializeCookie(token, cookieOpts(SESSION, maxAge));
export const clearCookie = (name) => serializeCookie('', cookieOpts(name, 0));
/** The session token from the cookie header: the `__Host-` name, else the old one. */
export const sessionToken = (cookieHeader) => readCookie(cookieHeader, SESSION) || readCookie(cookieHeader, OLD_SESSION);
export const ticketCookieName = (nonce) => (NONCE_RE.test(String(nonce)) ? `__Host-bwx_t_${nonce}` : null);
export const ticketCookie = (nonce, ticket) => serializeCookie(ticket, cookieOpts(ticketCookieName(nonce), 600));
