import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleNowpaymentsIpn,
  __setNowpaymentsIpnTestOverrides,
  __clearNowpaymentsIpnTestOverrides,
} from './nowpayments.service.js';

const baseOrder = () => ({
  orderId: 'fxm-dep1',
  paymentId: 999001,
  userId: 'user-1',
  depositTransactionId: 'depid1',
  expectedAmount: 100,
  amountUsd: 100,
  payCurrency: 'usdtbsc',
  payAddress: '0x1111111111111111111111111111111111111111',
  fraudFlags: [],
  expiresAt: new Date(Date.now() + 3600_000),
  status: 'created',
  credited: false,
});

function finishedPayload() {
  return {
    order_id: 'fxm-dep1',
    payment_id: 999001,
    payment_status: 'finished',
    pay_currency: 'usdtbsc',
    network: 'BEP20',
    actually_paid: 100,
    pay_address: '0x1111111111111111111111111111111111111111',
  };
}

test('IPN: same finished webhook 5 times — credit path runs once', async () => {
  let creditCalls = 0;
  let store = { ...baseOrder(), status: 'processing' };

  const repo = {
    async findByOrderId() {
      return { ...store };
    },
    async markRejected() {},
    async markExpired() {},
    async updateByOrderId(_id, patch) {
      store = { ...store, ...patch };
    },
    async countRecentByPayAddress() {
      return 0;
    },
    async countRecentSmallDeposits() {
      return 0;
    },
    async claimCreditForOrder() {
      if (store.credited || store.status === 'finished') return null;
      store = {
        ...store,
        credited: true,
        creditedAt: new Date(),
        status: 'finished',
        internalStatus: 'completed',
      };
      return {
        depositTransactionId: 'depid1',
        userId: 'user-1',
      };
    },
  };

  const fts = {
    async runPairedWithTransaction(fn) {
      await fn({});
    },
    async verifyWalletLedgerAfterMutation() {},
  };

  const ds = {
    async applyNowpaymentsDepositCredit() {
      creditCalls += 1;
    },
  };

  __setNowpaymentsIpnTestOverrides({ npRepo: repo, fts, depositService: ds });
  try {
    process.env.NOWPAYMENTS_PAY_CURRENCY = 'usdtbsc';
    const p = finishedPayload();
    for (let i = 0; i < 5; i++) {
      await handleNowpaymentsIpn(p, {});
    }
    assert.equal(creditCalls, 1);
  } finally {
    __clearNowpaymentsIpnTestOverrides();
  }
});

test('IPN: out-of-order confirming → waiting → finished credits once', async () => {
  let creditCalls = 0;
  let store = { ...baseOrder(), status: 'created' };

  const repo = {
    async findByOrderId() {
      return { ...store };
    },
    async markRejected() {},
    async markExpired() {},
    async updateByOrderId(_id, patch) {
      store = { ...store, ...patch };
    },
    async countRecentByPayAddress() {
      return 0;
    },
    async countRecentSmallDeposits() {
      return 0;
    },
    async claimCreditForOrder() {
      if (store.credited || store.status === 'finished') return null;
      store = {
        ...store,
        credited: true,
        creditedAt: new Date(),
        status: 'finished',
        internalStatus: 'completed',
      };
      return { depositTransactionId: 'depid1', userId: 'user-1' };
    },
  };

  const fts = {
    async runPairedWithTransaction(fn) {
      await fn({});
    },
    async verifyWalletLedgerAfterMutation() {},
  };

  const ds = {
    async applyNowpaymentsDepositCredit() {
      creditCalls += 1;
    },
  };

  __setNowpaymentsIpnTestOverrides({ npRepo: repo, fts, depositService: ds });
  try {
    process.env.NOWPAYMENTS_PAY_CURRENCY = 'usdtbsc';
    await handleNowpaymentsIpn(
      {
        ...finishedPayload(),
        payment_status: 'confirming',
        actually_paid: 100,
      },
      {},
    );
    await handleNowpaymentsIpn(
      {
        ...finishedPayload(),
        payment_status: 'waiting',
        actually_paid: 100,
      },
      {},
    );
    await handleNowpaymentsIpn(finishedPayload(), {});
    assert.equal(creditCalls, 1);
  } finally {
    __clearNowpaymentsIpnTestOverrides();
  }
});

test('IPN: finished then finished again does not double-credit', async () => {
  let creditCalls = 0;
  const repo = {
    async findByOrderId() {
      return {
        ...baseOrder(),
        status: 'finished',
        credited: true,
        creditedAt: new Date(),
      };
    },
    async markRejected() {},
    async markExpired() {},
    async updateByOrderId() {},
    async countRecentByPayAddress() {
      return 0;
    },
    async countRecentSmallDeposits() {
      return 0;
    },
    async claimCreditForOrder() {
      return { depositTransactionId: 'depid1', userId: 'user-1' };
    },
  };

  const fts = {
    async runPairedWithTransaction(fn) {
      await fn({});
    },
    async verifyWalletLedgerAfterMutation() {},
  };

  const ds = {
    async applyNowpaymentsDepositCredit() {
      creditCalls += 1;
    },
  };

  __setNowpaymentsIpnTestOverrides({ npRepo: repo, fts, depositService: ds });
  try {
    process.env.NOWPAYMENTS_PAY_CURRENCY = 'usdtbsc';
    await handleNowpaymentsIpn(finishedPayload(), {});
    await handleNowpaymentsIpn(finishedPayload(), {});
    assert.equal(creditCalls, 0);
  } finally {
    __clearNowpaymentsIpnTestOverrides();
  }
});
