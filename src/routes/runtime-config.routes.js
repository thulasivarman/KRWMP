async function runtimeConfigRoutes(fastify) {
  fastify.get('/runtime-config', async () => ({
    success: true,
    config: {
      GIS_API_BASE_URL: process.env.GIS_API_BASE_URL || ''
    }
  }));
}

module.exports = runtimeConfigRoutes;
