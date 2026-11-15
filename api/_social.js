// The wallet's linked accounts (LinkedIn, GitHub, X, Google). Linking is done BY bWalletX: the wallet runs the OAuth,
// signs a link message with its identity key and the paymail server stores it (bwalletX site/lib/socialLinks.js).
//   GET https://pay.bwallet.space/api/social/links?key=<identityKey>
//     -> { links: [{ provider, account, handle, identityKey, timestamp, signature }], scheme }
// We don't take the server's word for it: each row is re-verified against the identity key, using the wallet's canonical
// message ("bwallet-paymail|v1|link|<sorted key=value>…", BRC-43 [2,'bwallet paymail'], keyID '1', counterparty
// anyone on the signer side). Only rows that verify are shown. Nothing is stored here.
import { ProtoWallet, Utils } from '@bsv/sdk';
import { get, KEY_RE } from './_lib.js';

export const SOCIAL_API = () => (process.env.SOCIAL_API || 'https://pay.bwallet.space/api/social').replace(/\/$/, '');
export const PROVIDERS = ['linkedin', 'github', 'x', 'google'];
const TTL = 60_000;
const cache = new Map();

/** The wallet's canonical signed message (same as bwalletX site/lib/paymail.js signedMessage). */
export function signedMessage(action, fields) {
  const keys = Object.keys(fields).sort();
  return ['bwallet-paymail', 'v1', action, ...keys.map((k) => `${k}=${fields[k] ?? ''}`)].join('|');
}

/** True when `row` was signed by `identityKey`. */
export async function verifyLink(row, identityKey) {
  try {
    if (String(row.identityKey || '').toLowerCase() !== identityKey) return false;
    if (!/^[0-9a-f]{16,200}$/i.test(String(row.signature || ''))) return false;
    const fields = { provider: String(row.provider), account: String(row.account), handle: String(row.handle ?? ''), identityKey, timestamp: String(row.timestamp) };
    const { valid } = await new ProtoWallet('anyone').verifySignature({
      data: Utils.toArray(signedMessage('link', fields), 'utf8'),
      signature: Utils.toArray(String(row.signature), 'hex'),
      protocolID: [2, 'bwallet paymail'],
      keyID: '1',
      counterparty: identityKey,
    });
    return !!valid;
  } catch { return false; }
}

/** [{ provider, handle }] for the links this wallet has signed. [] when there are none or the server can't be reached. */
export async function walletLinks(identityKey, { fetchJson = get } = {}) {
  const k = String(identityKey || '').toLowerCase();
  if (!KEY_RE.test(k)) return [];
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const r = await fetchJson(`${SOCIAL_API()}/links?key=${k}`, 2500);
  const rows = r.status === 200 && Array.isArray(r.json?.links) ? r.json.links.slice(0, 20) : null;
  if (!rows) return [];
  const out = [];
  for (const row of rows) {
    const provider = String(row?.provider || '');
    if (!PROVIDERS.includes(provider) || out.some((l) => l.provider === provider)) continue;
    if (await verifyLink(row, k)) out.push({ provider, handle: String(row.handle || '').slice(0, 40) });
  }
  cache.set(k, { at: Date.now(), v: out });
  return out;
}
