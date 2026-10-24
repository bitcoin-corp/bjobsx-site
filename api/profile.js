// GET /api/profile?name=<username>  -> a public profile (anyone): only the sections its owner made public
// GET /api/profile?me=1             -> the signed-in wallet's own profile page data
//   -> { page: {paymail, alias, displayName, avatar, username, usernameSaved, profile, updatedAt, settingsLive}, isOwner, signedIn }
// The identity key is returned only to its owner (so the page can check the wallet in the browser is the same one).
import { readCookie, verifySession } from '@bwalletx/connect/server';
import { secret } from './bwalletx/_auth.js';
import { loadProfile, NAME_RE } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const s = secret();
  const me = s ? (await verifySession(readCookie(req.headers.cookie, 'bwx_session'), { secret: s }))?.sub || null : null;
  let page = null;
  if (req.query?.me) {
    if (!me) return res.status(200).json({ page: null, signedIn: false, isOwner: false, signInOn: !!s });
    page = await loadProfile({ identityKey: me });
  } else {
    const name = String(req.query?.name || '').toLowerCase().replace(/^[$@]/, '');
    if (!NAME_RE.test(name)) return res.status(400).json({ error: 'That is not a profile name.' });
    page = await loadProfile({ name });
    if (!page) return res.status(404).json({ error: 'No profile has that name yet.', signedIn: !!me });
  }
  const isOwner = !!(me && page && page.identityKey === me);
  if (!isOwner) delete page.identityKey;
  return res.status(200).json({ page, signedIn: !!me, isOwner });
}
