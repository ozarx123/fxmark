import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileAvatar from '../../components/ProfileAvatar';
import { getKyc, submitKyc } from '../../api/userApi';
import { getApiBase } from '../../config/apiBase.js';

const API_BASE = getApiBase();

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France',
  'Japan', 'Singapore', 'South Korea', 'India', 'Brazil', 'Netherlands',
  'Switzerland', 'Spain', 'Italy', 'Sweden', 'Norway', 'Ireland', 'Other',
];

export default function ProfileSettings() {
  const { user, token, login } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [country, setCountry] = useState(user?.country || '');
  const [city, setCity] = useState(user?.city || '');
  const [address, setAddress] = useState(user?.address || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const [kyc, setKyc] = useState(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycSubmitLoading, setKycSubmitLoading] = useState(false);

  const [mainPasswordCurrent, setMainPasswordCurrent] = useState('');
  const [mainPasswordNew, setMainPasswordNew] = useState('');
  const [mainPasswordConfirm, setMainPasswordConfirm] = useState('');
  const [mainPasswordLoading, setMainPasswordLoading] = useState(false);
  const [mainPasswordMessage, setMainPasswordMessage] = useState({ type: '', text: '' });

  const [investorPasswordCurrent, setInvestorPasswordCurrent] = useState('');
  const [investorPasswordNew, setInvestorPasswordNew] = useState('');
  const [investorPasswordConfirm, setInvestorPasswordConfirm] = useState('');
  const [investorPasswordLoading, setInvestorPasswordLoading] = useState(false);
  const [investorPasswordMessage, setInvestorPasswordMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setCountry(user.country || '');
      setCity(user.city || '');
      setAddress(user.address || '');
      setAvatar(user.avatar || '');
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setKycLoading(true);
    getKyc()
      .then((data) => { if (!cancelled) setKyc(data); })
      .catch(() => { if (!cancelled) setKyc({ kycStatus: user.kycStatus || 'pending' }); })
      .finally(() => { if (!cancelled) setKycLoading(false); });
    return () => { cancelled = true; };
  }, [user?.id, user?.kycStatus]);

  const resizeImage = (file, maxSize = 200) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        } else if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Invalid image'));
      };
      img.src = url;
    });

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be under 2MB');
      return;
    }
    setError('');
    try {
      const dataUrl = await resizeImage(file);
      setAvatar(dataUrl);
    } catch {
      setError('Failed to process image');
    }
    e.target.value = '';
  };

  const handleKycSubmit = async () => {
    setError('');
    setKycSubmitLoading(true);
    try {
      const data = await submitKyc();
      setKyc(data);
      if (login && user) login({ ...user, kycStatus: data.kycStatus, kycSubmittedAt: data.kycSubmittedAt, kycRejectedReason: '' }, token);
    } catch (err) {
      setError(err.message);
    } finally {
      setKycSubmitLoading(false);
    }
  };

  const handleChangeMainPassword = async (e) => {
    e.preventDefault();
    setMainPasswordMessage({ type: '', text: '' });
    if (mainPasswordNew !== mainPasswordConfirm) {
      setMainPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    if (mainPasswordNew.length < 6) {
      setMainPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    setMainPasswordLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ currentPassword: mainPasswordCurrent, newPassword: mainPasswordNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMainPasswordMessage({ type: 'success', text: 'Main password updated successfully.' });
        setMainPasswordCurrent('');
        setMainPasswordNew('');
        setMainPasswordConfirm('');
      } else {
        setMainPasswordMessage({ type: 'error', text: data.error || data.message || 'Failed to change password.' });
      }
    } catch (err) {
      setMainPasswordMessage({ type: 'error', text: err.message || 'Request failed.' });
    } finally {
      setMainPasswordLoading(false);
    }
  };

  const handleChangeInvestorPassword = async (e) => {
    e.preventDefault();
    setInvestorPasswordMessage({ type: '', text: '' });
    if (investorPasswordNew !== investorPasswordConfirm) {
      setInvestorPasswordMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    if (investorPasswordNew.length < 6) {
      setInvestorPasswordMessage({ type: 'error', text: 'New password must be at least 6 characters.' });
      return;
    }
    setInvestorPasswordLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/change-investor-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ currentInvestorPassword: investorPasswordCurrent, newInvestorPassword: investorPasswordNew }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setInvestorPasswordMessage({ type: 'success', text: 'Investor password updated successfully.' });
        setInvestorPasswordCurrent('');
        setInvestorPasswordNew('');
        setInvestorPasswordConfirm('');
      } else {
        setInvestorPasswordMessage({ type: 'error', text: data.error || data.message || 'Failed to change investor password.' });
      }
    } catch (err) {
      setInvestorPasswordMessage({ type: 'error', text: err.message || 'Request failed.' });
    } finally {
      setInvestorPasswordLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaved(false);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          name: (name || '').trim(),
          phone: (phone || '').trim() || undefined,
          country: (country || '').trim() || undefined,
          city: (city || '').trim() || undefined,
          address: (address || '').trim() || undefined,
          avatar: avatar || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        login({ ...user, ...data }, token);
        setSaved(true);
      } else {
        throw new Error(data.error || data.message || 'Failed to save');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page dashboard-page">
      <header className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Profile settings</h1>
          <p className="page-subtitle mt-1">Manage your account details</p>
        </div>
        <div className="page-header-actions">
          <Link to="/dashboard" className="btn btn-secondary btn-sm">Back to Dashboard</Link>
        </div>
      </header>
      <section className="page-content">
        <div className="section-block rounded-xl p-6 profile-settings-block">
          {error && <div className="profile-settings-error">{error}</div>}
          {saved && <div className="profile-settings-success">Profile saved successfully.</div>}
          <form onSubmit={handleSubmit} className="profile-settings-form">
            <div className="profile-settings-avatar-wrap">
              <button
                type="button"
                className="profile-settings-avatar-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <ProfileAvatar name={name} src={avatar} size={96} />
                <span className="profile-settings-avatar-overlay">Change</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                className="profile-settings-avatar-input"
              />
            </div>
            <div className="profile-settings-grid">
              <label className="profile-settings-label">
                Full name
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="profile-settings-input" />
              </label>
              <label className="profile-settings-label">
                Phone
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="profile-settings-input" />
              </label>
              <label className="profile-settings-label">
                Country
                <select value={country} onChange={(e) => setCountry(e.target.value)} className="profile-settings-input">
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="profile-settings-label">
                City
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="profile-settings-input" />
              </label>
              <label className="profile-settings-label profile-settings-label-full">
                Address
                <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="profile-settings-input" />
              </label>
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </form>

          <div className="section-block password-block" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
            <h2 className="text-lg font-semibold mb-3">Password settings</h2>
            <p className="muted" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>Change your main login password or your investor (trader) password.</p>

            <form onSubmit={handleChangeMainPassword} style={{ marginBottom: '1.5rem' }}>
              <h3 className="text-base font-medium mb-2">Change main password</h3>
              <div className="profile-settings-grid" style={{ maxWidth: '28rem' }}>
                <label className="profile-settings-label">
                  Current password
                  <input type="password" value={mainPasswordCurrent} onChange={(e) => setMainPasswordCurrent(e.target.value)} className="profile-settings-input" placeholder="••••••••" autoComplete="current-password" required />
                </label>
                <label className="profile-settings-label">
                  New password
                  <input type="password" value={mainPasswordNew} onChange={(e) => setMainPasswordNew(e.target.value)} className="profile-settings-input" placeholder="••••••••" autoComplete="new-password" minLength={6} required />
                </label>
                <label className="profile-settings-label">
                  Confirm new password
                  <input type="password" value={mainPasswordConfirm} onChange={(e) => setMainPasswordConfirm(e.target.value)} className="profile-settings-input" placeholder="••••••••" autoComplete="new-password" minLength={6} required />
                </label>
              </div>
              {mainPasswordMessage.text && (
                <p className={mainPasswordMessage.type === 'error' ? 'profile-settings-error' : 'profile-settings-success'} style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>{mainPasswordMessage.text}</p>
              )}
              <button type="submit" className="btn btn-primary btn-sm" disabled={mainPasswordLoading}>
                {mainPasswordLoading ? 'Updating…' : 'Update main password'}
              </button>
            </form>

            <form onSubmit={handleChangeInvestorPassword}>
              <h3 className="text-base font-medium mb-2">Change investor password</h3>
              <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.8125rem' }}>Used for trader/assistant access to your account.</p>
              <div className="profile-settings-grid" style={{ maxWidth: '28rem' }}>
                <label className="profile-settings-label">
                  Current investor password
                  <input type="password" value={investorPasswordCurrent} onChange={(e) => setInvestorPasswordCurrent(e.target.value)} className="profile-settings-input" placeholder="••••••••" autoComplete="current-password" required />
                </label>
                <label className="profile-settings-label">
                  New investor password
                  <input type="password" value={investorPasswordNew} onChange={(e) => setInvestorPasswordNew(e.target.value)} className="profile-settings-input" placeholder="••••••••" autoComplete="new-password" minLength={6} required />
                </label>
                <label className="profile-settings-label">
                  Confirm new investor password
                  <input type="password" value={investorPasswordConfirm} onChange={(e) => setInvestorPasswordConfirm(e.target.value)} className="profile-settings-input" placeholder="••••••••" autoComplete="new-password" minLength={6} required />
                </label>
              </div>
              {investorPasswordMessage.text && (
                <p className={investorPasswordMessage.type === 'error' ? 'profile-settings-error' : 'profile-settings-success'} style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>{investorPasswordMessage.text}</p>
              )}
              <button type="submit" className="btn btn-primary btn-sm" disabled={investorPasswordLoading}>
                {investorPasswordLoading ? 'Updating…' : 'Update investor password'}
              </button>
            </form>
          </div>

          <div className="section-block kyc-block" style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
            <h2 className="text-lg font-semibold mb-3">KYC status</h2>
            {kycLoading ? (
              <p className="muted">Loading…</p>
            ) : (
              <>
                <div className="kyc-status-row" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span className={`kyc-badge kyc-badge--${(kyc?.kycStatus || user?.kycStatus || 'pending').toLowerCase()}`} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.875rem', fontWeight: 600 }}>
                    {(kyc?.kycStatus || user?.kycStatus || 'pending').charAt(0).toUpperCase() + (kyc?.kycStatus || user?.kycStatus || 'pending').slice(1)}
                  </span>
                  {kyc?.kycSubmittedAt && (
                    <span className="muted" style={{ fontSize: '0.875rem' }}>
                      Submitted {new Date(kyc.kycSubmittedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {(kyc?.kycStatus || user?.kycStatus) === 'rejected' && kyc?.kycRejectedReason && (
                  <p className="kyc-rejection-reason" style={{ marginBottom: '0.75rem', padding: '0.5rem', background: 'var(--error-bg, #fef2f2)', borderRadius: '4px', fontSize: '0.875rem' }}>
                    Reason: {kyc.kycRejectedReason}
                  </p>
                )}
                {(kyc?.kycStatus || user?.kycStatus) === 'pending' && (
                  <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>Under review. We will notify you once verified.</p>
                )}
                {(kyc?.kycStatus || user?.kycStatus) === 'approved' && (
                  <p className="muted" style={{ marginBottom: '0.75rem', fontSize: '0.875rem' }}>Your identity has been verified.</p>
                )}
                {((kyc?.kycStatus || user?.kycStatus) === 'rejected' || !(kyc?.kycStatus || user?.kycStatus) || (kyc?.kycStatus || user?.kycStatus) === 'pending') && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleKycSubmit} disabled={kycSubmitLoading}>
                    {(kyc?.kycStatus || user?.kycStatus) === 'rejected' ? 'Resubmit for review' : (kyc?.kycStatus || user?.kycStatus) === 'pending' ? 'Resubmit' : 'Submit for review'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

