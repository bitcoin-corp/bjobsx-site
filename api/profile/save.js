// POST /api/profile/save { username, timestamp, signature }  -> saves the profile's USERNAME only.
// Forwards to the push server (POST /v1/job-profiles), which checks the wallet's BRC-100 signature over
//   "bjobsx profile <identityKey> <username> - <timestamp>"
//   (protocol [2,'bjobsx profile'], keyID 'settings', counterparty 'anyone')
// so only the key holder can name a profile. The identity key comes from the signed-in session, never the body.
// Profile content is never sent: the public profile lives on chain, signed by the owner (mint/records.js), and the
// push server gets `profile: null` every time. A body that still carries a profile is refused.
import { readCookie, verifySession } from '@bwalletx/connect/server';
import { body, originOk, secret } from '../bwalletx/_auth.js';
import { PUSH_API, USERNAME_RE } from '../_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  const s = secret();
  const me = s ? (await verifySession(readCookie(req.headers.cookie, 'bwx_session'), { secret: s }))?.sub || null : null;
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const b = await body(req);
  if (b.profile != null) return res.status(400).json({ error: 'Your public profile is published on chain from your wallet, not saved here.' });
  const username = String(b.username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Use 3 to 30 letters, numbers, - or _. Start with a letter or number.' });
  if (!Array.isArray(b.signature) || !Number.isInteger(b.timestamp)) return res.status(400).json({ error: 'Sign with your wallet first.' });
  let r, j;
  try {
    r = await fetch(`${PUSH_API()}/v1/job-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityKey: me, username, profile: null, timestamp: b.timestamp, signature: b.signature }),
      signal: AbortSignal.timeout(8000),
    });
    j = await r.json().catch(() => null);
  } catch { return res.status(502).json({ error: 'Could not reach the server. Try again shortly.' }); }
  if (!j && (r.status === 404 || r.status === 405)) return res.status(503).json({ error: 'Choosing a username opens shortly.', coming: true });
  if (!r.ok) return res.status([400, 401, 409].includes(r.status) ? r.status : 502).json({ error: j?.error || 'That was not saved.' });
  // Only the name goes back: whatever else the push server holds is not ours to show.
  return res.status(200).json({ username: j?.username || username });
}
