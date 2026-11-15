import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalise, isTokenPay, hasShares, sharesCompany, payNotes, TOKEN_PAY_NOTE } from '../lib/contracts-view.js';

// The bit-sign registry's shape (GET /api/bitsign/contracts, #715): `pay` is the ruled public line, `pay_parts` the parts.
const row = (pay, pay_parts) => ({ id: 'x-1', title: 'A job', line: 'Do a thing', status: 'open', version: '1', pay, pay_parts, poster: '$acme', poster_name: 'Acme Widgets Ltd' });

test('registry pay_parts: BSV + token + equity keeps the ruled line and the notices', () => {
  const c = normalise(row('0.5 BSV + 50,000 $TERRORNODE + equity in Acme Widgets Ltd', [
    { unit: 'BSV', amount: '0.5' },
    { unit: 'token', ticker: '$TERRORNODE', amount: '50000', token_id: 'ab_0', link: 'https://whatsonchain.com/tx/ab' },
    { unit: 'equity', company: 'Acme Widgets Ltd', company_number: '12345678' },
  ]));
  assert.ok(c);
  assert.equal(c.pay, '0.5 BSV + 50,000 $TERRORNODE + equity in Acme Widgets Ltd');
  assert.equal(isTokenPay(c), true);
  assert.equal(hasShares(c), true);
  assert.equal(sharesCompany(c), 'Acme Widgets Ltd');
  assert.equal(payNotes(c).length, 2);
  assert.ok(payNotes(c).includes(TOKEN_PAY_NOTE));
  // Never a count, % or value for shares.
  assert.deepEqual(c.payParts.find((p) => p.unit === 'equity'), { unit: 'equity', company: 'Acme Widgets Ltd' });
});

test('registry token with a null amount reads "terms given to the chosen contractor"', () => {
  const c = normalise(row('', [{ unit: 'BSV', amount: '1' }, { unit: 'token', ticker: '$TERRORNODE', amount: null }]));
  assert.equal(c.pay, '1 BSV + $TERRORNODE (terms given to the chosen contractor)');
  assert.equal(isTokenPay(c), true);
  assert.equal(hasShares(c), false);
});

test('registry BSV-only pay has no notices', () => {
  const c = normalise(row('1 BSV', [{ unit: 'BSV', amount: '1' }]));
  assert.equal(isTokenPay(c), false);
  assert.deepEqual(payNotes(c), []);
});
