const institutionService = require('../services/institution.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');

function getUser(request) {
  return getRequestUser(request) || 'system';
}

async function institutionRoutes(fastify) {
  fastify.get('/institutions/types', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'view')) return;
    const types = await institutionService.listInstitutionTypes();
    return { success: true, types };
  });

  fastify.get('/institutions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'view')) return;
    const result = await institutionService.listInstitutions(request.query || {});
    return { success: true, ...result };
  });

  fastify.get('/institutions/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'view')) return;
    const institution = await institutionService.getInstitution(request.params.id);
    if (!institution) return reply.status(404).send({ success: false, message: 'Institution not found.' });
    return { success: true, institution };
  });

  fastify.post('/institutions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'create')) return;
    try {
      const institution = await institutionService.createInstitution(request.body || {}, getUser(request));
      return reply.status(201).send({ success: true, institution });
    } catch (error) {
      const duplicate = String(error.message || '').includes('duplicate key') || error.code === '23505';
      return reply.status(duplicate ? 409 : 400).send({ success: false, message: duplicate ? 'Institution name or code already exists.' : error.message });
    }
  });

  fastify.put('/institutions/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'update')) return;
    try {
      const institution = await institutionService.updateInstitution(request.params.id, request.body || {}, getUser(request));
      if (!institution) return reply.status(404).send({ success: false, message: 'Institution not found.' });
      return { success: true, institution };
    } catch (error) {
      const duplicate = String(error.message || '').includes('duplicate key') || error.code === '23505';
      return reply.status(duplicate ? 409 : 400).send({ success: false, message: duplicate ? 'Institution name or code already exists.' : error.message });
    }
  });

  fastify.delete('/institutions/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'delete')) return;
    const institution = await institutionService.deactivateInstitution(request.params.id, getUser(request));
    if (!institution) return reply.status(404).send({ success: false, message: 'Institution not found.' });
    return { success: true, deleted: request.params.id };
  });
}

module.exports = institutionRoutes;
