// GET /api/profile?name=<username>  -> a public profile (anyone): only the sections its owner made public
// GET /api/profile?me=1[&txid=<hex>] -> the signed-in wallet's own profile page data
//   -> { page: {paymail, alias, displayName, avatar, username, usernameSaved, profile, updatedAt, settingsLive,
//               profileTxid, chainOk}, isOwner, signedIn }
// `profile` is read from chain (the owner's newest signed profile transaction, api/_chain.js), never a stored copy.
// `txid` is the transaction the owner's browser just published, so their own view doesn't wait for the index.
// The identity key is returned only to its owner (so the page can check the wallet in the browser is the same one).
// The owner also gets `linkedin` (their LinkedIn link, or null), `linkedinOn` (LinkedIn sign-in is switched on) and
// `walletLinks` ([{provider, handle}] linked in their bWalletX, signature-checked: api/_social.js).
// Caching: a signed-out ?name= answer has nothing personal in it, so it is cached for a minute (Vary: Cookie);
// anything with a session cookie is no-store.
import { readCookie, verifySession } from '@bwalletx/connect/server';
import { secret } from './bwalletx/_auth.js';
import { loadProfile, NAME_RE } from './_lib.js';
import { linkFor, linkedinOn } from './linkedin/_li.js';
import { walletLinks } from './_social.js';

export default async function handler(req, res) {
  const cookie = readCookie(req.headers.cookie, 'bwx_session');
  const s = secret();
  const me = s && cookie ? (await verifySession(cookie, { secret: s }))?.sub || null : null;
  const shareable = !req.query?.me && !cookie;
  res.setHeader('Vary', 'Cookie');
  res.setHeader('Cache-Control', shareable ? 'public, s-maxage=60, stale-while-revalidate=300' : 'private, no-store');
  let page = null;
  if (req.query?.me) {
    if (!me) return res.status(200).json({ page: null, signedIn: false, isOwner: false, signInOn: !!s, linkedinOn: linkedinOn() });
    const hint = /^[0-9a-f]{64}$/.test(String(req.query.txid || '')) ? String(req.query.txid) : null;
    page = await loadProfile({ identityKey: me, hint });
  } else {
    const name = String(req.query?.name || '').toLowerCase().replace(/^[$@]/, '');
    if (!NAME_RE.test(name)) return res.status(400).json({ error: 'That is not a profile name.' });
    page = await loadProfile({ name });
    if (!page) return res.status(404).json({ error: 'No profile has that name yet.', signedIn: !!me });
  }
  if (shareable && page.chainOk === false) res.setHeader('Cache-Control', 'no-store'); // don't keep "chain unreachable" for a minute
  const isOwner = !!(me && page && page.identityKey === me);
  if (!isOwner) delete page.identityKey;
  // walletLinks: the accounts linked IN the wallet (verified signatures). Owner only until RB decides whether linked
  // accounts show publicly.
  if (isOwner) Object.assign(page, { linkedin: linkFor(req.headers.cookie, me), linkedinOn: linkedinOn(), walletLinks: await walletLinks(me) });
  return res.status(200).json({ page, signedIn: !!me, isOwner });
}
