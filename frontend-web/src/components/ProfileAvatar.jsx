/**
 * ProfileAvatar — Futuristic avatar with initials or image
 * Neon ring, glass effect, optional verified badge
 */
import React from 'react';
import { CheckCircle } from '@phosphor-icons/react';

function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function hashToColor(str) {
  if (!str) return '#00D4AA';
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i) | 0;
  const hue = Math.abs(h % 360);
  const sat = 65;
  const light = 55;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export default function ProfileAvatar({ name, src, size = 48, verified, className = '' }) {
  const initials = getInitials(name);
  const accentColor = hashToColor(name || 'default');
  const sizePx = typeof size === 'number' ? size : 48;

  return (
    <div
      className={`profile-avatar ${className}`.trim()}
      style={{ '--avatar-size': `${sizePx}px`, '--avatar-accent': accentColor }}
    >
      <div className="profile-avatar-ring">
        <div className="profile-avatar-inner">
          {src ? (
            <img src={src} alt={name || 'Avatar'} className="profile-avatar-img" />
          ) : (
            <span className="profile-avatar-initials">{initials}</span>
          )}
        </div>
      </div>
      {verified && (
        <span className="profile-avatar-verified" title="Verified">
          <CheckCircle size={sizePx * 0.35} weight="fill" />
        </span>
      )}
    </div>
  );
}
