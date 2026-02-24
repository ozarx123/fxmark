import jwt from 'jsonwebtoken';
import config from '../../config/env.config.js';

export function verify(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function decode(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

export default { verify, decode };
