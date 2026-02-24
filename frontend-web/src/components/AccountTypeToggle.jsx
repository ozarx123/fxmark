import React from 'react';
import { useAccount } from '../context/AccountContext';

export default function AccountTypeToggle() {
  const { accounts, activeAccount, setActiveAccount, isDemoInactive } = useAccount();
  const isDemo = activeAccount?.type === 'demo';
  const demoAccounts = accounts.filter((a) => a.type === 'demo');
  const liveAccounts = accounts.filter((a) => a.type === 'live');

  const switchToDemo = () => {
    if (isDemoInactive) return;
    const first = demoAccounts[0];
    if (first) setActiveAccount(first);
  };

  const switchToLive = () => {
    const first = liveAccounts[0];
    if (first) setActiveAccount(first);
  };

  return (
    <div className="account-type-toggle" role="group" aria-label="Account type">
      <button
        type="button"
        className={`account-type-btn ${!isDemo ? 'active' : ''}`}
        onClick={switchToLive}
        aria-pressed={!isDemo}
        disabled={liveAccounts.length === 0}
        title={liveAccounts.length === 0 ? 'No live account' : 'Live account'}
      >
        Live
      </button>
      <button
        type="button"
        className={`account-type-btn ${isDemo ? 'active' : ''} ${isDemoInactive ? 'disabled' : ''}`}
        onClick={switchToDemo}
        disabled={isDemoInactive}
        aria-pressed={isDemo}
        title={isDemoInactive ? 'Demo is inactive when funds have been added to your live account' : 'Demo account'}
      >
        Demo
        {isDemoInactive && <span className="account-type-badge">Inactive</span>}
      </button>
    </div>
  );
}
