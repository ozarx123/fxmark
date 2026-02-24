/**
 * Admin API helpers — require Bearer token
 */
const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('fxmark_token');
}

export async function fetchWithAuth(url, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  return res;
}

export async function listUsers(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/users${q ? `?${q}` : ''}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error('Please log in again to view users.');
    if (res.status === 403) throw new Error('Access denied. Admin or Super Admin role required.');
    throw new Error(data.error || data.message || 'Failed to fetch users');
  }
  return res.json();
}

export async function updateUser(id, { role, kycStatus }) {
  const body = {};
  if (role !== undefined) body.role = role;
  if (kycStatus !== undefined) body.kycStatus = kycStatus;
  const res = await fetchWithAuth(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update user');
  return res.json();
}

export async function listPammManagers(params = {}) {
  const q = new URLSearchParams(params).toString();
  const res = await fetchWithAuth(`/admin/pamm/managers${q ? `?${q}` : ''}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to fetch PAMM managers');
  return res.json();
}

export async function approvePammManager(id, approvalStatus) {
  const res = await fetchWithAuth(`/admin/pamm/managers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ approvalStatus }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update PAMM manager');
  return res.json();
}
