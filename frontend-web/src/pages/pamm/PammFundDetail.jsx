import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import * as pammApi from '../../api/pammApi';
import BullRunFundDetailView from './BullRunFundDetailView';

export default function PammFundDetail() {
  const { fundId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const { refreshLiveBalance } = useAccount();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadDetail = useCallback(async () => {
    if (!fundId) return;
    setLoading(true);
    setError('');
    try {
      const data = await pammApi.getFundDetail(fundId);
      setDetail(data);
    } catch (e) {
      setError(e.message || 'Failed to load fund');
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleFollow = async (managerId, amount) => {
    await pammApi.follow(managerId, amount);
    refreshLiveBalance?.();
    loadDetail();
  };

  const handleAddFunds = async (allocationId, amount) => {
    await pammApi.addFunds(allocationId, amount);
    refreshLiveBalance?.();
    loadDetail();
    setDetail((d) => d && { ...d, myAllocation: d.myAllocation ? { ...d.myAllocation, allocatedBalance: (d.myAllocation.allocatedBalance || 0) + amount } : null });
  };

  const handleWithdraw = async (allocationId, amount) => {
    await pammApi.withdraw(allocationId, amount);
    refreshLiveBalance?.();
    loadDetail();
  };

  const handleUnfollow = async (allocationId) => {
    await pammApi.unfollow(allocationId);
    refreshLiveBalance?.();
    navigate('/pamm-ai');
  };

  if (loading) {
    return (
      <div className="page pamm-page">
        <p className="muted">Loading fund…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="page pamm-page">
        <p className="form-error">{error || 'Fund not found'}</p>
        <Link to="/pamm-ai" className="btn btn-secondary">Back to PAMM AI</Link>
      </div>
    );
  }

  const { fund, stats, myAllocation, bullRun } = detail;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await pammApi.getFundDetail(fundId);
      setDetail(data);
      setError('');
    } catch (e) {
      setError(e.message || 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const isManager = !!(fund?.userId && user?.id && String(fund.userId) === String(user.id));

  if (bullRun) {
    return (
      <BullRunFundDetailView
        fundId={fundId}
        fund={fund}
        stats={stats}
        myAllocation={myAllocation}
        bullRun={bullRun}
        onRefresh={handleRefresh}
        onReload={loadDetail}
        refreshing={refreshing}
        onFollow={handleFollow}
        onAddFunds={handleAddFunds}
        onWithdraw={handleWithdraw}
        onUnfollow={handleUnfollow}
        refreshLiveBalance={refreshLiveBalance}
        isManager={isManager}
      />
    );
  }

  return (
    <div className="page pamm-page">
      <p className="form-error">This fund is not a Bull Run (PAMM AI) fund.</p>
      <Link to="/pamm-ai" className="btn btn-secondary">Back to PAMM AI</Link>
    </div>
  );
}
