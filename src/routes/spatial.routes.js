const spatialService = require('../services/spatial.service');

async function spatialRoutes(fastify) {
  fastify.get('/spatial/basin', async (request, reply) => {
    const geojson = await spatialService.getBasin();
    return reply.header('Content-Type', 'application/json').send(geojson);
  });

  fastify.get('/spatial/dsd', async (request, reply) => {
    const geojson = await spatialService.getDSD();
    return reply.header('Content-Type', 'application/json').send(geojson);
  });

  fastify.get('/spatial/gnd', async (request, reply) => {
    const geojson = await spatialService.getGND();
    return reply.header('Content-Type', 'application/json').send(geojson);
  });

  fastify.get('/spatial/forest', async (request, reply) => {
    const geojson = await spatialService.getForest();
    return reply.header('Content-Type', 'application/json').send(geojson);
  });

  fastify.get('/spatial/identify', async (request, reply) => {
    const { lat, lng } = request.query || {};
    try {
      const result = await spatialService.identifyLocation(lat, lng);
      return { success: true, ...result };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message || 'Unable to identify location' });
    }
  });
}

module.exports = spatialRoutes;
