const { getRequestUser, getUserPrivileges } = require('../middleware/privilege.middleware');

async function privilegesRoutes(fastify) {
  fastify.get('/me/privileges', async (request) => {
    const identifier = getRequestUser(request);
    const privileges = await getUserPrivileges(identifier);
    return { success: true, identifier, privileges };
  });
}

module.exports = privilegesRoutes;
