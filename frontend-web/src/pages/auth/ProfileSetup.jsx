import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import FxmarkLogo from '../../components/FxmarkLogo';
import ProfileAvatar from '../../components/ProfileAvatar';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France',
  'Japan', 'Singapore', 'South Korea', 'India', 'Brazil', 'Netherlands',
  'Switzerland', 'Spain', 'Italy', 'Sweden', 'Norway', 'Ireland', 'Other',
];

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user, token, login, isAuthenticated } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [country, setCountry] = useState(user?.country || '');
  const [city, setCity] = useState(user?.city || '');
  const [address, setAddress] = useState(user?.address || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

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

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (user?.profileComplete) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      setError('Full name is required');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          name: trimmedName,
          phone: (phone || '').trim() || undefined,
          country: (country || '').trim() || undefined,
          city: (city || '').trim() || undefined,
          address: (address || '').trim() || undefined,
          avatar: avatar || undefined,
          profileComplete: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        login({ ...user, ...data, profileComplete: true }, token);
        navigate('/dashboard', { replace: true });
        return;
      }
      throw new Error(data.error || data.message || 'Failed to save profile');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

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
      setError('Please select an image file (JPEG, PNG, etc.)');
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

  return (
    <div className="auth-page profile-setup-page">
      <div className="profile-setup-card">
        <div className="profile-setup-header">
          <FxmarkLogo className="profile-setup-logo" />
          <div className="profile-setup-badge">Step 2 of 2</div>
          <div className="profile-setup-avatar-wrap">
            <button
              type="button"
              className="profile-setup-avatar-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload photo"
            >
              <ProfileAvatar name={name} src={avatar} size={96} />
              <span className="profile-setup-avatar-overlay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Add photo
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarChange}
              className="profile-setup-avatar-input"
              aria-label="Upload profile photo"
            />
          </div>
          <h1 className="profile-setup-title">Complete your profile</h1>
          <p className="profile-setup-subtitle">
            A few details to get you started
          </p>
        </div>

        {error && <div className="profile-setup-error">{error}</div>}

        <form className="profile-setup-form" onSubmit={handleSubmit}>
          <div className="profile-setup-row">
            <label className="profile-setup-label">
              Full name <span className="required">*</span>
              <input
                type="text"
                className="profile-setup-input"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </label>
          </div>
          <div className="profile-setup-row profile-setup-row-split">
            <label className="profile-setup-label">
              Phone number
              <input
                type="tel"
                className="profile-setup-input"
                placeholder="+1 234 567 8900"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </label>
            <label className="profile-setup-label">
              Country
              <select
                className="profile-setup-input profile-setup-select"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="">Select country</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="profile-setup-row profile-setup-row-split">
            <label className="profile-setup-label">
              City
              <input
                type="text"
                className="profile-setup-input"
                placeholder="New York"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
              />
            </label>
            <label className="profile-setup-label">
              Address
              <input
                type="text"
                className="profile-setup-input"
                placeholder="Street, postal code"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
              />
            </label>
          </div>
          <button type="submit" className="profile-setup-submit" disabled={loading}>
            {loading ? (
              <span className="profile-setup-spinner" aria-hidden />
            ) : null}
            {loading ? 'Saving…' : 'Continue to dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}
