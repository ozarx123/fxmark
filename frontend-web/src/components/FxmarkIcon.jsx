/**
 * FXMARK Global Iconography – Phosphor Icons
 * Default: Regular weight. Active: Bold. Secondary: Light.
 * Colors: default #1A1A1A, active #E10600, hover #FF6A00, dark nav #FFFFFF
 */
import React from 'react';
import {
  SquaresFour,
  Users,
  User,
  Handshake,
  Wallet,
  ArrowDown,
  ArrowUp,
  ChartLineUp,
  ListChecks,
  ClockCounterClockwise,
  TrendUp,
  TrendDown,
  ChartBar,
  FileText,
  Gear,
  ShieldCheck,
  Bell,
  Plugs,
  Cpu,
  Lightning,
  ShareNetwork,
} from '@phosphor-icons/react';

const ICON_MAP = {
  dashboard: SquaresFour,
  users: Users,
  trader: User,
  ib: Handshake,
  wallet: Wallet,
  deposit: ArrowDown,
  withdraw: ArrowUp,
  trading: ChartLineUp,
  orders: ListChecks,
  history: ClockCounterClockwise,
  profit: TrendUp,
  loss: TrendDown,
  analytics: ChartBar,
  reports: FileText,
  settings: Gear,
  security: ShieldCheck,
  notifications: Bell,
  api: Plugs,
  algo: Cpu,
  fix: Lightning,
  copy: ShareNetwork,
};

const WEIGHT = {
  regular: 'regular',
  light: 'light',
  bold: 'bold',
};

export function FxmarkIcon({ name, weight = 'regular', size = 20, className = '', ...props }) {
  const Icon = ICON_MAP[name] || SquaresFour;
  return (
    <Icon
      weight={weight}
      size={size}
      className={`fxmark-icon ${className}`}
      aria-hidden
      {...props}
    />
  );
}

export default FxmarkIcon;
