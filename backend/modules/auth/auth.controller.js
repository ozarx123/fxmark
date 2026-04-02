import authService from './auth.service.js';
import config from '../../config/env.config.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

/** Plain HTML when user opens verification link on API (no FRONTEND_URL redirect). */
function buildEmailVerifiedHtml(result) {
  const fe = (config.frontendBaseUrl || '').trim().replace(/\/$/, '');
  const signInHref = fe ? `${fe}/auth` : '';
  const title = result?.alreadyVerified ? 'Already verified' : 'Email verified';
  const body = result?.alreadyVerified
    ? escapeHtml(result.message || 'Your email is already verified.')
    : 'Your email has been verified. You can sign in.';
  const signIn = signInHref
    ? `<p><a href="${escapeHtml(signInHref)}">Sign in</a></p>`
    : '<p>You can close this window and sign in using your app or website.</p>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">${escapeHtml(title)}</h1><p>${body}</p>${signIn}</body></html>`;
}

function buildEmailVerificationErrorHtml(err) {
  const code = err?.code ? `<p style="color:#64748b;font-size:0.9rem">${escapeHtml(err.code)}</p>` : '';
  const hint = err?.hint ? `<p>${escapeHtml(err.hint)}</p>` : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Verification failed</title></head><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:2rem auto;padding:0 1rem"><h1 style="font-size:1.25rem">Verification failed</h1><p>${escapeHtml(err?.message || 'Something went wrong.')}</p>${hint}${code}</body></html>`;
}

/** Query ?token=, path :token, JSON body, or duplicate keys / odd casing (Token=). */
function pickVerificationToken(req) {
  const fromParam = req.params?.token;
  if (fromParam != null && typeof fromParam === 'string' && fromParam.trim()) {
    return fromParam.trim();
  }
  const fromBody = req.body?.token;
  if (fromBody != null && typeof fromBody === 'string' && fromBody.trim()) {
    return fromBody.trim();
  }
  const q = req.query;
  if (q && typeof q === 'object') {
    const direct = q.token;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    if (Array.isArray(direct) && direct[0] && typeof direct[0] === 'string') return direct[0].trim();
    for (const [k, v] of Object.entries(q)) {
      if (String(k).toLowerCase() !== 'token') continue;
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (Array.isArray(v) && v[0] && typeof v[0] === 'string') return v[0].trim();
    }
  }
  return null;
}

const TOKEN_REQUIRED_JSON = {
  error: 'Verification token is required',
  code: 'TOKEN_REQUIRED',
  hint: 'Open the full link from your email, or open the app and use “Resend verification email”.',
};

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

function loginPageFallback(req, res) {
  const base = (config.frontendBaseUrl || '').replace(/\/$/, '');
  if (!base) {
    return res.status(405).json({
      error: 'Method not allowed',
      hint: 'Use POST /api/auth/login with JSON body: { "email": "user@example.com", "password": "..." }',
    });
  }
  return res.redirect(302, `${base}/auth`);
}

async function refresh(req, res, next) {
  try {
    const result = await authService.refresh(req.body.refreshToken);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logout(req.user?.id, req.body.refreshToken, req.user);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.me(req.user?.id);
    res.json(user);
  } catch (e) {
    next(e);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const token = pickVerificationToken(req);

    // GET: redirect to SPA when FRONTEND_URL is set; otherwise verify on the API and return HTML
    if (req.method === 'GET') {
      if (!token) {
        return res.status(400).json(TOKEN_REQUIRED_JSON);
      }
      const base = (config.frontendBaseUrl || '').trim().replace(/\/$/, '');
      if (base) {
        const dest = `${base}/verify-email/${encodeURIComponent(token)}`;
        return res.redirect(302, dest);
      }
      try {
        const result = await authService.verifyEmail(token);
        return res.status(200).type('html').send(buildEmailVerifiedHtml(result));
      } catch (e) {
        const status = Number(e?.statusCode) && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 400;
        return res.status(status).type('html').send(buildEmailVerificationErrorHtml(e));
      }
    }

    if (!token) {
      return res.status(400).json(TOKEN_REQUIRED_JSON);
    }

    const result = await authService.verifyEmail(token);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function resendVerification(req, res, next) {
  try {
    const email = req.body?.email || req.query?.email;
    if (!email && req.method === 'GET') {
      return res.status(200).json({
        ok: false,
        message: 'Email is required to resend verification.',
        hint: 'Use POST /api/auth/resend-verification with JSON body: { "email": "user@example.com" }',
      });
    }
    const result = await authService.resendVerificationEmail(email);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function changePassword(req, res, next) {
  try {
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body || {};
    const result = await authService.changePassword(userId, currentPassword, newPassword, req.user);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function changeInvestorPassword(req, res, next) {
  try {
    const userId = req.user?.id;
    const { currentInvestorPassword, newInvestorPassword } = req.body || {};
    const result = await authService.changeInvestorPassword(userId, currentInvestorPassword, newInvestorPassword);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const result = await authService.requestForgotPassword(req.body?.email);
    res.json(result);
  } catch (e) {
    next(e);
  }
}

async function resetPassword(req, res, next) {
  try {
    // GET: email clients that open the API URL → redirect to SPA (same pattern as verify-email)
    if (req.method === 'GET') {
      const token = req.query.token;
      if (!token || typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({
          error: 'Reset token is required',
          hint: 'Open the full link from your email, or use Forgot password on the sign-in page.',
        });
      }
      const base = (config.frontendBaseUrl || '').replace(/\/$/, '');
      if (!base) {
        return res.status(503).json({
          error: 'Password reset redirect is not configured. Set FRONTEND_URL (or WEB_APP_URL) on the server.',
          code: 'FRONTEND_URL_MISSING',
        });
      }
      const dest = `${base}/#/reset-password?token=${encodeURIComponent(token.trim())}`;
      return res.redirect(302, dest);
    }
    const result = await authService.resetPasswordWithToken(req.body || {});
    res.json(result);
  } catch (e) {
    next(e);
  }
}

export default {
  register,
  login,
  loginPageFallback,
  refresh,
  logout,
  me,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  changePassword,
  changeInvestorPassword,
};
