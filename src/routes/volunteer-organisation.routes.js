const service = require('../services/volunteer-organisation.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function volunteerOrganisationRoutes(fastify) {
  fastify.get('/volunteer-organisations/dashboard', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'view')) return;
    return { success: true, dashboard: await service.dashboard() };
  });

  fastify.get('/volunteer-organisations', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'view')) return;
    return { success: true, organisations: await service.listOrganisations() };
  });
}

module.exports = volunteerOrganisationRoutes;
