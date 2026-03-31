import test from 'node:test';
import assert from 'node:assert/strict';

import { closeRedisConnection } from '../../src/services/cache.js';
import { clearPayoutAuthTokenCache, getPayoutAuthToken } from './nowpayments.client.js';

test('payout auth token is reused until expiry', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  process.env.NOWPAYMENTS_API_BASE = 'https://api.nowpayments.io/v1';
  clearPayoutAuthTokenCache();
  global.fetch = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ token: `t-${calls}` }),
    };
  };

  try {
    const a = await getPayoutAuthToken({ email: 'x@x.com', password: 'secret' });
    const b = await getPayoutAuthToken({ email: 'x@x.com', password: 'secret' });
    assert.equal(a, 't-1');
    assert.equal(b, 't-1');
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
    clearPayoutAuthTokenCache();
    await closeRedisConnection();
  }
});
