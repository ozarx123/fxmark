/**
 * In-memory access token mirror for API modules (pamm, wallet, etc.) that cannot use React context.
 * AuthContext keeps this in sync on login/logout and on initial load so fetch() always sends the same Bearer as the session.
 */
let memoryToken = null;

export function setAuthAccessToken(token) {
  if (token != null && String(token).trim()) {
    memoryToken = String(token).trim();
  } else {
    memoryToken = null;
  }
}

export function getAuthAccessToken() {
  if (memoryToken) return memoryToken;
  try {
    const raw = localStorage.getItem('fxmark_token');
    const t = raw && String(raw).trim();
    return t || null;
  } catch {
    return null;
  }
}
