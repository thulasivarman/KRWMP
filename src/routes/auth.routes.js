const authService = require('../services/auth.service');

async function authRoutes(fastify) {
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body || {};

    if (!username || !password) {
      return reply.status(400).send({
        success: false,
        message: 'Username and password are required',
      });
    }

    const result = await authService.login(username, password);

    if (!result.success) {
      return reply.status(401).send(result);
    }

    return result;
  });

  fastify.get('/auth/profile', async (request, reply) => {
    const profile = await authService.getProfile('thulasi');

    if (!profile) {
      return reply.status(404).send({
        success: false,
        message: 'Profile not found',
      });
    }

    return {
      success: true,
      user: profile,
    };
  });

  fastify.post('/auth/profile/update', async (request) => {
    await authService.updateProfile(request.body);
    return {
      success: true,
      message: 'Profile updated successfully',
    };
  });
}

module.exports = authRoutes;