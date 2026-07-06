const spatialService = require('../services/spatial.service');
const { getRequestUser, hasPrivilege } = require('../middleware/privilege.middleware');

function getMapRequestUser(request) {
  return getRequestUser(request) || process.env.KRWMP_PUBLIC_MAP_USER || 'thulasi';
}

async function requireMapView(request, reply) {
  const user = getMapRequestUser(request);
  const allowed = await hasPrivilege(user, 'map_view', 'view');
  if (!allowed) {
    reply.status(403).send({ success: false, message: 'Access denied. Required privilege: map_view:view' });
    return false;
  }
  return true;
}

async function gisSpatialRoutes(fastify) {
  fastify.get('/spatial/basin', async (request, reply) => {
    if (!await requireMapView(request, reply)) return;
    return reply.header('Content-Type', 'application/json').send(await spatialService.getBasin());
  });

  fastify.get('/spatial/dsd', async (request, reply) => {
    if (!await requireMapView(request, reply)) return;
    return reply.header('Content-Type', 'application/json').send(await spatialService.getDSD());
  });

  fastify.get('/spatial/gnd', async (request, reply) => {
    if (!await requireMapView(request, reply)) return;
    return reply.header('Content-Type', 'application/json').send(await spatialService.getGND());
  });

  fastify.get('/spatial/forest', async (request, reply) => {
    if (!await requireMapView(request, reply)) return;
    return reply.header('Content-Type', 'application/json').send(await spatialService.getForest());
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

module.exports = gisSpatialRoutes;
