const service = require('../services/intervention.service');

function getUser(request) {
  return String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'system').trim();
}

function getRole(request) {
  return String(request.headers['x-krwmp-role'] || request.headers['x-role'] || '').trim().toLowerCase();
}

function isAdmin(request) {
  return getRole(request) === 'admin';
}

function canOfficerManage(request) {
  const role = getRole(request);
  return role === 'admin' || role === 'officer' || role === 'officers';
}

function requireAdmin(request, reply) {
  if (!isAdmin(request)) {
    reply.status(403).send({ success: false, message: 'Only admin users can manage the Intervention Library.' });
    return false;
  }
  return true;
}

function requireOfficer(request, reply) {
  if (!canOfficerManage(request)) {
    reply.status(403).send({ success: false, message: 'Only admin and officer users can manage intervention registry records.' });
    return false;
  }
  return true;
}

async function interventionRoutes(fastify) {
  fastify.get('/interventions/library', async () => {
    const library = await service.listLibrary();
    return { success: true, library };
  });

  fastify.post('/interventions/library', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const item = await service.createLibrary(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, item });
  });

  fastify.put('/interventions/library/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const item = await service.updateLibrary(request.params.id, request.body || {}, getUser(request));
    if (!item) return reply.status(404).send({ success: false, message: 'Intervention library item not found' });
    return { success: true, item };
  });

  fastify.get('/interventions/registry', async () => {
    const interventions = await service.listRegistry();
    return { success: true, interventions };
  });

  fastify.post('/interventions/registry', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const intervention = await service.createRegistry(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, intervention });
  });

  fastify.put('/interventions/registry/:id', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const intervention = await service.updateRegistry(request.params.id, request.body || {}, getUser(request));
    if (!intervention) return reply.status(404).send({ success: false, message: 'Intervention not found' });
    return { success: true, intervention };
  });

  fastify.post('/interventions/registry/:id/timeline', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const action = await service.createTimeline(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, action });
  });

  fastify.post('/interventions/registry/:id/officers', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const officer = await service.createOfficer(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, officer });
  });

  fastify.get('/interventions/registry.geojson', async () => service.getGeoJson());
}

module.exports = interventionRoutes;
