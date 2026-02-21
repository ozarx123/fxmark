/**
 * Auth controller
 * Register, login, refresh, logout, me
 */
const authService = require('./auth.service');

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

module.exports = { register, login, refresh, logout, me };
