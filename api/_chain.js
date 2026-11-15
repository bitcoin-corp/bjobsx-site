// Public profiles, read from chain (server only). bJobsX stores no profile: it finds the owner's newest signed
// profile transaction through a public address index, checks the signature, and shows what it says.
//
// How a profile is found (mint/records.js has the transaction format):
// - Each publish pays 1 sat to the owner's PROFILE KEY: the BRC-42 key derived from their identity key with the
//   'anyone' key ([2,'bjobsx records'], keyID 'public profile'). Anyone can work that key out from the identity key,
//   so its address history (WhatsOnChain, any address index) lists every profile the owner has published.
// - Each publish also pays 1 sat to the bJobsX DIRECTORY address (a public signpost key), so Browse can list them.
// - A profile counts only if its BRC-3 signature verifies against the identity key it names, for exactly those JSON
//   bytes. The newest by its signed `at` wins, so a copy of an old profile re-sent later can't bring it back.
// Indexes only point; the chain is the source. Results are cached in memory for a minute.
import { ProtoWallet, PublicKey, Transaction } from '@bsv/sdk';
import * as R from '../mint/records.js';
import { cleanPublic } from '../lib/linkedin.js';

export const WOC = () => (process.env.WOC_API || 'https://api.whatsonchain.com/v1/bsv/main').replace(/\/$/, '');
const TXID_RE = /^[0-9a-f]{64}$/;
const KEY_RE = /^0[23][0-9a-f]{64}$/;
/** How many of an address's newest transactions are looked at. */
export const SCAN = { profile: 20, directory: 200 };
const anyone = new ProtoWallet('anyone');
const sha256 = async (d) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(d)));

/** The owner's profile key (hex) for an identity key. */
export async function profileKeyFor(identityKey) {
  return (await anyone.getPublicKey({ protocolID: R.PROTOCOL, keyID: R.PROFILE_KEY_ID, counterparty: identityKey })).publicKey;
}
export const profileAddressFor = async (identityKey) => PublicKey.fromString(await profileKeyFor(identityKey)).toAddress();

/** Does this signature by `identityKey` cover exactly these JSON bytes? */
export async function verifyProfile({ json, identityKey, signature }) {
  if (!KEY_RE.test(String(identityKey))) return false;
  try {
    const r = await anyone.verifySignature({ data: Array.from(await sha256(json)), signature: Array.from(signature), protocolID: R.PROTOCOL, keyID: R.PROFILE_KEY_ID, counterparty: identityKey });
    return r?.valid === true;
  } catch { return false; }
}

/** Every valid bJobsX profile in a raw transaction: [{ identityKey, at, profile, txid, vout }]. */
export async function profilesInTx(rawHex) {
  let tx;
  try { tx = Transaction.fromHex(rawHex); } catch { return []; }
  const txid = tx.id('hex'), out = [];
  for (const [vout, o] of tx.outputs.entries()) {
    const p = R.parseProfileScript(o.lockingScript.toHex());
    if (!p) continue;
    const j = R.readProfileJson(p.json);
    if (!j || !(await verifyProfile(p))) continue;
    out.push({ identityKey: p.identityKey, at: j.at, profile: cleanPublic(j.profile), txid, vout });
  }
  return out;
}

const getJson = async (fetchFn, url, ms = 4000) => {
  try {
    const r = await fetchFn(url, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } });
    if (r.status === 404) return { ok: true, json: null }; // WhatsOnChain: an address with no history
    return { ok: r.ok, json: r.ok ? await r.json().catch(() => null) : null };
  } catch { return { ok: false, json: null }; }
};

/** An address's newest transactions (unconfirmed first, then confirmed, newest first). Null when the index is down. */
export async function historyFor(address, limit, fetchFn = fetch) {
  const [u, c] = await Promise.all([
    getJson(fetchFn, `${WOC()}/address/${address}/unconfirmed/history`),
    getJson(fetchFn, `${WOC()}/address/${address}/confirmed/history?order=desc&limit=${limit}`),
  ]);
  if (!c.ok) return null;
  const rows = (j) => (Array.isArray(j?.result) ? j.result : []).filter((x) => TXID_RE.test(String(x?.tx_hash)));
  const conf = rows(c.json).sort((a, b) => (b.height || 0) - (a.height || 0));
  const seen = new Set(), out = [];
  for (const x of [...rows(u.json), ...conf]) if (!seen.has(x.tx_hash)) { seen.add(x.tx_hash); out.push(x.tx_hash); }
  return out.slice(0, limit);
}

/** Raw transactions by txid (WhatsOnChain bulk, 20 at a time). -> Map txid -> hex */
export async function rawTxs(txids, fetchFn = fetch) {
  const out = new Map();
  for (let i = 0; i < txids.length; i += 20) {
    const chunk = txids.slice(i, i + 20);
    try {
      const r = await fetchFn(`${WOC()}/txs/hex`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ txids: chunk }), signal: AbortSignal.timeout(6000) });
      const j = r.ok ? await r.json().catch(() => null) : null;
      for (const x of Array.isArray(j) ? j : []) if (TXID_RE.test(String(x?.txid)) && typeof x.hex === 'string' && /^[0-9a-f]+$/i.test(x.hex)) out.set(x.txid, x.hex);
    } catch {}
  }
  return out;
}

const newest = (a, b) => (!a || Date.parse(b.at) > Date.parse(a.at) ? b : a);

const cache = new Map();
const TTL = 60_000;
const cached = (k) => { const c = cache.get(k); return c && Date.now() - c.t < TTL ? c.v : undefined; };
const keep = (k, v) => { if (cache.size > 2000) cache.clear(); cache.set(k, { t: Date.now(), v }); return v; };
export const clearCache = () => cache.clear();

/**
 * The owner's current public profile from chain: { profile|null, updatedAt, txid } (profile null = they published
 * "nothing public"), null when they never published, or { unavailable: true } when the index couldn't be reached.
 * `hint` is a txid the owner's browser just published (an index can lag a few seconds); it is checked like any other.
 */
export async function latestProfile(identityKey, { hint = null, fetchFn = fetch } = {}) {
  if (!KEY_RE.test(String(identityKey))) return null;
  const useCache = !hint && fetchFn === fetch;
  if (useCache) { const c = cached('p:' + identityKey); if (c !== undefined) return c; }
  const ids = await historyFor(await profileAddressFor(identityKey), SCAN.profile, fetchFn);
  if (!ids) return { unavailable: true };
  if (hint && TXID_RE.test(hint) && !ids.includes(hint)) ids.unshift(hint);
  const raw = await rawTxs(ids, fetchFn);
  let best = null;
  for (const id of ids) for (const p of raw.has(id) ? await profilesInTx(raw.get(id)) : []) if (p.identityKey === identityKey) best = newest(best, p);
  const v = best ? { profile: best.profile, updatedAt: best.at, txid: best.txid } : null;
  return useCache ? keep('p:' + identityKey, v) : v;
}

/** Browse: the newest profile per identity key in the directory, only those with something public, newest first. Null when the index is down. */
export async function directory({ limit = SCAN.directory, fetchFn = fetch } = {}) {
  const useCache = fetchFn === fetch;
  if (useCache) { const c = cached('dir'); if (c !== undefined) return c; }
  const ids = await historyFor(R.DIRECTORY_ADDRESS, limit, fetchFn);
  if (!ids) return null;
  const raw = await rawTxs(ids, fetchFn), byKey = new Map();
  for (const id of ids) for (const p of raw.has(id) ? await profilesInTx(raw.get(id)) : []) byKey.set(p.identityKey, newest(byKey.get(p.identityKey), p));
  const v = [...byKey.values()].filter((p) => p.profile).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return useCache ? keep('dir', v) : v;
}
