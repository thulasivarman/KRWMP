const jwt = require('jsonwebtoken');

const DEFAULT_DEV_SECRET = 'krwmp-dev-secret-change-me';

function jwtSecret() {
  const secret = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;
  if (secret === DEFAULT_DEV_SECRET && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production.');
  }
  return secret;
}

function signToken(user = {}) {
  const identifier = String(user.identifier || user.username || '').trim().toLowerCase();
  if (!identifier) throw new Error('Cannot sign JWT without user identifier.');

  return jwt.sign(
    {
      sub: identifier,
      identifier,
      name: user.name || null,
      role_name: user.role_name || null,
    },
    jwtSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      issuer: 'krwmp-portal',
      audience: 'krwmp-users',
    }
  );
}

function verifyToken(token) {
  if (!token) return null;
  return jwt.verify(token, jwtSecret(), {
    issuer: 'krwmp-portal',
    audience: 'krwmp-users',
  });
}

function extractBearerToken(request) {
  const authorization = String(request.headers.authorization || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

module.exports = { signToken, verifyToken, extractBearerToken };
