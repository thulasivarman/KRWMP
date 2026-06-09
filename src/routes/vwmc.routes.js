const service = require('../services/vwmc.service');

function getUser(request) {
  return String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'system').trim();
}

function getRole(request) {
  return String(request.headers['x-krwmp-role'] || request.headers['x-role'] || '').trim().toLowerCase();
}

function canManage(request) {
  const role = getRole(request);
  return role === 'admin' || role === 'data_collectors' || role === 'data_collector';
}

function requireManage(request, reply) {
  if (!canManage(request)) {
    reply.status(403).send({ success: false, message: 'Only admin and data_collectors can manage VWMC records.' });
    return false;
  }
  return true;
}

async function vwmcRoutes(fastify) {
  fastify.get('/vwmc/committees', async () => {
    const committees = await service.listCommittees();
    return { success: true, committees };
  });

  fastify.get('/vwmc/committees/:id', async (request, reply) => {
    const committee = await service.getCommittee(request.params.id);
    if (!committee) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, committee };
  });

  fastify.post('/vwmc/committees', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const committee = await service.createCommittee(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, committee });
  });

  fastify.put('/vwmc/committees/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const committee = await service.updateCommittee(request.params.id, request.body || {}, getUser(request));
    if (!committee) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, committee };
  });

  fastify.delete('/vwmc/committees/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const deleted = await service.deleteCommittee(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, deleted: request.params.id };
  });

  fastify.post('/vwmc/committees/:id/members', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const member = await service.createMember(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, member });
  });

  fastify.put('/vwmc/members/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const member = await service.updateMember(request.params.id, request.body || {}, getUser(request));
    if (!member) return reply.status(404).send({ success: false, message: 'Member not found' });
    return { success: true, member };
  });

  fastify.delete('/vwmc/members/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const deleted = await service.deleteMember(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Member not found' });
    return { success: true, deleted: request.params.id };
  });
}

module.exports = vwmcRoutes;
