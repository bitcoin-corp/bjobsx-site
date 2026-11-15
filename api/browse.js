// GET /api/browse -> public bJobsX profiles, newest first: { profiles: [{username, name, headline, updatedAt}], live }
// Read from chain: the bJobsX directory address lists profile transactions (api/_chain.js); each one counts only if
// its owner's signature checks out, only each owner's newest counts, and owners whose newest is "nothing public" are
// left out. Names come from the owner's username (push server) or $name. Nothing here is a stored copy.
// Public and signed-out: no wallet, no cookies.
import { directory } from './_chain.js';
import { keyForAlias, paymailFor, profileBy } from './_lib.js';

export const MAX = 60;

/** A name /u/<name> resolves back to this key: the saved username, else the $name alias. */
async function nameFor(identityKey) {
  const s = await profileBy({ identity_key: identityKey });
  if (s.row?.username) return String(s.row.username);
  const pm = await paymailFor(identityKey);
  return pm?.alias && (await keyForAlias(pm.alias)) === identityKey ? pm.alias : null;
}

async function mapLimit(xs, n, f) {
  const out = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}

export async function browse(dir = directory) {
  const list = await dir();
  if (!list) return { profiles: [], live: false };
  const top = list.slice(0, MAX);
  const names = await mapLimit(top, 6, (p) => nameFor(p.identityKey).catch(() => null));
  const profiles = top.map((p, i) => ({
    username: names[i] || '', name: String(p.profile?.name || '').slice(0, 120), headline: String(p.profile?.headline || '').slice(0, 400), updatedAt: p.at,
  })).filter((p) => p.username);
  return { profiles, live: true };
}

export default async function handler(req, res) {
  const out = await browse();
  res.setHeader('Cache-Control', out.live ? 'public, s-maxage=120, stale-while-revalidate=600' : 'no-store');
  res.status(200).json(out);
}
