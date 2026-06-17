const service = require('../services/knowledge.service');
const { requirePrivilegeInline, getRequestUser } = require('../middleware/privilege.middleware');

const PRIVILEGE_KEY = 'knowledge_portal';

function currentUser(request) {
  return getRequestUser(request) || 'system';
}

async function knowledgeRoutes(fastify) {
  fastify.get('/knowledge/categories', async (request, reply) => {
    const includeInactive = request.query?.include_inactive === 'true';
    if (includeInactive && !await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, categories: await service.listCategories({ includeInactive }) };
  });

  fastify.post('/knowledge/categories', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'create')) return;
    const category = await service.createCategory(request.body || {}, currentUser(request));
    return reply.status(201).send({ success: true, message: 'Knowledge category created successfully.', category });
  });

  fastify.put('/knowledge/categories/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const category = await service.updateCategory(request.params.id, request.body || {}, currentUser(request));
    if (!category) return reply.status(404).send({ success: false, message: 'Knowledge category not found.' });
    return { success: true, message: 'Knowledge category updated successfully.', category };
  });

  fastify.get('/knowledge/tags', async (request, reply) => {
    const includeInactive = request.query?.include_inactive === 'true';
    if (includeInactive && !await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, tags: await service.listTags({ includeInactive }) };
  });

  fastify.post('/knowledge/tags', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'create')) return;
    const tags = await service.ensureTags(request.body?.tags || request.body?.tag_names || request.body?.tag_name || [], currentUser(request));
    return reply.status(201).send({ success: true, message: 'Knowledge tags saved successfully.', tags });
  });

  fastify.get('/knowledge/dashboard', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, dashboard: await service.dashboard() };
  });

  fastify.get('/knowledge.geojson', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'map_view', 'view')) return;
    return reply.header('Content-Type', 'application/json').send(await service.geoJson(request.query || {}));
  });

  fastify.get('/knowledge', async (request, reply) => {
    const publicOnly = request.query?.public === 'true';
    if (!publicOnly && !await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, resources: await service.listContent(request.query || {}, { publicOnly }) };
  });

  fastify.get('/knowledge/:id', async (request, reply) => {
    const publicOnly = request.query?.public === 'true';
    if (!publicOnly && !await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    const resource = await service.getContent(request.params.id, { publicOnly, incrementView: publicOnly });
    if (!resource) return reply.status(404).send({ success: false, message: 'Knowledge resource not found.' });
    return { success: true, resource };
  });

  fastify.post('/knowledge', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'create')) return;
    const resource = await service.createContent(request.body || {}, currentUser(request));
    return reply.status(201).send({ success: true, message: 'Knowledge resource created successfully.', resource });
  });

  fastify.put('/knowledge/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const resource = await service.updateContent(request.params.id, request.body || {}, currentUser(request));
    if (!resource) return reply.status(404).send({ success: false, message: 'Knowledge resource not found.' });
    return { success: true, message: 'Knowledge resource updated successfully.', resource };
  });

  fastify.delete('/knowledge/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'delete')) return;
    const archived = await service.deleteContent(request.params.id, currentUser(request));
    if (!archived) return reply.status(404).send({ success: false, message: 'Knowledge resource not found.' });
    return { success: true, message: 'Knowledge resource archived successfully.' };
  });
}

module.exports = knowledgeRoutes;
