const reportsService = require('../services/reports.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function reportsRoutes(fastify) {
  fastify.get('/reports/community-complaints', async (request, reply) => {
    const allowed = await requirePrivilegeInline(request, reply, 'reports_export', 'view');
    if (!allowed) return;
    return { success: true, report: await reportsService.communityComplaints(request.query || {}) };
  });

  fastify.get('/reports/interventions', async (request, reply) => {
    const allowed = await requirePrivilegeInline(request, reply, 'reports_export', 'view');
    if (!allowed) return;
    return { success: true, report: await reportsService.interventions(request.query || {}) };
  });
}

module.exports = reportsRoutes;
