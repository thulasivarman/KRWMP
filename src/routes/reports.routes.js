const reportsService = require('../services/reports.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function reportsRoutes(fastify) {
  fastify.get('/reports/catalogue', async (request, reply) => {
    const allowed = await requirePrivilegeInline(request, reply, 'reports_export', 'view');
    if (!allowed) return;
    return {
      success: true,
      reports: Object.entries(reportsService.REPORTS).map(([key, value]) => ({ key, title: value.title }))
    };
  });

  fastify.get('/reports/:type', async (request, reply) => {
    const allowed = await requirePrivilegeInline(request, reply, 'reports_export', 'view');
    if (!allowed) return;
    return { success: true, report: await reportsService.generate(request.params.type, request.query || {}) };
  });
}

module.exports = reportsRoutes;
