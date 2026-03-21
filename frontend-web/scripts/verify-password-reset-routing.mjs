/**
 * Verifies react-router matches /reset-password before the splash catch-all (*),
 * and documents why production can still show the homepage.
 *
 * Run: node scripts/verify-password-reset-routing.mjs
 */
import { matchRoutes } from 'react-router';

const routeObjects = [
  { path: '/', element: null },
  { path: '/reset-password', element: null },
  { path: '/forgot-password', element: null },
  { path: '/auth/callback', element: null },
  { path: '/auth/verify-email', element: null },
  { path: '/verify-email', element: null },
  { path: '/auth/forgot-password', element: null },
  { path: '/auth/reset-password', element: null },
  { path: '/auth/profile-setup', element: null },
  { path: '/auth', element: null },
  {
    element: null,
    children: [
      { path: 'dashboard', element: null },
      { path: 'wallet', element: null },
      { path: 'trading', element: null },
      { path: 'finance', element: null },
      { path: 'settings/profile', element: null },
    ],
  },
  { path: 'admin', element: null, children: [{ index: true, element: null }] },
  { path: '*', element: null },
];

console.log('=== matchRoutes (simplified App tree) ===\n');
for (const p of ['/', '/reset-password', '/reset-password?token=x', '/dashboard', '/foo']) {
  const m = matchRoutes(routeObjects, p);
  const last = m?.[m.length - 1];
  const routePath = last?.route?.path;
  const label =
    routePath === '*'
      ? 'CATCH-ALL → Navigate to / in App (homepage)'
      : routePath === '/'
        ? 'Landing'
        : routePath || '(layout)';
  console.log(p.padEnd(28), '→', routePath ?? 'null', ' | ', label);
}

console.log('\n=== Hash lift (same logic as main.jsx) ===\n');
function simulateLift(href) {
  const u = new URL(href);
  const h = u.hash;
  if (!h || h.length < 2) return { after: href, lifted: false };
  const inner = h.slice(1);
  const pathPart = inner.split('?')[0];
  const queryPart = inner.includes('?') ? inner.slice(inner.indexOf('?')) : '';
  if (pathPart !== 'reset-password' && pathPart !== '/reset-password') {
    return { after: href, lifted: false };
  }
  const newPath = `/reset-password${queryPart}`;
  return { after: `${u.origin}${newPath}`, lifted: true, pathnameSearch: newPath };
}

for (const href of [
  'https://fxmarktrade.com/#/reset-password?token=abc',
  'https://fxmarktrade.com/#reset-password?token=abc',
]) {
  console.log('before:', href);
  console.log(' ', simulateLift(href));
}

console.log('\n=== Why homepage on production? ===');
console.log(
  '1) Host/CDN does not serve index.html for /reset-password → browser may get / or 404 HTML.\n' +
    '2) React Router then sees pathname "/" → <Route path="/"> (Landing) or <Route path="*"> → Navigate to "/".\n' +
    '3) Fix: email uses /#/reset-password?token= (hash) + lift in main.jsx; add SPA rewrite on the host.\n'
);
