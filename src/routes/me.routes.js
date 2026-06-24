const authService = require('../services/auth.service');
const { getRequestUser } = require('../middleware/privilege.middleware');

function statusFromError(error) {
  return Number(error?.statusCode || error?.status || 500);
}

async function meRoutes(fastify) {
  fastify.get('/me/profile', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const userIdentifier = getRequestUser(request);
    if (!userIdentifier) return reply.status(401).send({ success: false, message: 'Authentication required' });
    const profile = await authService.getSelfProfile(userIdentifier);
    if (!profile) return reply.status(404).send({ success: false, message: 'Profile not found' });
    return { success: true, profile };
  });

  fastify.put('/me/profile', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const userIdentifier = getRequestUser(request);
    if (!userIdentifier) return reply.status(401).send({ success: false, message: 'Authentication required' });
    try {
      const profile = await authService.updateSelfProfile(userIdentifier, request.body || {});
      return { success: true, message: 'Profile updated successfully', profile };
    } catch (error) {
      return reply.status(statusFromError(error)).send({ success: false, message: error.message || 'Unable to update profile' });
    }
  });
}

module.exports = meRoutes;
