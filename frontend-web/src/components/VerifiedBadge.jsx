/**
 * VerifiedBadge — Verified / Pro / New
 * Trust-first design
 */
import React from 'react';
import { CheckCircleIcon, CrownIcon, SparkleIcon } from './Icons.jsx';

const VARIANTS = {
  verified: { icon: CheckCircleIcon, class: 'verified-badge', label: 'Verified' },
  pro: { icon: CrownIcon, class: 'verified-badge verified-badge--pro', label: 'Pro' },
  new: { icon: SparkleIcon, class: 'verified-badge verified-badge--new', label: 'New' },
};

export default function VerifiedBadge({ variant = 'verified', label, className = '' }) {
  const config = VARIANTS[variant] || VARIANTS.verified;
  const Icon = config.icon;
  return (
    <span className={`${config.class} ${className}`.trim()} title={config.label}>
      <Icon size={12} />
      {label ?? config.label}
    </span>
  );
}
