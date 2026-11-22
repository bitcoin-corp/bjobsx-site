// POST /api/bwalletx/verify { identityKey, nonce, signature } + the __Host-bwx_t_<nonce> ticket cookie
//   -> session cookie + { identityKey }. The ticket cookie is cleared on every attempt: a verify body is good once.
import { readCookie, signSession, verifySignIn } from '@bwalletx/connect/server';
import { OLD_SESSION, ORIGIN, body, clearCookie, open, originOk, secret, sessionCookie, ticketCookieName } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  const s = secret();
  if (!s) return res.status(503).json({ error: 'bWalletX connect is not switched on yet.' });
  const b = await body(req);
  const name = ticketCookieName(b.nonce);
  const t = name ? open(s, readCookie(req.headers.cookie, name)) : null;
  if (name) res.setHeader('Set-Cookie', [clearCookie(name)]); // one attempt per challenge, pass or fail
  // the "store" holds exactly the one challenge this ticket sealed, for exactly its nonce
  const store = { put: () => {}, take: (nonce) => (t && t.nonce === nonce ? t.c : null) };
  const identityKey = await verifySignIn({ origin: ORIGIN, store, identityKey: b.identityKey, nonce: b.nonce, signature: b.signature });
  if (!identityKey) return res.status(401).json({ error: 'That signature was not accepted. Start again.' });
  const token = await signSession({ sub: identityKey }, { secret: s });
  res.setHeader('Set-Cookie', [...(name ? [clearCookie(name)] : []), sessionCookie(token), clearCookie(OLD_SESSION)]);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ identityKey });
}
