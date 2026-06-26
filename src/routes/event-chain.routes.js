const service = require('../services/event-chain.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function eventChainRoutes(fastify) {
  fastify.get('/interventions/registry/:id/event-chain', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const chain = await service.getEventChain(request.params.id);
    if (!chain) return reply.status(404).send({ success: false, message: 'Intervention not found.' });
    return { success: true, event_chain: chain };
  });

  fastify.get('/event-relationships', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const relationships = await service.listRelationshipRows(request.query || {});
    return { success: true, relationships };
  });
}

module.exports = eventChainRoutes;
