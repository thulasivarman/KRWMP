const service = require('../services/jurisdiction.service');

async function jurisdictionRoutes(fastify) {
  fastify.get('/jurisdictions/health', async () => ({ success: true, module: 'jurisdiction' }));

  fastify.get('/jurisdictions', async (request) => {
    const jurisdictions = await service.listJurisdictions(request.query || {});
    return { success: true, jurisdictions };
  });

  fastify.get('/jurisdictions/:id/gnds', async (request) => {
    const gnds = await service.getJurisdictionGnds(request.params.id);
    return { success: true, gnds };
  });
}

module.exports = jurisdictionRoutes;
