const jwt = require('jsonwebtoken');

const DEFAULT_DEV_SECRET = 'krwmp-dev-secret-change-me';
const SESSION_COOKIE_NAME = 'krwmp_session';

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

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return cookies;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key) {
        try {
          cookies[key] = decodeURIComponent(value);
        } catch (error) {
          cookies[key] = value;
        }
      }
      return cookies;
    }, {});
}

function extractCookieToken(request) {
  const cookies = parseCookies(request.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function extractAuthToken(request) {
  return extractBearerToken(request) || extractCookieToken(request);
}

function cookieAttributes({ clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
    clear ? 'Max-Age=0' : '',
  ].filter(Boolean);
}

function sessionCookieHeader(token) {
  return [`${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`, ...cookieAttributes()].join('; ');
}

function clearSessionCookieHeader() {
  return [`${SESSION_COOKIE_NAME}=`, ...cookieAttributes({ clear: true })].join('; ');
}

module.exports = {
  signToken,
  verifyToken,
  extractBearerToken,
  extractCookieToken,
  extractAuthToken,
  sessionCookieHeader,
  clearSessionCookieHeader,
  SESSION_COOKIE_NAME,
};
