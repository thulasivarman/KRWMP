const service = require('../services/dashboard-intelligence.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function dashboardIntelligenceRoutes(fastify) {
  fastify.get('/dashboard-intelligence/summary', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'dashboard_view', 'view')) return;
    return { success: true, intelligence: await service.summary() };
  });

  fastify.get('/dashboard-intelligence/complaint-conversion', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'dashboard_view', 'view')) return;
    return { success: true, metric: await service.complaintConversionRate() };
  });

  fastify.get('/dashboard-intelligence/unresolved-hotspots', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'dashboard_view', 'view')) return;
    return { success: true, metric: await service.unresolvedHotspotDensity() };
  });

  fastify.get('/dashboard-intelligence/pollution-recurrence', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'dashboard_view', 'view')) return;
    return { success: true, metric: await service.pollutionRecurrenceIndex() };
  });

  fastify.get('/dashboard-intelligence/intervention-effectiveness', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'dashboard_view', 'view')) return;
    return { success: true, metric: await service.interventionEffectiveness() };
  });

  fastify.get('/dashboard-intelligence/watershed-health', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'dashboard_view', 'view')) return;
    return { success: true, metric: await service.watershedHealthScore() };
  });
}

module.exports = dashboardIntelligenceRoutes;
