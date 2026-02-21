/**
 * Auth service
 * User registration, login, JWT issue/refresh, logout
 */
const jwt = require('jsonwebtoken');
const config = require('../../config/env.config');

async function register(payload) {
  // TODO: validate, create user, hash password, return tokens
  return { accessToken: '', refreshToken: '', user: {} };
}

async function login(payload) {
  // TODO: find user, verify password, issue tokens
  return { accessToken: '', refreshToken: '', user: {} };
}

async function refresh(refreshToken) {
  // TODO: verify refresh token, issue new access + refresh
  return { accessToken: '', refreshToken: '' };
}

async function logout(userId, refreshToken) {
  // TODO: invalidate refresh token (e.g. Redis blacklist)
}

async function me(userId) {
  // TODO: load user profile by id
  return {};
}

function signToken(payload, expiresIn = config.jwtExpiry) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  me,
  signToken,
};
