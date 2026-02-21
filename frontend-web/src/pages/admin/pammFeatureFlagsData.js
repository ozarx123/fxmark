/**
 * PAMM Feature Toggle System - FXMARK CRM
 * Flags stored in pamm_feature_flags (DB). Priority: Manager Override > Group Override > Global Default.
 * All toggles enforced at API level; backend blocks access when disabled.
 */

export const PAMM_FLAG_SCOPES = [
  { value: 'global', label: 'Global default' },
  { value: 'manager', label: 'Per manager (override)' },
  { value: 'group', label: 'Per group (override)' },
];

/** Investor view: what investors can see */
export const PAMM_FLAGS_INVESTOR_VIEW = [
  { id: 'investor_show_live_trades', label: 'Show live trades', default: true },
  { id: 'investor_show_open_positions', label: 'Show open positions details', default: true },
  { id: 'investor_show_trading_history', label: 'Show trading history', default: true },
  { id: 'investor_show_equity_curve', label: 'Show equity curve chart', default: true },
  { id: 'investor_show_drawdown', label: 'Show drawdown %', default: true },
  { id: 'investor_show_risk_score', label: 'Show risk score', default: true },
  { id: 'investor_show_manager_name', label: 'Show manager / strategy name', default: true },
];

/** Investor actions: what investors can do */
export const PAMM_FLAGS_INVESTOR_ACTIONS = [
  { id: 'investor_allow_join', label: 'Allow join PAMM', default: true },
  { id: 'investor_allow_add_funds', label: 'Allow add funds', default: true },
  { id: 'investor_allow_withdraw', label: 'Allow withdraw', default: true },
  { id: 'investor_allow_unfollow', label: 'Allow unfollow', default: true },
  { id: 'investor_allow_profit_only_withdrawal', label: 'Allow profit-only withdrawal', default: false },
  { id: 'investor_enable_lock_period', label: 'Enable lock period', default: false },
];

/** Manager controls & risk layer */
export const PAMM_FLAGS_MANAGER_RISK = [
  { id: 'manager_enable_performance_fee', label: 'Enable performance fee', default: true },
  { id: 'manager_enable_management_fee', label: 'Enable management fee', default: true },
  { id: 'manager_enable_high_watermark', label: 'Enable high watermark logic', default: true },
  { id: 'manager_enable_risk_profile_label', label: 'Enable risk profile label', default: true },
  { id: 'manager_enable_max_drawdown_autostop', label: 'Enable max drawdown auto-stop', default: true },
  { id: 'manager_enable_exposure_limits', label: 'Enable exposure limits', default: true },
  { id: 'manager_enable_news_volatility_protection', label: 'Enable news / volatility protection', default: false },
];

/** Admin control layer (role-based) */
export const PAMM_FLAGS_ADMIN = [
  { id: 'admin_can_view_live_trades', label: 'Admin can view live trades', default: true },
  { id: 'admin_can_close_positions', label: 'Admin can close positions', default: true },
  { id: 'admin_can_modify_sl_tp', label: 'Admin can modify SL/TP', default: true },
  { id: 'admin_can_cancel_pending_orders', label: 'Admin can cancel pending orders', default: true },
  { id: 'admin_can_force_unfollow', label: 'Admin can force unfollow', default: true },
  { id: 'admin_can_freeze_manager', label: 'Admin can freeze manager', default: true },
  { id: 'pamm_global_kill_switch', label: 'Global kill switch', default: false },
];

export function getAllPammFlags() {
  return [
    ...PAMM_FLAGS_INVESTOR_VIEW,
    ...PAMM_FLAGS_INVESTOR_ACTIONS,
    ...PAMM_FLAGS_MANAGER_RISK,
    ...PAMM_FLAGS_ADMIN,
  ];
}

export function getDefaultPammFlags() {
  const flags = {};
  getAllPammFlags().forEach((f) => { flags[f.id] = f.default; });
  return flags;
}
