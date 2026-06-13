const service = require('../services/pollution-source.service');
const { requirePrivilegeInline, getRequestUser } = require('../middleware/privilege.middleware');

const PRIVILEGE_KEY = 'pollution_sources_management';

function currentUser(request) {
  return getRequestUser(request) || String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'system').trim();
}

function note(request) {
  return request.body?.linkage_note || request.body?.note || null;
}

async function pollutionSourceRoutes(fastify) {
  fastify.get('/pollution-sources/lookups/source-types', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, source_types: await service.listSourceTypes({ includeInactive: request.query?.include_inactive === 'true' }) };
  });

  fastify.get('/pollution-sources/lookups/impact-levels', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, impact_levels: await service.listImpactLevels() };
  });

  fastify.get('/pollution-sources/lookups/impacts', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, impacts: await service.listImpacts({ includeInactive: request.query?.include_inactive === 'true' }) };
  });

  fastify.get('/pollution-sources/lookups/treatment-methods', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, treatment_methods: await service.listTreatmentMethods({ includeInactive: request.query?.include_inactive === 'true' }) };
  });

  fastify.get('/pollution-sources/dashboard', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, dashboard: await service.dashboard() };
  });

  fastify.get('/pollution-sources.geojson', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return reply.header('Content-Type', 'application/json').send(await service.geoJson(request.query || {}));
  });

  fastify.get('/pollution-sources', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, sources: await service.listSources(request.query || {}) };
  });

  fastify.get('/pollution-sources/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    const source = await service.getSource(request.params.id);
    if (!source) return reply.status(404).send({ success: false, message: 'Pollution source not found.' });
    return { success: true, source };
  });

  fastify.post('/pollution-sources', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'create')) return;
    const source = await service.createSource(request.body || {}, currentUser(request));
    return reply.status(201).send({ success: true, message: 'Pollution source created successfully.', source });
  });

  fastify.put('/pollution-sources/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const source = await service.updateSource(request.params.id, request.body || {}, currentUser(request));
    if (!source) return reply.status(404).send({ success: false, message: 'Pollution source not found.' });
    return { success: true, message: 'Pollution source updated successfully.', source };
  });

  fastify.delete('/pollution-sources/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'delete')) return;
    const closed = await service.deleteSource(request.params.id, currentUser(request));
    if (!closed) return reply.status(404).send({ success: false, message: 'Pollution source not found.' });
    return { success: true, message: 'Pollution source closed successfully.' };
  });

  fastify.get('/pollution-sources/:id/monitoring', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, monitoring: await service.listMonitoring(request.params.id) };
  });

  fastify.post('/pollution-sources/:id/monitoring', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'create')) return;
    const source = await service.createMonitoring(request.params.id, request.body || {}, currentUser(request));
    return reply.status(201).send({ success: true, message: 'Monitoring record created successfully.', source });
  });

  fastify.get('/pollution-sources/:id/enforcement', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, enforcement: await service.listEnforcement(request.params.id) };
  });

  fastify.post('/pollution-sources/:id/enforcement', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'create')) return;
    const notice = await service.createEnforcement(request.params.id, request.body || {}, currentUser(request));
    return reply.status(201).send({ success: true, message: 'Enforcement notice created successfully.', notice });
  });

  fastify.get('/pollution-sources/:id/linkages', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, linkages: await service.getLinkages(request.params.id) };
  });

  fastify.get('/pollution-sources/:id/suggested-linkages', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'view')) return;
    return { success: true, suggestions: await service.suggestedLinkages(request.params.id, request.query || {}) };
  });

  fastify.post('/pollution-sources/:id/linkages/community-issues', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const issueId = request.body?.community_issue_id || request.body?.issue_id;
    if (!issueId) return reply.status(400).send({ success: false, message: 'community_issue_id is required.' });
    return reply.status(201).send({ success: true, linkage: await service.linkCommunityIssue(request.params.id, issueId, note(request), currentUser(request)) });
  });

  fastify.delete('/pollution-sources/:id/linkages/community-issues/:issueId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const removed = await service.unlinkCommunityIssue(request.params.id, request.params.issueId);
    if (!removed) return reply.status(404).send({ success: false, message: 'Community complaint linkage not found.' });
    return { success: true };
  });

  fastify.post('/pollution-sources/:id/linkages/water-quality', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const recordId = request.body?.water_quality_record_id || request.body?.test_id;
    if (!recordId) return reply.status(400).send({ success: false, message: 'water_quality_record_id is required.' });
    return reply.status(201).send({ success: true, linkage: await service.linkWaterQuality(request.params.id, recordId, note(request), currentUser(request)) });
  });

  fastify.delete('/pollution-sources/:id/linkages/water-quality/:recordId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const removed = await service.unlinkWaterQuality(request.params.id, request.params.recordId);
    if (!removed) return reply.status(404).send({ success: false, message: 'Water quality linkage not found.' });
    return { success: true };
  });

  fastify.post('/pollution-sources/:id/linkages/interventions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const interventionId = request.body?.intervention_id;
    if (!interventionId) return reply.status(400).send({ success: false, message: 'intervention_id is required.' });
    return reply.status(201).send({ success: true, linkage: await service.linkIntervention(request.params.id, interventionId, note(request), currentUser(request)) });
  });

  fastify.delete('/pollution-sources/:id/linkages/interventions/:interventionId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    const removed = await service.unlinkIntervention(request.params.id, request.params.interventionId);
    if (!removed) return reply.status(404).send({ success: false, message: 'Intervention linkage not found.' });
    return { success: true };
  });
}

module.exports = pollutionSourceRoutes;
