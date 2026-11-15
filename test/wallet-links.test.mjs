import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PrivateKey, ProtoWallet, Utils } from '@bsv/sdk';
import { signedMessage, verifyLink, walletLinks } from '../api/_social.js';

// Sign a link the way bWalletX does: BRC-43 [2,'bwallet paymail'], keyID '1', counterparty 'anyone'.
async function signedRow(priv, over = {}) {
  const w = new ProtoWallet(priv);
  const identityKey = priv.toPublicKey().toString();
  const f = { provider: 'linkedin', account: 'abc123', handle: 'ada', identityKey, timestamp: '1763200000000', ...over };
  const { signature } = await w.createSignature({ data: Utils.toArray(signedMessage('link', f), 'utf8'), protocolID: [2, 'bwallet paymail'], keyID: '1', counterparty: 'anyone' });
  return { ...f, signature: Utils.toHex(signature) };
}

test('a link signed by the wallet verifies; tampered or foreign ones do not', async () => {
  const k = PrivateKey.fromRandom(), other = PrivateKey.fromRandom();
  const key = k.toPublicKey().toString();
  const row = await signedRow(k);
  assert.equal(await verifyLink(row, key), true);
  assert.equal(await verifyLink({ ...row, handle: 'eve' }, key), false);
  assert.equal(await verifyLink(await signedRow(other, { identityKey: key }), key), false);
});

test('walletLinks keeps only verified, known providers, one each', async () => {
  const k = PrivateKey.fromRandom();
  const key = k.toPublicKey().toString();
  const good = await signedRow(k);
  const gh = await signedRow(k, { provider: 'github', handle: 'ada-gh' });
  const fake = { ...(await signedRow(k, { provider: 'x' })), handle: 'forged' };
  const odd = await signedRow(k, { provider: 'myspace' });
  const fetchJson = async () => ({ status: 200, json: { links: [good, good, gh, fake, odd] } });
  assert.deepEqual(await walletLinks(key, { fetchJson }), [{ provider: 'linkedin', handle: 'ada' }, { provider: 'github', handle: 'ada-gh' }]);
});

test('walletLinks is empty when the server is down or the key is bad', async () => {
  assert.deepEqual(await walletLinks('nope'), []);
  const k = PrivateKey.fromRandom().toPublicKey().toString();
  assert.deepEqual(await walletLinks(k, { fetchJson: async () => ({ status: 0, json: null }) }), []);
});
