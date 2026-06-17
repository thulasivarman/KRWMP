const service = require('../services/community-issue-interventions.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');

function getUser(request) {
  return getRequestUser(request) || 'system';
}

async function communityIssueInterventionRoutes(fastify) {
  fastify.get('/community-reports/:reportId/interventions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'view')) return;
    const interventions = await service.listInterventionsForComplaint(request.params.reportId);
    return { success: true, interventions };
  });

  fastify.get('/interventions/registry/:interventionId/community-reports', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'view')) return;
    const reports = await service.listComplaintsForIntervention(request.params.interventionId);
    return { success: true, reports };
  });

  fastify.get('/community-issue-interventions/search/interventions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'create')) return;
    const interventions = await service.searchInterventions(request.query || {});
    return { success: true, interventions };
  });

  fastify.get('/community-issue-interventions/search/reports', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'create')) return;
    const reports = await service.searchReports(request.query || {});
    return { success: true, reports };
  });

  fastify.post('/community-issue-interventions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'create')) return;
    const mapping = await service.createMapping(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, message: 'Community issue linked to intervention successfully.', mapping });
  });

  fastify.patch('/community-issue-interventions/:mappingId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'update')) return;
    const mapping = await service.updateMapping(request.params.mappingId, request.body || {}, getUser(request));
    if (!mapping) return reply.status(404).send({ success: false, message: 'Mapping not found.' });
    return { success: true, message: 'Community issue intervention mapping updated successfully.', mapping };
  });

  fastify.delete('/community-issue-interventions/:mappingId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'delete')) return;
    const deleted = await service.deleteMapping(request.params.mappingId);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Mapping not found.' });
    return { success: true, message: 'Community issue intervention link removed successfully.' };
  });
}

module.exports = communityIssueInterventionRoutes;
