const pollutionPressureService = require('../services/pollution-pressure.service');

async function pollutionPressureRoutes(fastify) {
  fastify.get('/analytics/pollution-pressure/heatmap', async (request, reply) => {
    const points = await pollutionPressureService.getHeatmapPoints(request.query || {});
    return reply.send({
      success: true,
      data: points
    });
  });

  fastify.get('/analytics/pollution-pressure/heatmap.geojson', async (request, reply) => {
    const geojson = await pollutionPressureService.getHeatmapGeoJson(request.query || {});
    return reply.header('Content-Type', 'application/json').send(geojson);
  });

  fastify.get('/analytics/pollution-pressure/gn-summary', async (request, reply) => {
    const summary = await pollutionPressureService.getGNSummary();
    return reply.send({
      success: true,
      data: summary
    });
  });

  fastify.get('/analytics/pollution-pressure/dashboard-summary', async (request, reply) => {
    const summary = await pollutionPressureService.getDashboardSummary();
    return reply.send({
      success: true,
      data: summary
    });
  });

  fastify.get('/analytics/pollution-pressure/config', async (request, reply) => {
    const config = await pollutionPressureService.getModelConfiguration();
    return reply.send({
      success: true,
      data: config
    });
  });
}

module.exports = pollutionPressureRoutes;
