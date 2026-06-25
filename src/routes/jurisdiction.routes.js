async function jurisdictionRoutes(fastify) {
  fastify.get('/jurisdictions/health', async () => ({ success: true, module: 'jurisdiction' }));
}

module.exports = jurisdictionRoutes;
