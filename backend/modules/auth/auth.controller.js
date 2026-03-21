import authService from './auth.service.js';
import config from '../../config/env.config.js';

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
    await authService.logout(req.user?.id, req.body.refreshToken);
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
    const token = req.query.token || req.body?.token;

    // Old emails linked to the API URL — send users to the SPA with the same token
    if (req.method === 'GET') {
      if (!token || typeof token !== 'string' || !token.trim()) {
        return res.status(400).json({
          error: 'Verification token is required',
          code: 'TOKEN_REQUIRED',
          hint: 'Open the full link from your email, or open the app and use “Resend verification email”.',
        });
      }
      const base = (config.frontendBaseUrl || '').replace(/\/$/, '');
      if (!base) {
        return res.status(503).json({
          error: 'Email verification redirect is not configured. Set FRONTEND_URL (or WEB_APP_URL) on the server.',
          code: 'FRONTEND_URL_MISSING',
        });
      }
      const dest = `${base}/verify-email?token=${encodeURIComponent(token.trim())}`;
      return res.redirect(302, dest);
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
    const result = await authService.changePassword(userId, currentPassword, newPassword);
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
