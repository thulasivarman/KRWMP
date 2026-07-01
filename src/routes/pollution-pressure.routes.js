const pollutionPressureService = require('../services/pollution-pressure.service');

function notFound(reply, label) {
  return reply.status(404).send({
    success: false,
    message: `${label} not found`
  });
}

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
    const summary = await pollutionPressureService.getGNSummary(request.query || {});
    return reply.send({
      success: true,
      data: summary
    });
  });

  fastify.get('/analytics/pollution-pressure/critical-gns', async (request, reply) => {
    const summary = await pollutionPressureService.getCriticalGNs(request.query || {});
    return reply.send({
      success: true,
      data: summary
    });
  });

  fastify.get('/analytics/pollution-pressure/dashboard-summary', async (request, reply) => {
    const summary = await pollutionPressureService.getDashboardSummary(request.query || {});
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

  fastify.put('/analytics/pollution-pressure/config/components/:id', async (request, reply) => {
    const row = await pollutionPressureService.updateComponent(request.params.id, request.body || {});
    if (!row) return notFound(reply, 'Component');
    return reply.send({ success: true, data: row });
  });

  fastify.put('/analytics/pollution-pressure/config/rules/:id', async (request, reply) => {
    const row = await pollutionPressureService.updateRule(request.params.id, request.body || {});
    if (!row) return notFound(reply, 'Rule');
    return reply.send({ success: true, data: row });
  });

  fastify.put('/analytics/pollution-pressure/config/classes/:id', async (request, reply) => {
    const row = await pollutionPressureService.updatePressureClass(request.params.id, request.body || {});
    if (!row) return notFound(reply, 'Pressure class');
    return reply.send({ success: true, data: row });
  });
}

module.exports = pollutionPressureRoutes;
