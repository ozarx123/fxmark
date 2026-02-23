import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { InstagramLogo, TwitterLogo, TelegramLogo, YoutubeLogo } from '@phosphor-icons/react';
import { discoverMasters } from './copyMockData';
import FollowModal from './FollowModal';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const formatPercent = (n) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%`;

const socialIcons = [
  { key: 'instagram', Icon: InstagramLogo, label: 'Instagram' },
  { key: 'x', Icon: TwitterLogo, label: 'X' },
  { key: 'telegram', Icon: TelegramLogo, label: 'Telegram' },
  { key: 'youtube', Icon: YoutubeLogo, label: 'YouTube' },
];

export default function MasterProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [showFollowModal, setShowFollowModal] = useState(false);

  const master = discoverMasters.find((m) => m.slug === slug);

  if (!master) {
    return (
      <div className="page copy-page">
        <header className="page-header">
          <h1>Master not found</h1>
          <Link to="/copy" className="copy-back-link">← Back to Copy Trading</Link>
        </header>
      </div>
    );
  }

  const handleFollowConfirm = (payload) => {
    console.log('Follow', master.slug, payload);
    setShowFollowModal(false);
    navigate('/copy/following');
  };

  return (
    <div className="page copy-page copy-master-profile-page">
      <header className="page-header">
        <Link to="/copy" className="copy-back-link">← Copy Trading</Link>
        <h1>{master.name}</h1>
        <p className="page-subtitle">{master.strategy}</p>
        <span className={`copy-status copy-status--${master.status}`}>{master.status}</span>
      </header>

      <section className="copy-section copy-profile-stats">
        <div className="copy-profile-stat-cards">
          <div className="copy-profile-stat">
            <span className="copy-profile-stat-value">{formatPercent(master.pnlPercent)}</span>
            <span className="copy-profile-stat-label">P&L</span>
          </div>
          <div className="copy-profile-stat">
            <span className="copy-profile-stat-value">{formatPercent(master.growthYtd)}</span>
            <span className="copy-profile-stat-label">YTD</span>
          </div>
          <div className="copy-profile-stat">
            <span className="copy-profile-stat-value">{master.riskScore}</span>
            <span className="copy-profile-stat-label">Risk score</span>
          </div>
          <div className="copy-profile-stat">
            <span className="copy-profile-stat-value">{master.drawdown}%</span>
            <span className="copy-profile-stat-label">Drawdown</span>
          </div>
          <div className="copy-profile-stat">
            <span className="copy-profile-stat-value">{master.followers}</span>
            <span className="copy-profile-stat-label">Followers</span>
          </div>
          <div className="copy-profile-stat">
            <span className="copy-profile-stat-value">{formatCurrency(master.aum)}</span>
            <span className="copy-profile-stat-label">AUM</span>
          </div>
        </div>
      </section>

      <section className="copy-section copy-profile-social">
        <h2 className="copy-section-title">Connect</h2>
        <div className="copy-profile-social-links">
          {socialIcons.map(({ key, Icon, label }) => {
            const url = master.social[key];
            if (!url) return null;
            return (
              <a key={key} href={url} target="_blank" rel="noopener noreferrer" className="copy-social-link" aria-label={label} title={label}>
                <Icon weight="fill" size={24} />
              </a>
            );
          })}
        </div>
      </section>

      <section className="copy-section copy-profile-follow">
        <p className="muted">Performance updates hourly. Only allocated capital is used in C&B mode.</p>
        <button type="button" className="btn btn-primary" onClick={() => setShowFollowModal(true)}>
          Follow this master
        </button>
      </section>

      {showFollowModal && (
        <FollowModal
          masterName={master.name}
          masterSlug={master.slug}
          onConfirm={handleFollowConfirm}
          onClose={() => setShowFollowModal(false)}
        />
      )}
    </div>
  );
}
