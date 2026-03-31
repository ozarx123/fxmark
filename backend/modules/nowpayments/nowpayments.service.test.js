import test from 'node:test';
import assert from 'node:assert/strict';

import { __internals } from './nowpayments.service.js';

test('status mapping works', () => {
  assert.deepEqual(__internals.mapProviderStatus('waiting'), {
    providerStatus: 'waiting',
    internalStatus: 'pending',
  });
  assert.deepEqual(__internals.mapProviderStatus('confirming'), {
    providerStatus: 'confirming',
    internalStatus: 'processing',
  });
  assert.deepEqual(__internals.mapProviderStatus('finished'), {
    providerStatus: 'finished',
    internalStatus: 'completed',
  });
});

test('network derives from usdtbsc', () => {
  assert.equal(__internals.deriveNetworkFromPayload({ pay_currency: 'usdtbsc' }), 'BEP20');
});

test('paid amount parser prefers actually_paid and handles fallbacks', () => {
  assert.equal(__internals.parsePaidAmount({ actually_paid: '12.2', pay_amount: '12.0' }), 12.2);
  assert.equal(__internals.parsePaidAmount({ pay_amount: '9.5' }), 9.5);
  assert.equal(__internals.parsePaidAmount({ outcome_amount: 8.1 }), 8.1);
  assert.equal(__internals.parsePaidAmount({}), null);
});

test('scaled amount precision uses 6 decimals', () => {
  assert.equal(__internals.toScaled(1.234567), 1234567);
  assert.equal(__internals.toScaled('0.000001'), 1);
});
