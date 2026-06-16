const service = require('../services/volunteer-organisation.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

function getUser(request) {
  return String(request.headers['x-krwmp-user'] || 'system').trim();
}

async function volunteerOrganisationRoutes(fastify) {
  fastify.get('/volunteer-organisations/dashboard', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'view')) return;
    return { success: true, dashboard: await service.dashboard() };
  });

  fastify.get('/volunteer-organisations', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'view')) return;
    return { success: true, organisations: await service.listOrganisations() };
  });

  fastify.post('/volunteer-organisations', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'create')) return;
    try {
      const organisation = await service.createOrganisation(request.body || {}, getUser(request));
      return reply.status(201).send({ success: true, organisation });
    } catch (error) {
      const duplicate = String(error.message || '').includes('duplicate key') || error.code === '23505';
      return reply.status(duplicate ? 409 : 400).send({ success: false, message: duplicate ? 'Organisation name or registration/code already exists.' : error.message });
    }
  });

  fastify.get('/volunteer-organisations/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'view')) return;
    const organisation = await service.getOrganisation(request.params.id);
    if (!organisation) return reply.status(404).send({ success: false, message: 'Record not found.' });
    return { success: true, organisation };
  });
}

module.exports = volunteerOrganisationRoutes;
