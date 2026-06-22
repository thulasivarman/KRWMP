const service = require('../services/home-summary.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function homeSummaryRoutes(fastify) {
  fastify.get('/home/dashboard', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'map_view', 'view')) return;
    return { success: true, dashboard: await service.getCatchmentDashboard() };
  });

  fastify.get('/home/summary', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'map_view', 'view')) return;
    const dashboard = await service.getCatchmentDashboard();
    return { success: true, summary: dashboard, dashboard };
  });
}

module.exports = homeSummaryRoutes;
