/**
 * API client for mobile
 */
const baseUrl = process.env.API_URL || 'https://api.fxmarkglobal.com';

export async function request(path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, options);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
