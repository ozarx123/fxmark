# PAMM IB commission list – frontend investigation report

**Scope:** Trace why PAMM IB commission entries are not visible on the IB page UI when the backend API returns correct data. No backend changes; frontend inspection and minimal debug logs only.

---

## 1. API endpoint used

- **Function:** `ibApi.listPammCommissions(params)` in `src/api/ibApi.js`
- **Endpoint:** `GET ${API_BASE}/ib/pamm-commissions` (with optional `from`, `to`, `limit` query params)
- **Auth:** `Authorization: Bearer ${token}` (token from `localStorage.getItem('fxmark_token')`)
- **Response:** Backend returns a **plain array** of log objects: `[{ id, ib_id, investor_id, pool_id, trade_id, active_capital_base, commission_percent, commission_amount, level_number, created_at }, ...]`

---

## 2. Whether API call is triggered

- **Yes.** The call is triggered on page load inside `loadData()` in `src/pages/ib/index.jsx`.
- **Flow:** `useEffect(() => { loadData(); }, [loadData])` → `loadData()` runs when `isAuthenticated` is true → `Promise.all([..., ibApi.listPammCommissions(), ...])` runs.
- **Condition:** If `!isAuthenticated`, `loadData()` returns immediately and no API (including PAMM) is called. So the user must be logged in for the request to run.
- **Network:** In DevTools → Network, filter by “pamm” or “ib”; you should see one request to `/api/ib/pamm-commissions` (or equivalent) when the IB page loads. If it is missing, either the user is not authenticated or the IB page did not mount/run the effect.

---

## 3. API response sample (expected)

Backend returns an array. Each item shape:

```js
{
  id: string,
  ib_id: string,
  investor_id: string,
  pool_id: string,
  trade_id: string,
  active_capital_base: number,
  commission_percent: number,
  commission_amount: number,
  level_number: number,
  created_at: Date (ISO string)
}
```

The UI uses: `c.id`, `c.created_at`, `c.commission_amount`, `c.level_number` — all present in this shape. No mapping or field-name mismatch on the frontend.

---

## 4. State value after fetch

- **State:** `pammCommissions` (useState in `Ib`).
- **Update:** `setPammCommissions(Array.isArray(pammRes) ? pammRes : [])`.
- **Behavior:**
  - If `listPammCommissions()` **resolves** with an array → `pammRes` is that array → state is set to it.
  - If `listPammCommissions()` **rejects** (network error, 4xx/5xx) → the previous code used `.catch(() => [])` → `pammRes` becomes `[]` → state is set to `[]`.
  - If the backend returned a **non-array** (e.g. `{ data: [...] }`) → `Array.isArray(pammRes)` is false → state is set to `[]`.
- So a **failed request or a non-array response** both lead to `pammCommissions = []` and the UI showing “No PAMM commission yet” even when the backend (when called correctly) returns data.

---

## 5. Whether render receives data

- **Component:** The same `Ib` page component that holds `pammCommissions` also renders the PAMM block.
- **Data path:** `pammCommissions` is used directly: `pammCommissions.length === 0` → show empty row; else `pammCommissions.slice(0, 50).map((c) => ...)`.
- **Conclusion:** If `pammCommissions` is set to a non-empty array, the table receives data and shows it. There is no extra prop or context; no filtering that would drop PAMM entries. So “render not receiving data” only happens when state is empty.

---

## 6. Exact reason why UI is not showing entries

The only way the UI shows “No PAMM commission yet” is that **`pammCommissions` is empty** when the PAMM section renders. That can only happen if one of the following is true:

1. **Request fails (most likely)**  
   `listPammCommissions()` throws (e.g. 401 Unauthorized, 403, 500, or network error). The code used `.catch(() => [])`, so the failure is swallowed and `pammRes` is `[]`, hence `setPammCommissions([])`. The UI then shows no entries even when the same backend returns correct data in another context (e.g. Postman or different user).

2. **Response is not an array**  
   Backend sometimes returns a wrapper (e.g. `{ data: [...] }`) or an error body. Then `Array.isArray(pammRes)` is false and state is set to `[]`.

3. **Request not run**  
   `loadData()` is not run or returns before the `Promise.all` (e.g. `!isAuthenticated`). Then PAMM is never fetched and state stays initial `[]`.

4. **Stale or wrong token**  
   Token in `localStorage` is expired or for another user, so the backend returns 401 and the frontend treats it as “empty list” because of the `.catch(() => [])`.

So in practice: **the UI does not show entries because the frontend treats a failed or non-array PAMM response as an empty list and never surfaces the error.**

---

## 7. Minimal fix required (frontend only)

- **Do not swallow the PAMM error.**  
  - Either: remove the `.catch(() => [])` for `listPammCommissions()` and let the outer `loadData` catch set `error` (so the user sees “Failed to load IB data” or similar), **or**  
  - Prefer: keep a single load for the page but in the `.catch` of `listPammCommissions()` set a dedicated error for PAMM (e.g. `setPammError(e.message)`) and show it near the PAMM section so the user knows the list failed to load.

- **Ensure response shape.**  
  If the backend ever returns `{ data: [...] }`, use that: e.g. `const pammList = Array.isArray(pammRes) ? pammRes : (pammRes?.data && Array.isArray(pammRes.data) ? pammRes.data : [])`. Only if you confirm the backend returns a top-level array can you keep `Array.isArray(pammRes) ? pammRes : []`.

- **Optional: force no cache for this GET.**  
  Add `cache: 'no-store'` (or similar) to the `fetch` options for `listPammCommissions()` if you suspect cached empty or old responses.

- **Debug logs added (temporary).**  
  In `src/pages/ib/index.jsx`:
  - In `loadData`: log PAMM API response (length / first item) and any error in the PAMM `.catch`.
  - After computing `pammList`: log `pammList.length` and first item.
  - In the PAMM section: log `pammCommissions.length` and first item on render.

  Use these in the browser console to confirm:
  - Whether the request runs,
  - Whether it succeeds and what shape it has,
  - What is stored in state and what the table receives.

**Summary:** The list rendering and mapping are correct. The issue is that a **failed or non-array PAMM response is turned into an empty list and not shown as an error.** The minimal fix is to stop treating PAMM failures as “empty list” and to surface the error (and optionally harden response shape and caching) on the frontend only.
