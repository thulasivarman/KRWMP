const authService = require('../services/auth.service');
const { getRequestUser } = require('../middleware/privilege.middleware');
const { clearSessionCookieHeader, sessionCookieHeader } = require('../utils/jwt');

async function authRoutes(fastify) {
  fastify.post('/login', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const { username, password } = request.body || {};
    if (!username || !password) return reply.status(400).send({ success: false, message: 'Username and password are required' });
    const result = await authService.login(username, password);
    if (!result.success) return reply.status(401).send(result);
    reply.header('Set-Cookie', sessionCookieHeader(result.token));
    const { token, ...publicResult } = result;
    return publicResult;
  });

  fastify.post('/logout', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
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
