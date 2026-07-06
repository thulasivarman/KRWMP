const pollutionPressureService = require('../services/pollution-pressure.service');

function notFound(reply, label) {
  return reply.status(404).send({
    success: false,
    message: `${label} not found`
  });
}

async function pollutionPressureConfigRoutes(fastify) {
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

module.exports = pollutionPressureConfigRoutes;
