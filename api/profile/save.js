// POST /api/profile/save { username, profile|null, timestamp, signature }
// Forwards to the push server (POST /v1/job-profiles), which checks the wallet's BRC-100 signature over
//   "bjobsx profile <identityKey> <username> <sha256(JSON of profile) | -> <timestamp>"
//   (protocol [2,'bjobsx profile'], keyID 'settings', counterparty 'anyone')
// so only the key holder can name a profile or change what it shows. The identity key comes from the signed-in
// session, never the body. `profile` holds ONLY the sections the owner ticked public; null hides the page from Browse.
import { readCookie, verifySession } from '@bwalletx/connect/server';
import { body, originOk, secret } from '../bwalletx/_auth.js';
import { PUSH_API, USERNAME_RE, PROFILE_MAX_BYTES } from '../_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();
  if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
  const s = secret();
  const me = s ? (await verifySession(readCookie(req.headers.cookie, 'bwx_session'), { secret: s }))?.sub || null : null;
  if (!me) return res.status(401).json({ error: 'Connect bWalletX first.' });
  const b = await body(req);
  const username = String(b.username || '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Use 3 to 30 letters, numbers, - or _. Start with a letter or number.' });
  const profile = b.profile && typeof b.profile === 'object' ? b.profile : null;
  if (profile && Buffer.byteLength(JSON.stringify(profile)) > PROFILE_MAX_BYTES) return res.status(413).json({ error: 'That public profile is too big. Make fewer sections public, or shorten the descriptions.' });
  if (!Array.isArray(b.signature) || !Number.isInteger(b.timestamp)) return res.status(400).json({ error: 'Sign with your wallet first.' });
  let r, j;
  try {
    r = await fetch(`${PUSH_API()}/v1/job-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identityKey: me, username, profile, timestamp: b.timestamp, signature: b.signature }),
      signal: AbortSignal.timeout(8000),
    });
    j = await r.json().catch(() => null);
  } catch { return res.status(502).json({ error: 'Could not reach the server. Try again shortly.' }); }
  if (!j && (r.status === 404 || r.status === 405)) return res.status(503).json({ error: 'Publishing your profile opens shortly. Your choices are kept on this device until then.', coming: true });
  if (!r.ok) return res.status([400, 401, 409, 413].includes(r.status) ? r.status : 502).json({ error: j?.error || 'That was not saved.' });
  return res.status(200).json(j);
}
