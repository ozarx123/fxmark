/**
 * VerifiedBadge — Verified / Pro / New
 * Trust-first design
 */
import React from 'react';
import { CheckCircle, Crown, Sparkle } from '@phosphor-icons/react';

const VARIANTS = {
  verified: { icon: CheckCircle, class: 'verified-badge', label: 'Verified' },
  pro: { icon: Crown, class: 'verified-badge verified-badge--pro', label: 'Pro' },
  new: { icon: Sparkle, class: 'verified-badge verified-badge--new', label: 'New' },
};

export default function VerifiedBadge({ variant = 'verified', label, className = '' }) {
  const config = VARIANTS[variant] || VARIANTS.verified;
  const Icon = config.icon;
  return (
    <span className={`${config.class} ${className}`.trim()} title={config.label}>
      <Icon size={12} weight="fill" />
      {label ?? config.label}
    </span>
  );
}
