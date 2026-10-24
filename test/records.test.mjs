import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProtoWallet, PrivateKey } from '@bsv/sdk';
import * as L from '../lib/linkedin.js';
import * as R from '../mint/records.js';
import { files } from './fixture.mjs';

const d = L.fromTexts(Object.entries(files).map(([name, text]) => ({ name, text })));
const TX = 'b6963e8c3bb87bf0609e607017748fe578ff3b3920811630fdb26d9897ec3a23';

test('items: whole profile + each position/education/cert; connections only when ticked; ids stable', () => {
  const a = R.itemsFor(d), b = R.itemsFor(L.fromTexts(Object.entries(files).map(([name, text]) => ({ name, text }))));
  assert.deepEqual(a.map((x) => x.kind), ['profile', 'position', 'position', 'position', 'education', 'education', 'certification', 'certification']);
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.ok(!JSON.stringify(a).includes('Fakeperson'));
  const c = R.itemsFor(d, { withConnections: true });
  assert.equal(c.filter((x) => x.kind === 'connections').length, 1);
});

test('encrypt with a real BRC-100 key, read back, script round-trips, size padded', async () => {
  const w = new ProtoWallet(PrivateKey.fromRandom());
  const items = R.itemsFor(d, { withConnections: true });
  const b = await R.encryptBatch(w, items, {});
  assert.equal(b.outputs.length, items.length);
  for (const [i, o] of b.outputs.entries()) {
    const r = await R.openRecord(w, o.lockingScript);
    assert.equal(r.record.id, items[i].id);
    assert.ok(await R.checkRecord(r.record));
    assert.equal(R.outputBytes(R.pad(await R.recordFor(items[i])).length), 8 + 1 + o.lockingScript.length / 2 + (o.lockingScript.length / 2 >= 0xfd ? 2 : 0));
    // ciphertext: no clear text from the import on chain
    assert.ok(!Buffer.from(o.lockingScript, 'hex').toString('latin1').includes('Example Labs'));
  }
  // a different wallet can't open it
  await assert.rejects(R.openRecord(new ProtoWallet(PrivateKey.fromRandom()), b.outputs[0].lockingScript));
});

test('plan: 1p per record + fee; premium output added; one createAction per 25', async () => {
  const items = Array.from({ length: 30 }, (_, i) => ({ id: 'position-' + i, kind: 'position', title: 't', data: { company: 'C' + i } }));
  const p = await R.plan(items, { satPerKb: 100, gbpPerItem: 0.01, usdPerBsv: 50, usdPerGbp: 1.3 });
  assert.equal(p.txs, 2); assert.equal(p.premiumSatsPerItem, R.premiumSats(0.01, 50, 1.3)); assert.ok(p.premiumSatsPerItem >= 26000 && p.premiumSatsPerItem <= 26001);
  assert.equal(p.totalSats, p.feeSats + p.premiumSatsPerItem * 30);
  const calls = [];
  const wallet = { encrypt: async () => ({ ciphertext: [1, 2, 3] }), createAction: async (a) => (calls.push(a), { txid: TX }) };
  const saved = [];
  await R.runMint({ wallet, items, payeeScript: '76a914' + '00'.repeat(20) + '88ac', premiumSatsPerItem: 7, confirm: async () => true, onBatch: (es) => saved.push(...es) });
  assert.equal(calls.length, 2);
  assert.match(calls[0].description, /^bJobsX: 25 private profile records$/);
  assert.equal(calls[0].outputs.at(-1).satoshis, 7 * 25);
  assert.equal(calls[0].options.acceptDelayedBroadcast, false);
  assert.deepEqual(calls[0].labels, ['bjobsx records']);
  assert.equal(saved.length, 30);
});

test('never "Done" when the network does not show the tx', async () => {
  const wallet = { encrypt: async () => ({ ciphertext: [1] }), createAction: async () => ({ txid: TX }) };
  let saved = 0;
  await assert.rejects(R.runMint({ wallet, items: R.itemsFor(d).slice(0, 1), confirm: async () => false, onBatch: () => { saved++; } }), (e) => e.code === 'NOT_ON_CHAIN');
  assert.equal(saved, 0);
  const res = (ok, body) => ({ ok, json: async () => body });
  assert.equal(await R.confirmOnChain(TX, { wait: async () => {}, fetchFn: async () => res(false) }), false);
  assert.equal(await R.confirmOnChain(TX, { wait: async () => {}, fetchFn: async (u) => res(u.includes('whatsonchain')) }), true);
});

test('payee address: checksum verified, no hardcoded address', async () => {
  await assert.rejects(R.p2pkhScriptFor('1BoatSLRHtKNngkdXEeobR76b53LETtpyX'), /checksum/);
  assert.equal(await R.p2pkhScriptFor('1BoatSLRHtKNngkdXEeobR76b53LETtpyT'), '76a9147680adec8eabcabac676be9e83854ade0bd22cdb88ac');
});
