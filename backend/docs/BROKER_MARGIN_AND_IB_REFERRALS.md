# Broker margin risk & IB / referrals (internal reference)

This document describes server and admin behavior for **margin stop-out/warnings on ticks** and for **introducing broker (IB) attribution, hierarchy, and reporting**. Use it when extending features or debugging production issues.

---

## 1. Margin risk (tick engine)

### Purpose

On each price tick (after TP/SL handling), the server may:

- Hard-close positions when **margin level** falls below a configured **stop-out** threshold.
- Emit **Socket.IO** `risk_event` / `margin_warning` when margin level falls below a **warn** threshold, throttled by **interval**.

**Zero-equity auto-close** is separate and always on.

### Data model

- **MongoDB** collection `settings`, document `key: broker_margin_risk`:
  - `stopOutBelowPct`, `warnBelowPct`, `warnIntervalMs`, `updatedAt`, `updatedBy`
- If no document exists, **env fallbacks** apply (see `backend/.env.example`, `MARGIN_LEVEL_*`).
- **Runtime cache:** `modules/trading/margin-risk.runtime.js` — `getMarginRiskRuntime()` used on the hot path; refreshed on startup and after admin save.

### Admin API

| Method | Path | Notes |
|--------|------|--------|
| `GET` | `/api/admin/trading/margin-risk` | Returns effective values + `fromDatabase`, `updatedAt` |
| `PUT` | `/api/admin/trading/margin-risk` | Validates **warn threshold > stop threshold** when both &gt; 0; then `refreshMarginRiskRuntime()` |

### Frontend

- **Admin → Settings:** section **“Margin risk (tick engine)”** (`frontend-web/src/pages/admin/AdminSettings.jsx`).
- Legacy **“Margin call level (%)”** in the same page is **display-only** (not wired to this engine).

### Key files

- `backend/modules/trading/margin-risk-settings.repository.js`
- `backend/modules/trading/margin-risk.runtime.js`
- `backend/modules/trading/positions.service.js` (consumes `getMarginRiskRuntime()`)
- `backend/modules/admin/admin.controller.js` — `getMarginRiskSettings`, `putMarginRiskSettings` (must remain **exported** on default controller)

---

## 2. IB default referrer (direct signups)

### Purpose

Users who register **without** a `?ref=` (or equivalent) link can still receive `users.referrerId` when a **platform default IB** is configured.

### Resolution order

1. **MongoDB** `ib_settings` document `_id: default`, field **`defaultReferrerUserId`** (if non-empty).
2. Else **`DEFAULT_IB_REFERRER_USER_ID`** in environment (see `backend/.env.example`).

The resolved id must match a user who has an **`ib_profiles`** row (and exists in `users`). If validation fails, the server **logs a warning** and leaves **no** `referrerId` (legacy behavior).

### Registration

- **`modules/auth/auth.service.js`** — `register()`:
  - Resolves `ref` to an IB first; sets **`referralSource: 'link'`** when successful.
  - If still no referrer, applies default; sets **`referralSource: 'default'`** when successful.

### Admin API / UI

- **`GET/PUT /api/admin/ib/settings`** includes **`defaultReferrerUserId`** alongside `ratePerLotByLevel`.
- **PUT** may send **only** rates, **only** default IB, or both. Empty string for default clears the **stored** override (env may still apply).
- Non-empty default is validated: target must have **`ib_profiles`**.

### Key files

- `backend/modules/ib/ib.repository.js` — `getIbSettingsForAdmin`, `updateIbSettingsMerged`, `resolveEffectiveDefaultReferrerUserId`
- `frontend-web/src/pages/admin/AdminIbCommission.jsx` — “Default IB (direct signups)”

---

## 3. Admin: reassign client referrer (no clear)

### Policy

**Reassignment only:** `referrerId` **cannot** be cleared via this API. Assign a valid **IB user id** (user must have `ib_profiles`).

### API

| Method | Path | Body |
|--------|------|------|
| `PUT` or `PATCH` | `/api/admin/ib/clients/:userId/referrer` | `{ referrerUserId: string, reason?: string }` |

Effects:

- Updates `users.referrerId` and sets **`referralSource: 'admin'`**.
- **Audit** (`audit.log`): `reassign_client_referrer` with `actorId`, `targetUserId`, `oldReferrerId`, `newReferrerId`, optional `reason`, `at`.

### Frontend

- **Admin → Users:** Referrer column + **Assign IB** modal (`frontend-web/src/pages/admin/AdminUsers.jsx`).
- **`frontend-web/src/api/adminApi.js`** — `putClientReferrer(clientUserId, referrerUserId, { reason })`.

### Finance note

**Future** commission / upline routing uses the **current** `referrerId` and IB chain. Existing **`ib_commissions`** documents are **not** rewritten when referrer is reassigned.

---

## 4. IB hierarchy (move under another IB)

### Purpose

Change **`ib_profiles.parentId`** so **reported level** (depth from root) updates. Sub-IBs of the moved IB keep their `parentId` pointing at the moved user; only that node’s depth in the tree changes.

### Rules

- Implemented in **`modules/ib/ib-hierarchy.service.js`**:
  - **No cycles:** proposed parent’s upline must not include the IB being moved.
  - **Max depth:** new level = parent’s `getHierarchyDepth` + 1, capped at **`MAX_IB_LEVEL` (5)**.
- **Root:** `parentUserId` null or empty → `parentId` null.

### API

| Method | Path | Body |
|--------|------|------|
| `PUT` | `/api/admin/ib/profiles/:ibUserId/parent` | `{ parentUserId: string \| null }` |

Audit: `reassign_ib_parent`.

### Unit tests (no Mongo)

```bash
cd backend && npm run test:ib-hierarchy
```

Tests **`wouldAssigningParentCreateCycle`** and **`newIbLevelExceedsMax`** in `modules/ib/ib-hierarchy.service.test.js`.

### Key files

- `backend/modules/ib/ib-hierarchy.service.js`
- `backend/modules/ib/ib.repository.js` — `updateIbParentByUserId`

---

## 5. Referral visibility & data gaps

### Why two lists matter

- **Signup attribution:** `users.referrerId === ibUserId` (joinings). Includes clients with **no trades**.
- **IB portal “referrals” from commissions:** driven by **`ib_commissions`** aggregates — clients with **no commission rows** may be missing there.

### Admin APIs

| Method | Path | Purpose |
|--------|------|--------|
| `GET` | `/api/admin/ib/profiles/:ibUserId/referral-overview` | Joinings + commission-based clients + short notes |
| `GET` | `/api/admin/ib/referrer-gaps?limit=` | Sample of `role=user` with **no referrer** or **broken referrer** (missing user / not IB) |

### Enriched IB list

- **`GET /api/admin/ib/profiles`** returns per profile: `level`, `parentEmail`, `directReferralCount`, plus existing fields.

### Frontend

- **Admin → IB & commission:** directory table, **Referrals** modal, **Referrer gaps** section (`AdminIbCommission.jsx`).

---

## 6. Live integration tests

Requires **API running** (e.g. `http://localhost:3000`) and **MongoDB** with seeded users (e.g. `admin@test.com`, `bob@test.com` verified if your auth enforces verification).

```bash
cd backend && npm run test:updated
```

Script: `backend/scripts/test-updated-features.js` — covers execution mode, hybrid rules, margin risk, IB referrer, IB settings, referrer gaps, and basic trading for bob.

---

## 7. Related internal docs

- `CRM_TRADING_INTEGRATION.md` — CRM / trading account context
- `TRADING_ORDER_LIFECYCLE.md` — order/position lifecycle
- `.env.example` — `MARGIN_LEVEL_*`, `DEFAULT_IB_REFERRER_USER_ID`

---

## 8. Change log (high level)

- Margin risk: Mongo-backed settings + admin UI + runtime refresh; controller handlers must be **exported**.
- IB: default referrer (DB + env), `referralSource`, admin reassignment (no clear), IB parent moves, referral overview + gap reporting, Admin UI on IB commission and Users pages.
- Tests: `test:updated` (live), `test:ib-hierarchy` (unit).

*Maintainers: update this file when APIs or policies change.*
