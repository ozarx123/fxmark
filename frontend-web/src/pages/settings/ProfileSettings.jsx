import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProfileAvatar from '../../components/ProfileAvatar';
import { getKyc, submitKyc } from '../../api/userApi';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

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
