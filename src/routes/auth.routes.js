const authService = require('../services/auth.service');
const audit = require('../services/audit-log.service');
const { getRequestUser } = require('../middleware/privilege.middleware');
const { clearSessionCookieHeader, sessionCookieHeader } = require('../utils/jwt');

async function authRoutes(fastify) {
  fastify.post('/login', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { username, password } = request.body || {};
    if (!username || !password) return reply.status(400).send({ success: false, message: 'Username and password are required' });
    const result = await authService.login(username, password);
    if (!result.success) {
      await audit.logLogin({
        request,
        username,
        severity: 'warning',
        summary: 'Failed login attempt',
        details: { username, success: false },
      });
      return reply.status(401).send(result);
    }
    reply.header('Set-Cookie', sessionCookieHeader(result.token));
    const { token, ...publicResult } = result;
    await audit.logLogin({
      request,
      user_id: result.user?.id,
      username: result.user?.identifier || username,
      summary: 'User logged in',
      details: { success: true, role_name: result.user?.role_name || null },
    });
    return publicResult;
  });

  fastify.post('/logout', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    await audit.logLogout({
      request,
      summary: 'User logged out',
    });
    reply.header('Set-Cookie', clearSessionCookieHeader());
    return { success: true, message: 'Logged out successfully' };
  });

  fastify.get('/auth/profile', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const userIdentifier = getRequestUser(request);
    if (!userIdentifier) return reply.status(401).send({ success: false, message: 'Authentication required' });
    const profile = await authService.getProfile(userIdentifier);
    if (!profile) return reply.status(404).send({ success: false, message: 'Profile not found' });
    return { success: true, user: profile };
  });

  fastify.post('/auth/profile/update', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const userIdentifier = getRequestUser(request);
    if (!userIdentifier) return reply.status(401).send({ success: false, message: 'Authentication required' });
    await authService.updateProfile(userIdentifier, request.body || {});
    return { success: true, message: 'Profile updated successfully' };
  });
}

module.exports = authRoutes;
