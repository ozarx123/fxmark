/**
 * FXMARK Global Iconography — local inline SVGs (no Phosphor)
 * Default: regular. Active: bold (same icon, nav uses class for emphasis).
 */
import React from 'react';
import {
  SquaresFourIcon,
  UsersIcon,
  UserIcon,
  HandshakeIcon,
  WalletIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  ChartLineUpIcon,
  ListChecksIcon,
  ClockCounterClockwiseIcon,
  TrendUpIcon,
  TrendDownIcon,
  ChartBarIcon,
  FileTextIcon,
  GearIcon,
  ShieldCheckIcon,
  BellIcon,
  PlugsIcon,
  CpuIcon,
  LightningIcon,
  ShareNetworkIcon,
} from './Icons.jsx';

const ICON_MAP = {
  dashboard: SquaresFourIcon,
  users: UsersIcon,
  trader: UserIcon,
  ib: HandshakeIcon,
  wallet: WalletIcon,
  deposit: ArrowDownIcon,
  withdraw: ArrowUpIcon,
  trading: ChartLineUpIcon,
  orders: ListChecksIcon,
  history: ClockCounterClockwiseIcon,
  profit: TrendUpIcon,
  loss: TrendDownIcon,
  analytics: ChartBarIcon,
  reports: FileTextIcon,
  settings: GearIcon,
  security: ShieldCheckIcon,
  notifications: BellIcon,
  api: PlugsIcon,
  algo: CpuIcon,
  fix: LightningIcon,
  copy: ShareNetworkIcon,
};

export function FxmarkIcon({ name, weight = 'regular', size = 20, className = '', ...props }) {
  const Icon = ICON_MAP[name] || SquaresFourIcon;
  return (
    <Icon
      size={size}
      className={`fxmark-icon ${className}`}
      aria-hidden
      {...props}
    />
  );
}

export default FxmarkIcon;
