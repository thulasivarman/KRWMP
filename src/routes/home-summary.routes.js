const service = require('../services/home-summary.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function homeSummaryRoutes(fastify) {
  fastify.get('/home/summary', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'map_view', 'view')) return;
    return { success: true, summary: await service.getCatchmentSummary() };
  });
}

module.exports = homeSummaryRoutes;
