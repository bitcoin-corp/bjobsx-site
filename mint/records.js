// bJobsX private profile records: pure helpers (browser + node). No network, no wallet state.
// Same shape as bvideox.com mint/records.js; the item is a profile section instead of a video.
//
// (The PUBLIC PROFILE that Publish writes is further down: "the public profile, on chain".)
//
// Each record is encrypted with the owner's own keys (BRC-100 wallet.encrypt, BRC-2, protocol [2,'bjobsx records'],
// counterparty self, a fresh random key id per record). The chain shows that a record exists, its size and time; only
// the owner's 12 words open it. Publishing one record in clear is opt-in ("Make public").
//
// Output script (one per record, 0 sats):
//   OP_FALSE OP_RETURN B <ciphertext> application/octet-stream binary | MAP SET app bjobsx type record v 1 enc brc2 kid <kid>
// Public record (opt-in, one minted record in clear):
//   OP_FALSE OP_RETURN B <json> application/json utf-8 | MAP SET app bjobsx type record-public v 1 reveal <txid:vout> kid <kid>
//     | BRC3 <publicKey> <signature over sha256(json)>

export const PROTOCOL = [2, 'bjobsx records'];
export const LABEL = PROTOCOL[1];
export const APP = 'bjobsx';
export const VERSION = '1';
export const B_PREFIX = '19HxigV4QyBv3tHpQVcUEQyq1pzZVdoAut';
export const MAP_PREFIX = '1PuQa7K62MiKCtssSLKy1kh56WWU7MtUR5';
export const SIG = 'BRC3';
export const PER_TX = 25;
export const PAD_BUCKET = 128;
/** BRC-2: 32-byte IV + AES-GCM ciphertext + 16-byte tag. */
export const BRC2_OVERHEAD = 48;
/** Inputs, change output, version/locktime per transaction (estimate). */
export const TX_OVERHEAD_BYTES = 400;
/** The premium output (P2PKH, 8 + 1 + 25). */
export const PREMIUM_OUTPUT_BYTES = 34;
/**
 * Wallet getVersion().pinnedProtocols value that includes [2,'bjobsx records'] pinned to bjobsx.com. bWalletX's
 * services/pinnedProtocols.ts is at 2 (bmintx archive, bvideox records); bjobsx needs the next entry, 3.
 */
export const PIN_VERSION = 3;
/** Connections are minted (only when ticked) in private chunks of this many people per record. */
export const CONNECTIONS_PER_RECORD = 500;
export const KINDS = ['profile', 'position', 'education', 'certification', 'connections'];

const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from(String(h).match(/../g) ?? [], (x) => parseInt(x, 16));
const sha256 = async (d) => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', d));

/** Stable short id for an item's content (FNV-1a 64), so the same position is the same item on every import. */
export function itemId(kind, parts) {
  let h = 0xcbf29ce484222325n;
  for (const b of enc.encode(kind + '\u0000' + parts.join('\u0000'))) { h ^= BigInt(b); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return `${kind}-${h.toString(16).padStart(16, '0')}`;
}

/**
 * Every mintable item in an import (lib/linkedin.js shape): the whole profile, each position, education entry and
 * certification, and (only when `withConnections`) the connections in private chunks.
 * -> [{ id, kind, title, data }]
 */
export function itemsFor(d, { withConnections = false } = {}) {
  const p = d.profile || {}, out = [];
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  if (d.profile || d.positions.length || d.education.length || d.skills.length || d.certifications.length) {
    const data = { profile: d.profile, positions: d.positions, education: d.education, skills: d.skills, certifications: d.certifications };
    out.push({ id: itemId('profile', [JSON.stringify(data)]), kind: 'profile', title: `Whole profile${name ? ': ' + name : ''}`, data });
  }
  for (const x of d.positions) out.push({ id: itemId('position', [x.company, x.title, x.startedOn]), kind: 'position', title: [x.title, x.company].filter(Boolean).join(' at '), data: x });
  for (const x of d.education) out.push({ id: itemId('education', [x.school, x.degree, x.startedOn]), kind: 'education', title: [x.degree, x.school].filter(Boolean).join(', '), data: x });
  for (const x of d.certifications) out.push({ id: itemId('certification', [x.name, x.authority, x.startedOn]), kind: 'certification', title: [x.name, x.authority].filter(Boolean).join(' · '), data: x });
  if (withConnections) {
    for (let i = 0; i < d.connections.length; i += CONNECTIONS_PER_RECORD) {
      const chunk = d.connections.slice(i, i + CONNECTIONS_PER_RECORD);
      out.push({ id: itemId('connections', [JSON.stringify(chunk)]), kind: 'connections', title: `Connections ${i + 1} to ${i + chunk.length} (private only)`, data: chunk });
    }
  }
  return out;
}

/** The record: kind, id, data + sha256 of {kind,id,data} JSON (hex). */
export async function recordFor(item) {
  const body = { kind: item.kind, id: item.id, data: item.data };
  return { v: 1, app: APP, ...body, sha256: hex(await sha256(enc.encode(JSON.stringify(body)))) };
}
/** JSON then spaces up to the next PAD_BUCKET (JSON.parse ignores trailing whitespace), so sizes say less. */
export function pad(rec, bucket = PAD_BUCKET) {
  const raw = enc.encode(JSON.stringify(rec));
  const out = new Uint8Array(Math.ceil((raw.length + 1) / bucket) * bucket).fill(0x20);
  out.set(raw);
  return out;
}
export function readRecord(plaintext) {
  const j = JSON.parse(dec.decode(Uint8Array.from(plaintext)));
  if (!j || j.v !== 1 || j.app !== APP || !KINDS.includes(j.kind) || typeof j.id !== 'string') throw new Error('not a bjobsx record');
  return j;
}
/** Does the record's sha256 match its contents? */
export async function checkRecord(r) {
  return hex(await sha256(enc.encode(JSON.stringify({ kind: r.kind, id: r.id, data: r.data })))) === r.sha256;
}
/** 128-bit random key id, hex: says nothing about the record. */
export const newKeyId = (rand = (a) => globalThis.crypto.getRandomValues(a)) => hex(rand(new Uint8Array(16)));

// ── scripts ───────────────────────────────────────────────────────────────────
const pushData = (d) => {
  const n = d.length;
  const head = n < 0x4c ? [n] : n <= 0xff ? [0x4c, n] : n <= 0xffff ? [0x4d, n & 0xff, n >> 8] : [0x4e, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24];
  return [...head, ...d];
};
const s = (t) => enc.encode(t);
const PIPE = s('|');
const opReturn = (parts) => hex([0x00, 0x6a, ...parts.flatMap((p) => pushData(Array.from(p)))]);

export const recordScript = (kid, ciphertext) => opReturn([
  s(B_PREFIX), Uint8Array.from(ciphertext), s('application/octet-stream'), s('binary'), PIPE,
  s(MAP_PREFIX), s('SET'), s('app'), s(APP), s('type'), s('record'), s('v'), s(VERSION), s('enc'), s('brc2'), s('kid'), s(kid),
]);

export function readPushes(scriptHex) {
  const b = unhex(scriptHex);
  if (b[0] !== 0x00 || b[1] !== 0x6a) return null;
  const out = [];
  for (let i = 2; i < b.length;) {
    const op = b[i++];
    let n;
    if (op < 0x4c) n = op;
    else if (op === 0x4c) n = b[i++];
    else if (op === 0x4d) { n = b[i] | (b[i + 1] << 8); i += 2; }
    else if (op === 0x4e) { n = (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + b[i + 3] * 2 ** 24; i += 4; }
    else return null;
    if (i + n > b.length) return null;
    out.push(b.slice(i, i + n));
    i += n;
  }
  return out;
}
/** A record output's kid and ciphertext, or null. */
export function parseRecordScript(scriptHex) {
  const p = readPushes(scriptHex);
  if (!p || p.length !== 17) return null;
  const t = p.map((x) => dec.decode(x));
  if (t[0] !== B_PREFIX || t[4] !== '|' || t[5] !== MAP_PREFIX || t[8] !== APP || t[10] !== 'record' || t[14] !== 'brc2' || t[15] !== 'kid') return null;
  if (!/^[0-9a-f]{32}$/.test(t[16])) return null;
  return { kid: t[16], ciphertext: p[1] };
}

// ── premium payee (P2PKH from a base58check address) ──────────────────────────
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** P2PKH locking script for a mainnet address, checksum verified. Throws on anything else. */
export async function p2pkhScriptFor(address) {
  let n = 0n;
  for (const ch of String(address)) { const i = B58.indexOf(ch); if (i < 0) throw new Error('bad address'); n = n * 58n + BigInt(i); }
  let h = n.toString(16); if (h.length % 2) h = '0' + h;
  const lead = (String(address).match(/^1*/) || [''])[0].length;
  const b = Uint8Array.from([...new Array(lead).fill(0), ...unhex(h)]);
  if (b.length !== 25 || b[0] !== 0x00) throw new Error('not a mainnet P2PKH address');
  const sum = (await sha256(await sha256(b.slice(0, 21)))).slice(0, 4);
  if (hex(sum) !== hex(b.slice(21))) throw new Error('address checksum failed');
  return '76a914' + hex(b.slice(1, 21)) + '88ac';
}

// ── price ─────────────────────────────────────────────────────────────────────
/** Premium per record in sats from GBP and live rates (rounded up, at least 1 sat). */
export const premiumSats = (gbpPerItem, usdPerBsv, usdPerGbp) => Math.max(1, Math.ceil((gbpPerItem * usdPerGbp / usdPerBsv) * 1e8));
const pushLen = (n) => n + (n < 0x4c ? 1 : n <= 0xff ? 2 : n <= 0xffff ? 3 : 5);
/** Exact bytes of one record output (8-byte value + varint + script) for a padded plaintext length. */
export function outputBytes(plaintextBytes) {
  const parts = [B_PREFIX.length, plaintextBytes + BRC2_OVERHEAD, 24, 6, 1, MAP_PREFIX.length, 3, 3, APP.length, 4, 6, 1, 1, 3, 4, 3, 32];
  const script = 2 + parts.reduce((a, n) => a + pushLen(n), 0);
  return 8 + (script < 0xfd ? 1 : script <= 0xffff ? 3 : 5) + script;
}
export const feeSats = (bytes, satPerKb) => Math.ceil((bytes * satPerKb) / 1000);
/** Plan a mint: batches, bytes, network fee, premium. */
export async function plan(items, o) {
  const perTx = o.perTx || PER_TX, batches = [];
  for (let i = 0; i < items.length; i += perTx) batches.push(items.slice(i, i + perTx));
  let bytes = 0, fee = 0;
  for (const b of batches) {
    let tx = TX_OVERHEAD_BYTES + PREMIUM_OUTPUT_BYTES;
    for (const it of b) tx += outputBytes(pad(await recordFor(it)).length);
    bytes += tx; fee += feeSats(tx, o.satPerKb);
  }
  const prem = premiumSats(o.gbpPerItem, o.usdPerBsv, o.usdPerGbp);
  return { items: items.length, txs: batches.length, bytes, feeSats: fee, premiumSatsPerItem: prem, premiumSats: prem * items.length, totalSats: fee + prem * items.length, batches };
}

// ── encrypt / decrypt ─────────────────────────────────────────────────────────
/** Encrypt one batch with the wallet and build its outputs (records first, premium last when a payee is given). */
export async function encryptBatch(wallet, list, o = {}) {
  const outputs = [], items = [];
  for (const it of list) {
    const kid = newKeyId(o.rand);
    const { ciphertext } = await wallet.encrypt({ plaintext: Array.from(pad(await recordFor(it))), protocolID: PROTOCOL, keyID: kid, counterparty: 'self' });
    items.push({ itemId: it.id, kid, vout: outputs.length });
    outputs.push({ lockingScript: recordScript(kid, ciphertext), satoshis: 0, outputDescription: 'Private profile record' });
  }
  if (o.payeeScript && o.premiumSatsPerItem) outputs.push({ lockingScript: o.payeeScript, satoshis: o.premiumSatsPerItem * list.length, outputDescription: `bJobsX: 1p per record × ${list.length}` });
  return { outputs, items };
}
/** Decrypt one record output locally. */
export async function openRecord(wallet, scriptHex) {
  const r = parseRecordScript(scriptHex);
  if (!r) return null;
  const { plaintext } = await wallet.decrypt({ ciphertext: Array.from(r.ciphertext), protocolID: PROTOCOL, keyID: r.kid, counterparty: 'self' });
  return { kid: r.kid, record: readRecord(plaintext) };
}

/**
 * Run a mint, batch by batch, resumable. `done` is a map itemId -> outpoint already written; those are skipped.
 * Live: one createAction per batch (label 'bjobsx records', spendingAuthorization for the protocol, so the wallet
 * shows ONE sheet for the lock and the payment), then the txid is checked on chain before the batch is saved. Dry run: nothing is sent; built outputs go to onDry. After each batch, onBatch(entries) is
 * called with [{itemId, kid, outpoint}] so the caller saves progress before the next batch.
 */
export async function runMint(o) {
  const todo = o.items.filter((it) => !o.done?.[it.id]);
  const perTx = o.perTx || PER_TX;
  for (let i = 0; i < todo.length; i += perTx) {
    if (o.signal?.aborted) throw new Error('stopped');
    const vids = todo.slice(i, i + perTx);
    const b = await encryptBatch(o.wallet, vids, o);
    let txid;
    if (o.dryRun) { txid = 'dry' + (o.dryN = (o.dryN || 0) + 1); await o.onDry?.(b); }
    else {
      // acceptDelayedBroadcast: false — the wallet answers only once the network has it (24 Oct 2026: a queued send
      // came back with a txid no node had, and the page said "Done").
      const r = await o.wallet.createAction({
        description: `bJobsX: ${vids.length} private profile record${vids.length === 1 ? '' : 's'}`,
        outputs: b.outputs, labels: [LABEL],
        options: { randomizeOutputs: false, acceptDelayedBroadcast: false, spendingAuthorization: { protocolID: PROTOCOL } },
      });
      if (!r?.txid) throw new Error('The wallet returned no transaction.');
      txid = r.txid;
      // Never trust the answer alone: the batch counts as written only once the network shows the transaction.
      o.onChecking?.(txid);
      if (!(await (o.confirm || confirmOnChain)(txid, { pending: r.pending === true }))) throw notOnChain(txid);
    }
    await o.onBatch?.(b.items.map((it) => ({ itemId: it.itemId, kid: it.kid, outpoint: `${txid}:${it.vout}`, script: o.dryRun ? b.outputs[it.vout].lockingScript : undefined })));
  }
}

// ── did it really go out? ─────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ARC_SEEN = /^(SEEN_ON_NETWORK|MINED|ACCEPTED_BY_NETWORK|SEEN_IN_ORPHAN_MEMPOOL)$/;
/**
 * True once WhatsOnChain or GorillaPool ARC knows the transaction. Short retry (about 30 s; longer when the wallet
 * said the send is pending). `fetchFn` is injectable for tests.
 */
export async function confirmOnChain(txid, { pending = false, fetchFn = fetch, wait = sleep } = {}) {
  if (!/^[0-9a-f]{64}$/i.test(String(txid))) return false;
  const delays = pending ? [1500, 3000, 5000, 8000, 12000, 20000, 30000] : [1000, 2000, 3000, 5000, 8000, 12000];
  for (const d of delays) {
    try { const r = await fetchFn(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`, { cache: 'no-store' }); if (r.ok) return true; } catch {}
    try {
      const r = await fetchFn(`https://arc.gorillapool.io/v1/tx/${txid}`, { cache: 'no-store' });
      if (r.ok) { const j = await r.json().catch(() => null); if (j && ARC_SEEN.test(String(j.txStatus || ''))) return true; }
    } catch {}
    await wait(d);
  }
  return false;
}
/** The error a batch the network never showed raises. `code` lets the page word it. */
export function notOnChain(txid) {
  const e = new Error(`Your wallet answered, but the network doesn't show the transaction (${String(txid).slice(0, 10)}…), so nothing is marked as minted. Your bWalletX keeps trying to send it on its own; nothing more is charged if you wait. Check again in a few minutes before you press Mint again.`);
  e.code = 'NOT_ON_CHAIN'; e.txid = txid;
  return e;
}

// ── make one record public (opt-in) ───────────────────────────────────────────
/** The clear record + the owner's signature (key derived under the protocol, keyID 'public <kid>'). */
export async function publicScript(wallet, rec, kid, outpoint) {
  const json = enc.encode(JSON.stringify(rec));
  const keyID = `public ${kid}`;
  const { publicKey } = await wallet.getPublicKey({ protocolID: PROTOCOL, keyID, counterparty: 'self' });
  const { signature } = await wallet.createSignature({ data: Array.from(await sha256(json)), protocolID: PROTOCOL, keyID, counterparty: 'self' });
  return opReturn([
    s(B_PREFIX), json, s('application/json'), s('utf-8'), PIPE,
    s(MAP_PREFIX), s('SET'), s('app'), s(APP), s('type'), s('record-public'), s('v'), s(VERSION), s('reveal'), s(outpoint), s('kid'), s(kid),
    PIPE, s(SIG), s(publicKey), s(hex(signature)),
  ]);
}

// ── the public profile, on chain (Publish) ────────────────────────────────────
// bJobsX hosts no profile data. Publish writes ONE transaction from the owner's wallet:
//   out 0 (0 sats): OP_FALSE OP_RETURN B <json> application/json utf-8 | MAP SET app bjobsx type profile v 1
//                   | BRC3 <identityKey> <signature hex>
//   out 1 (1 sat):  P2PKH to the owner's profile key (the signing key below), so any address index finds it
//   out 2 (1 sat):  P2PKH to the bJobsX profile directory (a public signpost key nobody owns), so Browse can list it
// <json> is {"v":1,"app":"bjobsx","type":"profile","at":"<ISO time>","profile":{…only the ticked sections…}|null}.
// The signature is the wallet's BRC-100 createSignature over sha256(<json bytes>), protocol [2,'bjobsx records'],
// keyID 'public profile', counterparty 'anyone' (BRC-3). Anyone can check it: derive the signing key from the
// identity key with the 'anyone' key (ProtoWallet('anyone').verifySignature({counterparty: identityKey, …})).
// bWalletX pins [2,'bjobsx records'] to bjobsx.com, so no other site can make that key sign a profile in your name.
// The newest valid profile (by its signed `at`) wins; profile null means "nothing public". Earlier ones stay on chain.
export const PROFILE_TYPE = 'profile';
export const PROFILE_KEY_ID = 'public profile';
export const PROFILE_LABEL = 'bjobsx profile';
export const PROFILE_MAX_BYTES = 64 * 1024;
export const MARKER_SATS = 1;
/** The directory key: BRC-42 from the 'anyone' key ([2,'bjobsx records'], keyID 'profile directory'). Public, so nobody owns it. */
export const DIRECTORY_ADDRESS = '1PMF791xybPhwazLfFNGTpUPujb6XFz76B';
export const DIRECTORY_SCRIPT = '76a914f526dc86eee0ea5434ae559bc24ba771689c6a1788ac';
const SIG_HEX_MAX = 144; // DER signatures are at most 72 bytes

/** The exact bytes that go on chain and are signed. */
export const profileContent = (profile, at = new Date().toISOString()) =>
  enc.encode(JSON.stringify({ v: 1, app: APP, type: PROFILE_TYPE, at, profile: profile && typeof profile === 'object' ? profile : null }));

/** The profile output's script, from parts (pure). */
export const profileScriptFrom = (json, identityKey, signatureHex) => opReturn([
  s(B_PREFIX), Uint8Array.from(json), s('application/json'), s('utf-8'), PIPE,
  s(MAP_PREFIX), s('SET'), s('app'), s(APP), s('type'), s(PROFILE_TYPE), s('v'), s(VERSION),
  PIPE, s(SIG), s(identityKey), s(signatureHex),
]);

/** A profile output's json bytes, identity key and signature, or null. Says nothing about whether it verifies. */
export function parseProfileScript(scriptHex) {
  const p = readPushes(scriptHex);
  if (!p || p.length !== 17) return null;
  const t = (i) => dec.decode(p[i]);
  if (t(0) !== B_PREFIX || t(2) !== 'application/json' || t(4) !== '|' || t(5) !== MAP_PREFIX || t(6) !== 'SET' || t(7) !== 'app' || t(8) !== APP
    || t(9) !== 'type' || t(10) !== PROFILE_TYPE || t(11) !== 'v' || t(12) !== VERSION || t(13) !== '|' || t(14) !== SIG) return null;
  const identityKey = t(15), sig = t(16);
  if (!/^0[23][0-9a-f]{64}$/.test(identityKey) || !/^(?:[0-9a-f]{2}){8,72}$/.test(sig) || p[1].length > PROFILE_MAX_BYTES) return null;
  return { json: p[1], identityKey, signature: unhex(sig) };
}

/** Read the signed JSON: { at, profile } or null when it isn't a bJobsX profile. */
export function readProfileJson(json) {
  let j;
  try { j = JSON.parse(dec.decode(Uint8Array.from(json))); } catch { return null; }
  if (!j || typeof j !== 'object' || j.v !== 1 || j.app !== APP || j.type !== PROFILE_TYPE || typeof j.at !== 'string' || !Number.isFinite(Date.parse(j.at))) return null;
  if (j.profile !== null && (typeof j.profile !== 'object' || Array.isArray(j.profile))) return null;
  return { at: new Date(Date.parse(j.at)).toISOString(), profile: j.profile };
}

/** Bytes of the publish transaction for a JSON of `jsonBytes` (estimate: the signature is taken at its longest). */
export function profileTxBytes(jsonBytes) {
  const parts = [B_PREFIX.length, jsonBytes, 16, 5, 1, MAP_PREFIX.length, 3, 3, APP.length, 4, PROFILE_TYPE.length, 1, VERSION.length, 1, SIG.length, 66, SIG_HEX_MAX];
  const script = 2 + parts.reduce((a, n) => a + pushLen(n), 0);
  return TX_OVERHEAD_BYTES + 8 + (script < 0xfd ? 1 : script <= 0xffff ? 3 : 5) + script + 2 * PREMIUM_OUTPUT_BYTES;
}
/** What publishing costs: the network fee plus the two 1-sat markers. No bJobsX charge. */
export const profileCost = (jsonBytes, satPerKb) => { const fee = feeSats(profileTxBytes(jsonBytes), satPerKb); return { feeSats: fee, markerSats: 2 * MARKER_SATS, totalSats: fee + 2 * MARKER_SATS }; };

/** P2PKH locking script for a compressed public key (hex). */
export async function p2pkhForKey(pubHex) {
  return '76a914' + hex(ripemd160(await sha256(unhex(pubHex)))) + '88ac';
}

/**
 * Sign the profile with the wallet and build the publish outputs. -> { outputs, identityKey, signerKey }
 * The wallet asks once for [2,'bjobsx records'] with counterparty 'anyone' (signing, never decrypting).
 */
export async function profileOutputs(wallet, json) {
  const { publicKey: identityKey } = await wallet.getPublicKey({ identityKey: true });
  const { publicKey: signerKey } = await wallet.getPublicKey({ protocolID: PROTOCOL, keyID: PROFILE_KEY_ID, counterparty: 'anyone', forSelf: true });
  const { signature } = await wallet.createSignature({ data: Array.from(await sha256(Uint8Array.from(json))), protocolID: PROTOCOL, keyID: PROFILE_KEY_ID, counterparty: 'anyone' });
  return {
    identityKey, signerKey,
    outputs: [
      { lockingScript: profileScriptFrom(json, identityKey, hex(signature)), satoshis: 0, outputDescription: 'Public profile, signed by you' },
      { lockingScript: await p2pkhForKey(signerKey), satoshis: MARKER_SATS, outputDescription: 'Profile marker (finds your profile)' },
      { lockingScript: DIRECTORY_SCRIPT, satoshis: MARKER_SATS, outputDescription: 'bJobsX directory marker (lists it in Browse)' },
    ],
  };
}

// RIPEMD-160 (for P2PKH in the browser, which has only SHA in WebCrypto). Checked against @bsv/sdk in the tests.
const RL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13];
const RR = [5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11];
const SL = [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6];
const SR = [8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11];
const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
const KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];
const rol = (x, n) => (x << n) | (x >>> (32 - n));
const fr = (j, x, y, z) => (j < 16 ? x ^ y ^ z : j < 32 ? (x & y) | (~x & z) : j < 48 ? (x | ~y) ^ z : j < 64 ? (x & z) | (y & ~z) : x ^ (y | ~z));
export function ripemd160(msg) {
  const m = Uint8Array.from(msg), bits = m.length * 8;
  const len = (((m.length + 8) >> 6) + 1) << 6;
  const b = new Uint8Array(len); b.set(m); b[m.length] = 0x80;
  const dv = new DataView(b.buffer);
  dv.setUint32(len - 8, bits >>> 0, true); dv.setUint32(len - 4, Math.floor(bits / 2 ** 32), true);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const X = new Array(16);
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++) X[i] = dv.getUint32(o + i * 4, true);
    let al = h0, bl = h1, cl = h2, dl = h3, el = h4, ar = h0, br = h1, cr = h2, dr = h3, er = h4;
    for (let j = 0; j < 80; j++) {
      let t = (rol((al + fr(j, bl, cl, dl) + X[RL[j]] + KL[j >> 4]) | 0, SL[j]) + el) | 0;
      al = el; el = dl; dl = rol(cl, 10); cl = bl; bl = t;
      t = (rol((ar + fr(79 - j, br, cr, dr) + X[RR[j]] + KR[j >> 4]) | 0, SR[j]) + er) | 0;
      ar = er; er = dr; dr = rol(cr, 10); cr = br; br = t;
    }
    const t = (h1 + cl + dr) | 0;
    h1 = (h2 + dl + er) | 0; h2 = (h3 + el + ar) | 0; h3 = (h4 + al + br) | 0; h4 = (h0 + bl + cr) | 0; h0 = t;
  }
  const out = new Uint8Array(20), ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h >>> 0, true));
  return out;
}
