/**
 * Build admin audit log API rows (unified: admin_audit_logs + execution_mode_audit).
 */
import { getDb } from '../../config/mongo.js';
import userRepo from '../users/user.repository.js';
import * as adminAuditRepo from './admin-audit.repository.js';

const EXEC_COLLECTION = 'execution_mode_audit';

function formatRole(role) {
  if (!role) return '—';
  const r = String(role);
  return r
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function moduleForAction(action) {
  const a = String(action || '');
  if (['reassign_ib_parent', 'reassign_client_referrer'].includes(a)) return a.includes('ib') ? 'IB' : 'Users';
  if (['update_trading_limits', 'update_account_config', 'update_margin_risk', 'admin_close_position', 'admin_cancel_order'].includes(a)) {
    return 'Trading monitor';
  }
  if (['platform_maintenance_update', 'platform_env_set'].includes(a)) return 'Settings';
  if (['profit_commission_adjustment', 'withdrawal_status_update', 'admin_add_funds'].includes(a)) return 'Financials';
  if (['admin_update_user'].includes(a)) return 'Users';
  if (['execution_mode_change', 'hybrid_rules_change'].includes(a)) return 'Liquidity';
  return 'Admin';
}

function projectAdminDoc(doc) {
  const action = doc.action || '';
  const d = doc.details || {};
  let oldValue = '—';
  let newValue = '—';
  let entity = doc.resource || '—';

  switch (action) {
    case 'reassign_client_referrer':
      entity = `user:${d.targetUserId || '?'}`;
      oldValue = d.oldReferrerId != null ? String(d.oldReferrerId) : '—';
      newValue = d.newReferrerId != null ? String(d.newReferrerId) : '—';
      break;
    case 'reassign_ib_parent':
      entity = `ib:${d.ibUserId || '?'}`;
      oldValue = '—';
      newValue = d.newParentUserId != null ? String(d.newParentUserId) : '—';
      break;
    case 'update_trading_limits':
      entity = `user:${d.targetUserId || '?'}`;
      oldValue = JSON.stringify(d.old ?? {});
      newValue = JSON.stringify(d.new ?? {});
      break;
    case 'update_account_config':
      entity = d.accountNumber ? `acct ${d.accountNumber}` : `acct:${d.accountId || '?'}`;
      oldValue = '—';
      newValue = JSON.stringify(d.changes ?? {});
      break;
    case 'platform_env_set':
      entity = String(d.key || 'env');
      oldValue = d.cleared ? '(had override)' : '—';
      newValue = d.cleared ? 'cleared' : 'set / updated';
      break;
    case 'platform_maintenance_update':
      entity = 'platform maintenance';
      oldValue = '—';
      newValue =
        d.patch && typeof d.patch === 'object'
          ? JSON.stringify(d.patch).slice(0, 200) + (JSON.stringify(d.patch).length > 200 ? '…' : '')
          : 'updated';
      break;
    case 'profit_commission_adjustment': {
      entity = String(doc.resource || 'user');
      const parts = [];
      if (d.pamm) parts.push(`PAMM Δ${d.pamm.delta}`);
      if (d.wallet) parts.push(`wallet +${d.wallet.credited}`);
      if (d.ibCommissionId) parts.push(`IB commission row`);
      newValue = parts.length ? parts.join('; ') : 'applied';
      oldValue = '—';
      break;
    }
    case 'withdrawal_status_update':
      entity = `WD ${(d.withdrawalId || '').toString().slice(-12)}`;
      oldValue = String(d.fromStatus || '—');
      newValue = String(d.toStatus || '—');
      break;
    case 'admin_update_user':
      entity = `user:${d.targetUserId || '?'}`;
      oldValue = JSON.stringify(d.before ?? {});
      newValue = JSON.stringify(d.after ?? {});
      break;
    case 'update_margin_risk':
      entity = 'margin / stop-out';
      oldValue = JSON.stringify(d.before ?? {});
      newValue = JSON.stringify(d.after ?? {});
      break;
    case 'admin_add_funds':
      entity = `user:${d.targetUserId || '?'}`;
      oldValue = '—';
      newValue = `${d.amount ?? '?'} ${d.currency || 'USD'}`;
      break;
    case 'admin_close_position':
      entity = `pos:${d.positionId || '?'}`;
      oldValue = 'open';
      newValue = `closed${d.volume != null ? ` (vol ${d.volume})` : ''}`;
      break;
    case 'admin_cancel_order':
      entity = `order:${d.orderId || '?'}`;
      oldValue = 'active';
      newValue = 'cancelled';
      break;
    default:
      break;
  }

  return {
    id: doc._id ? doc._id.toString() : doc.id,
    source: 'admin',
    createdAt: doc.createdAt,
    userId: doc.userId,
    action,
    resource: doc.resource,
    details: d,
    clientIp: doc.clientIp,
    module: moduleForAction(action),
    entity,
    oldValue,
    newValue,
  };
}

function projectExecutionDoc(doc) {
  const isMode = doc.type === 'execution_mode_change';
  const action = isMode ? 'execution_mode_change' : 'hybrid_rules_change';
  const oldValue = isMode ? String(doc.oldMode ?? '—') : JSON.stringify(doc.oldRules ?? {});
  const newValue = isMode ? String(doc.newMode ?? '—') : JSON.stringify(doc.newRules ?? {});
  return {
    id: doc._id ? doc._id.toString() : `exec-${doc.timestamp}`,
    source: 'execution_mode',
    createdAt: doc.timestamp instanceof Date ? doc.timestamp : new Date(doc.timestamp),
    userId: doc.adminId != null ? String(doc.adminId) : null,
    action,
    resource: isMode ? 'execution_mode' : 'hybrid_rules',
    details: doc,
    clientIp: null,
    module: 'Liquidity',
    entity: isMode ? 'Execution mode' : 'Hybrid rules',
    oldValue,
    newValue,
  };
}

async function loadExecutionAudit(limit) {
  const db = await getDb();
  const c = db.collection(EXEC_COLLECTION);
  const list = await c.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
  return list.map(projectExecutionDoc);
}

/**
 * @param {{ limit?: number, skip?: number, action?: string, resource?: string, from?: string, to?: string }} query
 */
export async function listUnifiedAuditEntries(query = {}) {
  const want = Math.min(Math.max(Number(query.limit) || 150, 1), 500);
  const execCap = Math.min(120, want + 40);

  const [{ items: adminItems, total: adminTotal }, execRows] = await Promise.all([
    adminAuditRepo.listAdminAuditLogs({
      limit: want + execCap,
      skip: 0,
      action: query.action || undefined,
      resource: query.resource || undefined,
      from: query.from || undefined,
      to: query.to || undefined,
    }),
    query.action || query.resource ? Promise.resolve([]) : loadExecutionAudit(execCap),
  ]);

  const adminRows = adminItems.map((d) => ({ ...projectAdminDoc(d), _sort: new Date(d.createdAt).getTime() }));
  if (query.action || query.resource) {
    const merged = adminRows.sort((a, b) => b._sort - a._sort).slice(0, want);
    return await hydrateUsers(merged, adminTotal);
  }

  const execWithSort = execRows.map((r) => ({ ...r, _sort: new Date(r.createdAt).getTime() }));
  const merged = [...adminRows, ...execWithSort].sort((a, b) => b._sort - a._sort).slice(0, want);
  return await hydrateUsers(merged, adminTotal);
}

async function hydrateUsers(rows, adminPersistedTotal) {
  const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
  const users = await Promise.all(ids.map((id) => userRepo.findById(id)));
  const byId = {};
  for (const u of users) {
    if (u?.id) byId[u.id] = u;
  }

  return {
    entries: rows.map((r) => {
      const u = r.userId ? byId[r.userId] : null;
      return {
        id: r.id,
        source: r.source,
        time: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        user: u?.email || r.userId || '—',
        role: formatRole(u?.role),
        ip: r.clientIp || '—',
        module: r.module,
        action: r.action,
        entity: r.entity,
        oldValue: r.oldValue,
        newValue: r.newValue,
      };
    }),
    adminPersistedTotal,
  };
}

export default { listUnifiedAuditEntries };
