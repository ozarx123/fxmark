import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  RobotIcon,
  BrainIcon,
  ChartLineUpIcon,
  CopyIcon,
  FacebookLogoIcon,
  WhatsAppLogoIcon,
  TwitterLogoIcon,
  LinkedinLogoIcon,
  TelegramLogoIcon,
  InstagramLogoIcon,
} from '../../components/Icons.jsx';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import { usePammUpdate } from '../../context/MarketDataContext';
import * as pammApi from '../../api/pammApi';
import * as ibApi from '../../api/ibApi';
import { ProfileAvatar } from '../../components/ui';
import PammFollowModal from './PammFollowModal';
import { equityCurveData } from './pammMockData';

const formatCurrency = (n, decimals = 0) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n ?? 0);

const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n || 0).toFixed(1)}%`;

// Share text; URL is built with ref=IB referral code so signups count as referrals and earnings = IB commission (layers)
const PAMM_AI_SHARE_TEXT = 'Check out BULL RUN — AI-driven PAMM fund on FXMARK. Sign in to explore and follow.';

function buildPammAiShareUrl(referralCode) {
  if (typeof window === 'undefined') return '';
  const code = referralCode && String(referralCode).trim();
  const params = new URLSearchParams();
  if (code) params.set('ref', code);
  params.set('redirect', '/pamm-ai');
  return `${window.location.origin}/auth?${params.toString()}`;
}

const SOCIAL_SHARES = [
  {
    name: 'Facebook',
    href: (url, text) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    icon: FacebookLogoIcon,
  },
  {
    name: 'WhatsApp',
    href: (url) =>
      `https://api.whatsapp.com/send?text=${encodeURIComponent(url || '')}`,
    icon: WhatsAppLogoIcon,
  },
  {
    name: 'Twitter',
    href: (url, text) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text || url)}&url=${encodeURIComponent(url)}`,
    icon: TwitterLogoIcon,
  },
  {
    name: 'LinkedIn',
    href: (url) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    icon: LinkedinLogoIcon,
  },
  {
    name: 'Telegram',
    href: (url, text) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text || '')}`,
    icon: TelegramLogoIcon,
  },
  {
    name: 'Instagram',
    href: () => 'https://www.instagram.com/',
    icon: InstagramLogoIcon,
    title: 'Copy link then paste in Instagram',
    copyOnly: true,
  },
];

export default function PammAi() {
  const { isAuthenticated } = useAuth();
  const { refreshLiveBalance } = useAccount();
  const { pammUpdateAt } = usePammUpdate();
  const [fund, setFund] = useState(null);
  const [stats, setStats] = useState(null);
  const [fundDetail, setFundDetail] = useState(null); // { recentTrades, myAllocation } when authenticated
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // Build share URL; when user is IB include ref=referralCode so signups = referrals, earnings = IB commission (layers)
  useEffect(() => {
    if (!isAuthenticated) {
      setShareUrl(buildPammAiShareUrl(null));
      return;
    }
    let cancelled = false;
    ibApi
      .getMyProfile()
      .then((profile) => {
        if (cancelled) return;
        const code = profile?.referralCode?.trim() || null;
        setShareUrl(buildPammAiShareUrl(code));
      })
      .catch(() => {
        if (!cancelled) setShareUrl(buildPammAiShareUrl(null));
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const handleCopyShareLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleSocialShare = useCallback((item) => {
    if (item.copyOnly) {
      handleCopyShareLink();
      if (item.href()) window.open(item.href(), '_blank', 'noopener,noreferrer');
      return;
    }
    const url = item.href(shareUrl, PAMM_AI_SHARE_TEXT);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }, [handleCopyShareLink, shareUrl]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Prefer a dedicated AI/BULL RUN fund if present; fall back gracefully.
      const managers = await pammApi.listManagers().catch(() => []);
      const list = Array.isArray(managers) ? managers : [];
      const bullRun = list.find(
        (m) =>
          (m.name || '').toUpperCase() === 'BULL RUN' ||
          (m.fundType || '').toLowerCase() === 'ai'
      ) || list[0] || null;
      if (!bullRun) {
        setFund(null);
        setStats(null);
        setFundDetail(null);
        setError('No PAMM AI fund is configured yet.');
      } else {
        const aiFund = {
          ...bullRun,
          name: 'BULL RUN',
        };
        setFund(aiFund);
        setStats({
          aum: aiFund.aum ?? aiFund.fundSize ?? 0,
          investors: aiFund.investors ?? 0,
          fundGrowthRate: aiFund.fundGrowthRate ?? aiFund.pnlPercent ?? 0,
          cumulativePnl: aiFund.cumulativePnl ?? 0,
        });
        // When authenticated, load fund detail for trades + current user's allocation (share)
        if (isAuthenticated) {
          const detail = await pammApi.getFundDetail(aiFund.id).catch(() => null);
          if (detail) {
            setFundDetail({
              recentTrades: detail.recentTrades || [],
              myAllocation: detail.myAllocation || null,
              stats: detail.stats || null,
            });
          } else {
            setFundDetail(null);
          }
        } else {
          setFundDetail(null);
        }
      }
    } catch (e) {
      setError(e.message || 'Failed to load PAMM AI fund');
      setFund(null);
      setStats(null);
      setFundDetail(null);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (pammUpdateAt) loadData();
  }, [pammUpdateAt, loadData]);

  const handleFollow = async (managerId, amount) => {
    await pammApi.follow(managerId, amount);
    refreshLiveBalance?.();
    await loadData();
  };

  return (
    <div className="page pamm-page pamm-ai-page">
      <header className="page-header">
        <div>
          <h1>PAMM AI</h1>
          <p className="page-subtitle">
            AI-assisted portfolio management · single flagship fund
          </p>
        </div>
        <div className="page-header-actions">
          <Link to="/pamm" className="btn btn-secondary btn-sm">
            Classic PAMM
          </Link>
        </div>
      </header>

      {loading && <p className="muted">Loading PAMM AI…</p>}
      {error && !loading && <p className="form-error">{error}</p>}

      {!loading && fund && (
        <>
          <section className="pamm-section pamm-ai-hero">
            <div className="pamm-ai-profile">
              <div className="pamm-ai-profile-header">
                <ProfileAvatar name={fund.name || 'BULL RUN'} size={56} verified />
                <div>
                  <h2 className="pamm-section-title" style={{ marginBottom: '0.25rem' }}>BULL RUN · AI PAMM fund</h2>
                  <p className="muted">
                    BULL RUN is a professionally managed AI-driven fund that combines systematic models
                    with discretionary risk oversight. It is designed for investors who want institutional-style
                    portfolio management, without having to trade manually.
                  </p>
                </div>
              </div>
              <div className="pamm-ai-hero-stats">
                <div className="pamm-ai-hero-stat">
                  <span className="label">Fund growth</span>
                  <span className={`value ${(stats?.fundGrowthRate ?? 0) >= 0 ? 'positive' : 'negative'}`}>
                    {formatPercent(stats?.fundGrowthRate ?? 0)}
                  </span>
                </div>
                <div className="pamm-ai-hero-stat">
                  <span className="label">AUM</span>
                  <span className="value">{formatCurrency(stats?.aum ?? 0)}</span>
                </div>
                <div className="pamm-ai-hero-stat">
                  <span className="label">Followers</span>
                  <span className="value">{stats?.investors ?? 0}</span>
                </div>
              </div>
              <div className="pamm-ai-hero-actions">
                {isAuthenticated ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setFollowModalOpen(true)}
                  >
                    Follow BULL RUN
                  </button>
                ) : (
                  <Link to="/auth" className="btn btn-primary">
                    Sign in to follow
                  </Link>
                )}
                <Link to={`/pamm/fund/${fund.id}`} className="btn btn-secondary btn-sm">
                  View full fund details
                </Link>
                {isAuthenticated && shareUrl && (
                  <div className="pamm-ai-share-wrap">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm pamm-ai-share-copy"
                      onClick={handleCopyShareLink}
                      title="Copy referral link — signups count as your referrals; earnings = IB commission (layers)"
                    >
                      <CopyIcon size={18} />
                      {shareCopied ? 'Copied!' : 'Copy link'}
                    </button>
                    <div className="pamm-ai-share-social">
                      <span className="pamm-ai-share-social-label">Share</span>
                      {SOCIAL_SHARES.map((s) => (
                        <a
                          key={s.name}
                          href={s.copyOnly ? s.href() : s.href(shareUrl, PAMM_AI_SHARE_TEXT)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="pamm-ai-share-social-btn"
                          aria-label={`Share on ${s.name}`}
                          title={s.title || `Share on ${s.name}`}
                          onClick={(e) => {
                            if (s.copyOnly) {
                              e.preventDefault();
                              handleSocialShare(s);
                            }
                          }}
                        >
                          <s.icon size={22} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="pamm-summary-cards">
            <div className="pamm-card pamm-card--ai">
              <h3>
                <span className="icon-inline">
                  <RobotIcon size={18} />
                </span>
                Fund name
              </h3>
              <p className="pamm-value">{fund.name || 'BULL RUN'}</p>
              <span className="pamm-meta">Managed by superadmin · AI strategies</span>
            </div>
            <div className="pamm-card">
              <h3>
                <ChartLineUpIcon size={18} />
                Fund growth
              </h3>
              <p className={`pamm-value ${((stats?.fundGrowthRate ?? 0) >= 0 ? 'positive' : 'negative')}`}>
                {formatPercent(stats?.fundGrowthRate ?? 0)}
              </p>
              <span className="pamm-meta">Since inception</span>
            </div>
            <div className="pamm-card">
              <h3>Total AUM</h3>
              <p className="pamm-value">{formatCurrency(stats?.aum ?? 0)}</p>
              <span className="pamm-meta">Assets under management</span>
            </div>
            <div className="pamm-card">
              <h3>Followers</h3>
              <p className="pamm-value">{stats?.investors ?? 0}</p>
              <span className="pamm-meta">Active investors</span>
            </div>
            <div className="pamm-card">
              <h3>Cumulative P&L</h3>
              <p className={`pamm-value ${((stats?.cumulativePnl ?? 0) >= 0 ? 'positive' : 'negative')}`}>
                {formatCurrency(stats?.cumulativePnl ?? 0, 2)}
              </p>
              <span className="pamm-meta">Total realized performance (all time)</span>
            </div>
          </section>

          {/* Trades with follower's share of P&L */}
          <section className="pamm-section">
            <h2 className="pamm-section-title">Fund trades · your share</h2>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              {fundDetail?.myAllocation
                ? `Your allocation: ${formatCurrency(fundDetail.myAllocation.allocatedBalance)} (${Number(fundDetail.myAllocation.allocationPercent ?? 0).toFixed(1)}% of fund). P&L below is your share of each trade.`
                : 'Recent BULL RUN trades. Follow the fund to see your share of P&L per trade.'}
            </p>
            <div className="table-wrap">
              <table className="table pamm-table">
                <thead>
                  <tr>
                    <th>Trade ID</th>
                    <th>Date</th>
                    <th>Side</th>
                    <th>Fund P&L</th>
                    {fundDetail?.myAllocation && (
                      <>
                        <th>Your share</th>
                        <th>Your P&L</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(!fundDetail?.recentTrades || fundDetail.recentTrades.length === 0) ? (
                    <tr>
                      <td colSpan={fundDetail?.myAllocation ? 6 : 4} className="empty-cell">
                        No trades yet
                      </td>
                    </tr>
                  ) : (
                    fundDetail.recentTrades.map((t) => {
                      const allocationPercent = fundDetail.myAllocation?.allocationPercent ?? 0;
                      const yourPnl = fundDetail.myAllocation
                        ? (Number(t.pnl) || 0) * (allocationPercent / 100)
                        : null;
                      return (
                        <tr key={t.id || t.positionId}>
                          <td><code className="trade-id">{t.positionId || t.id || '—'}</code></td>
                          <td>{t.createdAt ? new Date(t.createdAt).toLocaleString() : '—'}</td>
                          <td>
                            <span className={`type-badge type-${(t.side || '').toLowerCase()}`}>
                              {t.side || '—'}
                            </span>
                          </td>
                          <td className={(t.pnl ?? 0) >= 0 ? 'positive' : 'negative'}>
                            {formatCurrency(t.pnl ?? 0, 2)}
                          </td>
                          {fundDetail.myAllocation && (
                            <>
                              <td>{Number(allocationPercent).toFixed(1)}%</td>
                              <td className={(yourPnl ?? 0) >= 0 ? 'positive' : 'negative'}>
                                {yourPnl != null ? formatCurrency(yourPnl, 2) : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pamm-section">
            <h2 className="pamm-section-title">Fund growth (index)</h2>
            <p className="muted" style={{ marginBottom: '0.75rem' }}>
              Visualize the BULL RUN fund growth over time. This view is optimized for AI-driven strategies.
            </p>
            <div className="pamm-chart-wrap">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={equityCurveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" tick={{ fill: '#aaa', fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: '#aaa', fontSize: 11 }}
                    tickFormatter={(v) => v}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#15151b',
                      border: '1px solid rgba(255,255,255,0.12)',
                    }}
                    formatter={(v) => [v, 'Index']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--fxmark-orange)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="pamm-section">
            <h2 className="pamm-section-title">AI integrations</h2>
            <div className="cards-row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
              <div className="card">
                <h3>
                  <BrainIcon size={18} /> Signal engine
                </h3>
                <p className="muted">
                  Connect external AI signal providers or in-house models to drive BULL RUN
                  entries and exits. This is a conceptual placeholder for your AI integrations.
                </p>
              </div>
              <div className="card">
                <h3>
                  <BrainIcon size={18} /> Risk overlays
                </h3>
                <p className="muted">
                  Configure risk caps, volatility filters, and RL-based position sizing on top
                  of the core strategy.
                </p>
              </div>
              <div className="card">
                <h3>
                  <BrainIcon size={18} /> Analytics API
                </h3>
                <p className="muted">
                  Export anonymized performance data to your analytics stack for backtesting
                  and monitoring.
                </p>
              </div>
            </div>
          </section>

          <section className="pamm-section">
            <h2 className="pamm-section-title">Fund profile</h2>
            <div className="pamm-ai-profile">
              <div className="pamm-ai-profile-header">
                <ProfileAvatar name={fund.name || 'BULL RUN'} size={48} verified />
                <div>
                  <h3>BULL RUN · AI PAMM fund</h3>
                  <p className="muted">
                    Managed by a professional fund manager, BULL RUN uses machine learning signals, quantitative
                    trend filters, and strict risk limits to seek consistent returns across major FX pairs and gold.
                    Human oversight reviews model outputs, adjusts risk in changing markets, and protects capital
                    during high-volatility periods.
                  </p>
                </div>
              </div>
              <ul className="pamm-ai-profile-list">
                <li>
                  <strong>Strategy</strong>
                  <span>{fund.strategy || 'AI-enhanced trend following and mean-reversion mix.'}</span>
                </li>
                <li>
                  <strong>Instruments</strong>
                  <span>Major FX pairs, XAU/USD, selected indices.</span>
                </li>
                <li>
                  <strong>Risk profile</strong>
                  <span>Moderate to high · target max drawdown 20–25%.</span>
                </li>
              </ul>
            </div>
          </section>

          {!isAuthenticated && (
            <section className="pamm-section">
              <h2 className="pamm-section-title">Get started</h2>
              <p className="muted">
                Sign in and go to the classic PAMM section to allocate to the BULL RUN fund
                when it is made available to investors.
              </p>
              <Link to="/auth" className="btn btn-primary">
                Sign in
              </Link>
            </section>
          )}
        </>
      )}

      {followModalOpen && fund && (
        <PammFollowModal
          managerName={fund.name || 'BULL RUN'}
          managerId={fund.id}
          onConfirm={handleFollow}
          onClose={() => setFollowModalOpen(false)}
        />
      )}
    </div>
  );
}

