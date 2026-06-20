const service = require('../services/community-issue-interventions.service');
const audit = require('../services/audit-log.service');
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

  fastify.get('/community-issue-interventions/nearby-unlinked', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'view')) return;
    try {
      const reports = await service.nearbyUnlinkedReports(request.query || {});
      return { success: true, reports };
    } catch (error) {
      return reply.status(error.statusCode || 400).send({ success: false, message: error.message });
    }
  });

  fastify.post('/community-issue-interventions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'create')) return;
    const body = request.body || {};
    const mapping = await service.createMapping(body, getUser(request));
    await audit.logInterventionAssignment({
      request,
      summary: 'Intervention assigned to community issue',
      details: {
        mapping_id: mapping.id,
        report_id: mapping.report_id || body.report_id || body.complaint_id || body.community_issue_id,
        intervention_id: mapping.intervention_id || body.intervention_id,
        link_status: mapping.link_status,
      },
    });
    return reply.status(201).send({ success: true, message: 'Community issue linked to intervention successfully.', mapping });
  });

  fastify.post('/interventions/registry/:interventionId/community-reports', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'create')) return;
    const body = request.body || {};
    const mappings = await service.createMappingsForIntervention(
      request.params.interventionId,
      body.report_ids || body.reportIds || [],
      getUser(request),
      body.link_note || 'Linked from Intervention Registry location workflow'
    );
    await audit.logInterventionAssignment({
      request,
      summary: 'Community issues linked to intervention from registry',
      details: {
        intervention_id: request.params.interventionId,
        report_ids: mappings.map(mapping => mapping.report_id),
        mapping_count: mappings.length,
      },
    });
    return reply.status(201).send({ success: true, message: 'Community issues linked to intervention successfully.', mappings });
  });

  fastify.patch('/community-issue-interventions/:mappingId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'update')) return;
    const mapping = await service.updateMapping(request.params.mappingId, request.body || {}, getUser(request));
    if (!mapping) return reply.status(404).send({ success: false, message: 'Mapping not found.' });
    await audit.logInterventionAssignment({
      request,
      summary: 'Community issue intervention assignment updated',
      details: {
        mapping_id: mapping.id,
        report_id: mapping.report_id,
        intervention_id: mapping.intervention_id,
        link_status: mapping.link_status,
      },
    });
    return { success: true, message: 'Community issue intervention mapping updated successfully.', mapping };
  });

  fastify.delete('/community-issue-interventions/:mappingId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'community_issue_intervention_mapping', 'delete')) return;
    const deleted = await service.deleteMapping(request.params.mappingId);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Mapping not found.' });
    await audit.logDelete({
      request,
      module_name: 'community_issues',
      summary: 'Community issue intervention link deleted',
      details: { mapping_id: request.params.mappingId },
    });
    return { success: true, message: 'Community issue intervention link removed successfully.' };
  });
}

module.exports = communityIssueInterventionRoutes;
