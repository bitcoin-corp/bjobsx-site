// Publish on chain: building the signed profile output, reading it back from a transaction, and the /api/profile shape.
// The "wallet" is a @bsv/sdk ProtoWallet with a random key; WhatsOnChain, the push server and paymail are stubbed.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ProtoWallet, PrivateKey, PublicKey, Transaction, LockingScript, UnlockingScript, Hash, Utils } from '@bsv/sdk';
import * as L from '../lib/linkedin.js';
import * as R from '../mint/records.js';
import * as C from '../api/_chain.js';
import { files } from './fixture.mjs';

const d = L.fromTexts(Object.entries(files).map(([name, text]) => ({ name, text })));
const all = L.cleanPublic(L.publicProfile(d, L.PUBLIC_SECTIONS));
const T1 = '2026-11-15T10:00:00.000Z', T2 = '2026-11-15T11:00:00.000Z', T3 = '2026-11-15T12:00:00.000Z';

/** A transaction holding `outputs` (scripts as hex), with a dummy input. -> { hex, txid } */
function txOf(outputs) {
  const tx = new Transaction();
  tx.addInput({ sourceTXID: Utils.toHex(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))), sourceOutputIndex: 0, unlockingScript: new UnlockingScript(), sequence: 0xffffffff });
  for (const o of outputs) tx.addOutput({ lockingScript: LockingScript.fromHex(o.lockingScript), satoshis: o.satoshis });
  return { hex: tx.toHex(), txid: tx.id('hex') };
}
async function publish(wallet, profile, at) {
  return txOf((await R.profileOutputs(wallet, R.profileContent(profile, at))).outputs);
}

/** Fake WhatsOnChain: address -> [txid] (newest first), txid -> hex. */
function woc({ history = {}, txs = {}, down = false } = {}) {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push(url);
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (down) return { ok: false, status: 503, json: async () => null };
    let m = url.match(/\/address\/([^/]+)\/(confirmed|unconfirmed)\/history/);
    if (m) {
      if (m[2] === 'unconfirmed') return ok({ result: [] });
      const ids = history[m[1]];
      return ids ? ok({ result: ids.map((tx_hash, i) => ({ tx_hash, height: 1000 - i })) }) : { ok: false, status: 404, json: async () => null };
    }
    if (url.endsWith('/txs/hex')) return ok(JSON.parse(init.body).txids.filter((t) => txs[t]).map((txid) => ({ txid, hex: txs[txid] })));
    return { ok: false, status: 404, json: async () => null };
  };
  return { fetchFn, calls };
}

beforeEach(() => C.clearCache());

test('ripemd160 and P2PKH match @bsv/sdk; the directory address is the public "anyone" derivation', async () => {
  for (const n of [0, 1, 55, 56, 64, 65, 200]) {
    const m = Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
    assert.equal(Utils.toHex(Array.from(R.ripemd160(m))), Utils.toHex(Hash.ripemd160(m)));
  }
  const k = PrivateKey.fromRandom().toPublicKey();
  assert.equal(await R.p2pkhForKey(k.toString()), '76a914' + Utils.toHex(Hash.hash160(k.encode(true))) + '88ac');
  const dir = (await new ProtoWallet('anyone').getPublicKey({ protocolID: R.PROTOCOL, keyID: 'profile directory', counterparty: 'anyone', forSelf: true })).publicKey;
  assert.equal(PublicKey.fromString(dir).toAddress(), R.DIRECTORY_ADDRESS);
  assert.equal(await R.p2pkhForKey(dir), R.DIRECTORY_SCRIPT);
});

test('cleanPublic keeps an import exactly (so Publish compares), and drops what a page never shows', () => {
  assert.deepEqual(all, L.publicProfile(d, L.PUBLIC_SECTIONS));
  assert.equal(L.cleanPublic(null), null);
  assert.equal(L.cleanPublic({ v: 1 }), null);
  const x = L.cleanPublic({ name: 'A', headline: 'B', evil: '<script>', positions: [{ title: 'T', _secret: 1 }], websites: ['javascript:alert(1)', 'https://ok.example'] });
  assert.deepEqual(Object.keys(x), ['v', 'name', 'headline', 'summary', 'location', 'industry', 'websites', 'positions']);
  assert.deepEqual(x.websites, ['https://ok.example']);
  assert.deepEqual(Object.keys(x.positions[0]), ['company', 'title', 'location', 'description', 'startedOn', 'finishedOn']);
  assert.ok(!JSON.stringify(L.cleanPublic(L.publicProfile(d, L.PUBLIC_SECTIONS))).includes('Fakeperson')); // never connections
});

test('build: one OP_RETURN with the JSON, signed by the identity key; two 1-sat markers; fee estimate covers it', async () => {
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const id = (await w.getPublicKey({ identityKey: true })).publicKey;
  const json = R.profileContent(all, T1);
  const o = await R.profileOutputs(w, json);
  assert.equal(o.identityKey, id);
  assert.deepEqual(o.outputs.map((x) => x.satoshis), [0, 1, 1]);
  assert.ok(o.outputs[0].lockingScript.startsWith('006a'));
  assert.equal(o.outputs[2].lockingScript, R.DIRECTORY_SCRIPT);
  // the profile marker pays the key anyone can derive from the identity key, which is also the signing key
  assert.equal(o.signerKey, await C.profileKeyFor(id));
  assert.equal(o.outputs[1].lockingScript, await R.p2pkhForKey(o.signerKey));
  const p = R.parseProfileScript(o.outputs[0].lockingScript);
  assert.equal(p.identityKey, id);
  assert.deepEqual(Array.from(p.json), Array.from(json));
  assert.deepEqual(R.readProfileJson(p.json), { at: T1, profile: all });
  assert.equal(await C.verifyProfile(p), true);
  const tx = txOf(o.outputs);
  assert.ok(R.profileTxBytes(json.length) >= tx.hex.length / 2, 'estimate is not below the real size (inputs aside)');
  assert.ok(R.profileCost(json.length, 100).totalSats > 2);
  // the private-record parser doesn't mistake it, and vice versa
  assert.equal(R.parseRecordScript(o.outputs[0].lockingScript), null);
  assert.equal(R.parseProfileScript(R.recordScript('0'.repeat(32), [1, 2, 3])), null);
  // empty profile = nothing public
  assert.deepEqual(R.readProfileJson(R.profileContent(null, T2)), { at: T2, profile: null });
});

test('read: the newest valid profile for the key, from the profile address; nothing stored anywhere', async () => {
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const id = (await w.getPublicKey({ identityKey: true })).publicKey;
  const a = await publish(w, all, T1);
  const b = await publish(w, L.cleanPublic(L.publicProfile(d, ['intro'])), T2);
  const addr = await C.profileAddressFor(id);
  const { fetchFn } = woc({ history: { [addr]: [b.txid, a.txid] }, txs: { [a.txid]: a.hex, [b.txid]: b.hex } });
  const r = await C.latestProfile(id, { fetchFn });
  assert.equal(r.txid, b.txid);
  assert.equal(r.updatedAt, T2);
  assert.deepEqual(Object.keys(r.profile), ['v', 'name', 'headline']);
  assert.equal(r.profile.name, 'Ada Testwright');
});

test('tampered JSON is rejected', async () => {
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const id = (await w.getPublicKey({ identityKey: true })).publicKey;
  const o = await R.profileOutputs(w, R.profileContent(all, T1));
  const p = R.parseProfileScript(o.outputs[0].lockingScript);
  const forged = R.profileContent({ ...all, headline: 'CEO of Everything' }, T1);
  const bad = R.profileScriptFrom(forged, id, Utils.toHex(Array.from(p.signature)));
  assert.equal(await C.verifyProfile(R.parseProfileScript(bad)), false);
  const t = txOf([{ lockingScript: bad, satoshis: 0 }]);
  assert.deepEqual(await C.profilesInTx(t.hex), []);
  const addr = await C.profileAddressFor(id);
  assert.equal(await C.latestProfile(id, { fetchFn: woc({ history: { [addr]: [t.txid] }, txs: { [t.txid]: t.hex } }).fetchFn }), null);
});

test('a wrong signer is rejected: someone else\'s signature can\'t speak for your key', async () => {
  const victim = (await new ProtoWallet(PrivateKey.fromRandom()).getPublicKey({ identityKey: true })).publicKey;
  const mallory = new ProtoWallet(PrivateKey.fromRandom());
  const json = R.profileContent({ v: 1, name: 'Not you', headline: 'Fake' }, T3);
  // Mallory signs with her own wallet and writes the victim's identity key into the script
  const { signature } = await mallory.createSignature({ data: Array.from(Hash.sha256(Array.from(json))), protocolID: R.PROTOCOL, keyID: R.PROFILE_KEY_ID, counterparty: 'anyone' });
  const script = R.profileScriptFrom(json, victim, Utils.toHex(signature));
  assert.equal(await C.verifyProfile(R.parseProfileScript(script)), false);
  // ...and even paying the victim's profile address doesn't help
  const addr = await C.profileAddressFor(victim);
  const t = txOf([{ lockingScript: script, satoshis: 0 }, { lockingScript: await R.p2pkhForKey(await C.profileKeyFor(victim)), satoshis: 1 }]);
  assert.equal(await C.latestProfile(victim, { fetchFn: woc({ history: { [addr]: [t.txid] }, txs: { [t.txid]: t.hex } }).fetchFn }), null);
  // a signature under a different keyID doesn't count either
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const id = (await w.getPublicKey({ identityKey: true })).publicKey;
  const s2 = await w.createSignature({ data: Array.from(Hash.sha256(Array.from(json))), protocolID: R.PROTOCOL, keyID: 'something else', counterparty: 'anyone' });
  assert.equal(await C.verifyProfile({ json, identityKey: id, signature: s2.signature }), false);
});

test('"Make all private" supersedes; an old profile re-sent later can\'t come back (newest signed time wins)', async () => {
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const id = (await w.getPublicKey({ identityKey: true })).publicKey;
  const a = await publish(w, all, T1);
  const off = await publish(w, null, T2);
  const replay = txOf([(await R.profileOutputs(w, R.profileContent(all, T1))).outputs[0]]); // same old content, newer tx
  const addr = await C.profileAddressFor(id);
  const { fetchFn } = woc({ history: { [addr]: [replay.txid, off.txid, a.txid] }, txs: { [a.txid]: a.hex, [off.txid]: off.hex, [replay.txid]: replay.hex } });
  const r = await C.latestProfile(id, { fetchFn });
  assert.equal(r.profile, null);
  assert.equal(r.txid, off.txid);
});

test('the owner\'s just-published txid counts before the index shows it; an index outage says so', async () => {
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const id = (await w.getPublicKey({ identityKey: true })).publicKey;
  const a = await publish(w, all, T1);
  const addr = await C.profileAddressFor(id);
  const r = await C.latestProfile(id, { hint: a.txid, fetchFn: woc({ history: { [addr]: [] }, txs: { [a.txid]: a.hex } }).fetchFn });
  assert.equal(r.txid, a.txid);
  // someone else's tx as a hint is ignored
  const other = await publish(new ProtoWallet(PrivateKey.fromRandom()), all, T2);
  assert.equal(await C.latestProfile(id, { hint: other.txid, fetchFn: woc({ txs: { [other.txid]: other.hex } }).fetchFn }), null);
  assert.deepEqual(await C.latestProfile(id, { fetchFn: woc({ down: true }).fetchFn }), { unavailable: true });
});

test('directory (Browse): newest per owner, only those with something public, signatures checked', async () => {
  const w1 = new ProtoWallet(PrivateKey.fromRandom()), w2 = new ProtoWallet(PrivateKey.fromRandom());
  const id1 = (await w1.getPublicKey({ identityKey: true })).publicKey;
  const a = await publish(w1, all, T1), b = await publish(w2, all, T1), c = await publish(w2, null, T2);
  const junk = txOf([{ lockingScript: R.DIRECTORY_SCRIPT, satoshis: 1 }]);
  const { fetchFn } = woc({ history: { [R.DIRECTORY_ADDRESS]: [junk.txid, c.txid, b.txid, a.txid] }, txs: { [a.txid]: a.hex, [b.txid]: b.hex, [c.txid]: c.hex, [junk.txid]: junk.hex } });
  const list = await C.directory({ fetchFn });
  assert.deepEqual(list.map((p) => p.identityKey), [id1]);
  assert.equal(list[0].profile.headline, all.headline);
  assert.equal(await C.directory({ fetchFn: woc({ down: true }).fetchFn }), null);
});

// ── /api/profile shape: only the source changed ──
const PAGE_KEYS = ['identityKey', 'paymail', 'alias', 'displayName', 'avatar', 'username', 'usernameSaved', 'profile', 'updatedAt', 'settingsLive'];

test('/api/profile page shape is unchanged (two additions); the profile comes from chain, never the push server', async () => {
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const id = (await w.getPublicKey({ identityKey: true })).publicKey;
  const a = await publish(w, L.cleanPublic(L.publicProfile(d, ['intro', 'skills'])), T1);
  const addr = await C.profileAddressFor(id);
  const chain = woc({ history: { [addr]: [a.txid] }, txs: { [a.txid]: a.hex } });
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    // the push server still answers with a (stale) profile: it must be ignored
    if (u.includes('/v1/job-profiles?name=ada')) return ok({ identityKey: id, username: 'ada', profile: { v: 1, name: 'STALE', headline: 'from the push server' }, updatedAt: '2026-01-01T00:00:00Z' });
    if (u.includes('/v1/job-profiles?')) return ok({ username: 'ada', profile: { v: 1, name: 'STALE' }, updatedAt: null });
    if (u.includes('/lookup?key=')) return ok({ paymail: 'ada@bwalletx.com', alias: 'ada' });
    if (u.includes('/profile/')) return ok({ name: 'Ada', avatar: null });
    return chain.fetchFn(u, init);
  };
  try {
    const { loadProfile } = await import('../api/_lib.js');
    for (const q of [{ name: 'ada' }, { identityKey: id }]) {
      C.clearCache();
      const page = await loadProfile(q);
      assert.deepEqual(Object.keys(page), [...PAGE_KEYS, 'profileTxid', 'chainOk']);
      assert.equal(page.identityKey, id);
      assert.equal(page.username, 'ada');
      assert.equal(page.usernameSaved, true);
      assert.equal(page.settingsLive, true);
      assert.equal(page.profile.name, 'Ada Testwright');
      assert.equal(page.profile.headline, all.headline); // page.profile.headline, as the home page reads it
      assert.deepEqual(page.profile.skills, d.skills);
      assert.equal(page.updatedAt, T1);
      assert.equal(page.profileTxid, a.txid);
      assert.equal(page.chainOk, true);
      assert.ok(!JSON.stringify(page).includes('STALE'));
    }
    // Browse reads the same way: name + headline from chain, linked by username
    const { browse } = await import('../api/browse.js');
    const out = await browse(async () => [{ identityKey: id, at: T1, profile: { v: 1, name: 'Ada Testwright', headline: 'H' }, txid: a.txid }]);
    assert.deepEqual(out, { profiles: [{ username: 'ada', name: 'Ada Testwright', headline: 'H', updatedAt: T1 }], live: true });
    assert.deepEqual(await browse(async () => null), { profiles: [], live: false });
  } finally { globalThis.fetch = real; }
});
