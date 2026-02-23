import React from 'react';
import { useAccount } from '../context/AccountContext';

export default function AccountTypeToggle() {
  const { accountType, setAccountType, isDemoInactive } = useAccount();

  return (
    <div className="account-type-toggle" role="group" aria-label="Account type">
      <button
        type="button"
        className={`account-type-btn ${accountType === 'live' ? 'active' : ''}`}
        onClick={() => setAccountType('live')}
        aria-pressed={accountType === 'live'}
      >
        Live
      </button>
      <button
        type="button"
        className={`account-type-btn ${accountType === 'demo' ? 'active' : ''} ${isDemoInactive ? 'disabled' : ''}`}
        onClick={() => !isDemoInactive && setAccountType('demo')}
        disabled={isDemoInactive}
        aria-pressed={accountType === 'demo'}
        title={isDemoInactive ? 'Demo is inactive when funds have been added to your live account' : 'Demo account'}
      >
        Demo
        {isDemoInactive && <span className="account-type-badge">Inactive</span>}
      </button>
    </div>
  );
}
