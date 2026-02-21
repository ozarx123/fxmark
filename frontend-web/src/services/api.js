/**
 * API client for api.fxmarkglobal.com
 */
const baseUrl = process.env.REACT_APP_API_URL || '/api';

export async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
