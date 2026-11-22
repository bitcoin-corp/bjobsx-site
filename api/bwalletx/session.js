// GET /api/bwalletx/session -> { identityKey } | { identityKey: null }   POST -> sign out (this origin only)
import { readCookie, verifySession } from '@bwalletx/connect/server';
import { OLD_SESSION, SESSION, clearCookie, originOk, secret, sessionCookie } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const s = secret();
  if (req.method === 'POST') {
    if (!originOk(req.headers.origin)) return res.status(403).json({ error: 'Wrong origin.' });
    res.setHeader('Set-Cookie', [clearCookie(SESSION), clearCookie(OLD_SESSION)]);
    return res.status(200).json({ identityKey: null });
  }
  if (!s) return res.status(200).json({ identityKey: null, off: true });
  const cookies = req.headers.cookie;
  const cur = readCookie(cookies, SESSION);
  const old = cur ? null : readCookie(cookies, OLD_SESSION);
  const p = await verifySession(cur || old, { secret: s });
  // The old cookie name, still valid: reissue the same token under the __Host- name and drop the old one.
  if (old && p?.sub) {
    const left = typeof p.exp === 'number' ? Math.max(0, Math.floor(p.exp - Date.now() / 1000)) : undefined;
    res.setHeader('Set-Cookie', [sessionCookie(old, left), clearCookie(OLD_SESSION)]);
  }
  return res.status(200).json({ identityKey: p?.sub ?? null });
}
