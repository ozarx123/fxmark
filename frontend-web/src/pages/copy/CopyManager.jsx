import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { InstagramLogo, TwitterLogo, TelegramLogo, YoutubeLogo } from '@phosphor-icons/react';
import { myMasterProfile } from './copyMockData';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

const socialIcons = [
  { key: 'instagram', Icon: InstagramLogo, label: 'Instagram' },
  { key: 'x', Icon: TwitterLogo, label: 'X' },
  { key: 'telegram', Icon: TelegramLogo, label: 'Telegram' },
  { key: 'youtube', Icon: YoutubeLogo, label: 'YouTube' },
];

export default function CopyManager() {
  const [profile, setProfile] = useState({ ...myMasterProfile });

  const toggleStatus = () => {
    setProfile((p) => ({ ...p, status: p.status === 'live' ? 'paused' : 'live' }));
  };

  const publicProfileUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/copy/master/${profile.slug}`
    : '';

  return (
    <div className="page copy-page copy-manager-page">
      <header className="page-header">
        <h1>Master profile</h1>
        <p className="page-subtitle">Manage your public profile, LIVE/PAUSE, and risk defaults</p>
        <Link to="/copy" className="copy-back-link">← Copy Trading</Link>
      </header>

      <section className="copy-section copy-manager-section">
        <h2 className="copy-section-title">Profile</h2>
        <div className="copy-manager-grid">
          <div className="copy-manager-form-wrap">
            <div className="copy-manager-status-row">
              <span className="copy-status-label">Status</span>
              <span className={`copy-status copy-status--${profile.status}`}>{profile.status}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={toggleStatus}>
                {profile.status === 'live' ? 'Pause' : 'Go LIVE'}
              </button>
            </div>
            <div className="copy-manager-field">
              <span className="form-label">Display name</span>
              <span className="copy-manager-value">{profile.name}</span>
            </div>
            <div className="copy-manager-field">
              <span className="form-label">Profile slug (public link)</span>
              <span className="copy-manager-value copy-manager-slug">/copy/master/{profile.slug}</span>
            </div>
            <div className="copy-manager-field">
              <span className="form-label">Strategy</span>
              <p className="copy-manager-strategy">{profile.strategy}</p>
            </div>
            <div className="copy-manager-field">
              <span className="form-label">Social links</span>
              <div className="copy-manager-social">
                {socialIcons.map(({ key, Icon, label }) => (
                  <a
                    key={key}
                    href={profile.social[key] || '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="copy-social-link"
                    aria-label={label}
                    title={label}
                  >
                    <Icon weight="fill" size={22} />
                  </a>
                ))}
              </div>
            </div>
            <div className="copy-manager-field">
              <span className="form-label">Risk defaults (for new followers)</span>
              <ul className="copy-manager-risk-list">
                <li>Spread filter: {profile.riskDefaults.spreadFilter ? 'On' : 'Off'}</li>
                <li>News protection: {profile.riskDefaults.newsProtection ? 'On' : 'Off'}</li>
                <li>Max daily loss: {profile.riskDefaults.maxDailyLossPct}%</li>
                <li>Max drawdown: {profile.riskDefaults.maxDrawdownPct}%</li>
              </ul>
            </div>
          </div>
          <div className="copy-manager-stats">
            <div className="copy-manager-stat">
              <span className="copy-manager-stat-value">{formatPercent(profile.pnlPercent)}</span>
              <span className="copy-manager-stat-label">P&L</span>
            </div>
            <div className="copy-manager-stat">
              <span className="copy-manager-stat-value">{profile.followers}</span>
              <span className="copy-manager-stat-label">Followers</span>
            </div>
            <div className="copy-manager-stat">
              <span className="copy-manager-stat-value">{formatCurrency(profile.aum)}</span>
              <span className="copy-manager-stat-label">AUM</span>
            </div>
            <div className="copy-manager-stat">
              <span className="copy-manager-stat-value">{profile.riskScore}</span>
              <span className="copy-manager-stat-label">Risk score</span>
            </div>
          </div>
        </div>
      </section>

      <section className="copy-section copy-manager-share">
        <h2 className="copy-section-title">Share your profile</h2>
        <p className="muted">Your profile updates hourly. Share the link so followers can discover you.</p>
        <div className="copy-manager-share-row">
          <input type="text" readOnly value={publicProfileUrl} className="form-input copy-share-input" />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              navigator.clipboard?.writeText(publicProfileUrl);
            }}
          >
            Copy link
          </button>
        </div>
      </section>
    </div>
  );
}
