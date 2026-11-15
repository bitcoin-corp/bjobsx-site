// Shared server helpers for bjobsx.com.
// - The wallet's paymail comes from the bWalletX paymail server (public, read-only):
//     GET pay.bwallet.space/api/paymail/lookup?key=<identityKey> -> { paymail, alias }
//     GET pay.bwallet.space/api/paymail/id/<alias>@bwalletx.com   -> { pubkey }   (alias -> key)
//     GET pay.bwallet.space/api/paymail/profile/<paymail>          -> { name, avatar }
// - A chosen username lives on the bWalletX push server (bitcoin-corp/bwalletx-push, /v1/job-profiles, wallet-signed).
//   Only the name: bJobsX never sends profile content there (it always sends profile null).
// - The PUBLIC profile lives on chain, signed by the owner's wallet (mint/records.js, read by api/_chain.js). The
//   imported LinkedIn data itself never reaches any server: it stays in the owner's browser.
//   Until /v1/job-profiles is deployed, every profile uses its paymail alias as its name.
export const PUSH_API = () => (process.env.PUSH_API || 'https://push.bwalletx.com').replace(/\/$/, '');
export const PAYMAIL_API = () => (process.env.PAYMAIL_API || 'https://pay.bwallet.space/api/paymail').replace(/\/$/, '');
export const PAYMAIL_DOMAIN = 'bwalletx.com';
export const KEY_RE = /^0[23][0-9a-f]{64}$/;
export const NAME_RE = /^[a-z0-9][a-z0-9_.-]{1,39}$/; // what a /u/<name> can look like (paymail aliases may contain '.')
export const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,29}$/; // what a chosen username can be

export const get = async (url, ms = 2500) => {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } });
    return { status: r.status, json: await r.json().catch(() => null) };
  } catch { return { status: 0, json: null }; }
};

export async function paymailFor(identityKey) {
  const l = await get(`${PAYMAIL_API()}/lookup?key=${identityKey}`);
  if (l.status !== 200 || !l.json?.alias) return null;
  const paymail = String(l.json.paymail || `${l.json.alias}@${PAYMAIL_DOMAIN}`);
  const p = await get(`${PAYMAIL_API()}/profile/${encodeURIComponent(paymail)}`);
  return { paymail, alias: String(l.json.alias), name: p.json?.name || null, avatar: p.json?.avatar || null };
}

export async function keyForAlias(alias) {
  const r = await get(`${PAYMAIL_API()}/id/${encodeURIComponent(alias)}@${PAYMAIL_DOMAIN}`);
  const k = String(r.json?.pubkey || '').toLowerCase();
  return KEY_RE.test(k) ? k : null;
}

/** The push server's username row (its `profile` field is ignored). { live:false } when the endpoint isn't deployed yet. */
export async function profileBy(q) {
  const r = await get(`${PUSH_API()}/v1/job-profiles?${new URLSearchParams(q)}`);
  if (r.status === 200 && r.json) return { live: true, row: r.json };
  // A deployed endpoint answers "not found" in JSON; an undeployed route is the server's plain-text 404.
  if (r.status === 404 && r.json) return { live: true, row: null };
  return { live: false, row: null };
}

/**
 * What a profile page shows, for a username or an identity key. Null when nobody has that name.
 * The username comes from the push server (or the paymail alias); the profile comes from chain (api/_chain.js),
 * never from a stored copy. `hint` is a txid the owner just published (only used for the owner's own view).
 */
export async function loadProfile({ name, identityKey, hint = null }) {
  let key = identityKey || null, saved = null, live = false;
  if (!key && name) {
    const s = await profileBy({ name });
    live = s.live;
    if (s.row?.identityKey) { key = s.row.identityKey; saved = s.row; }
    else key = await keyForAlias(name);
  }
  if (!key) return null;
  const { latestProfile } = await import('./_chain.js'); // only profile routes load the chain reader (@bsv/sdk)
  const [byKey, pm, chain] = await Promise.all([
    saved ? null : profileBy({ identity_key: key }),
    paymailFor(key),
    latestProfile(key, { hint }),
  ]);
  if (byKey) { live = live || byKey.live; saved = byKey.row?.username ? byKey.row : null; }
  const on = chain && !chain.unavailable ? chain : null;
  return {
    identityKey: key,
    paymail: pm?.paymail || null, alias: pm?.alias || null, displayName: pm?.name || null, avatar: pm?.avatar || null,
    username: saved?.username || pm?.alias || null, usernameSaved: !!saved?.username,
    profile: on?.profile || null, updatedAt: on?.updatedAt || null,
    settingsLive: live,
    // Additions (on-chain publish): where the profile is, and whether the chain could be read just now.
    profileTxid: on?.txid || null, chainOk: !chain?.unavailable,
  };
}

/** Live rates: USD per BSV (WhatsOnChain) and USD per GBP (ECB via frankfurter.app). Null when unreachable. */
export async function rates() {
  const g = (u, f) => fetch(u, { signal: AbortSignal.timeout(2500) }).then((r) => r.json()).then(f).catch(() => null);
  const [usdPerBsv, usdPerGbp] = await Promise.all([
    g('https://api.whatsonchain.com/v1/bsv/main/exchangerate', (j) => Number(j.rate) || null),
    g('https://api.frankfurter.app/latest?from=GBP&to=USD', (j) => Number(j.rates?.USD) || null),
  ]);
  return { usdPerBsv, usdPerGbp };
}
