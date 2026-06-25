const reviewService = require('../services/review.service');
const audit = require('../services/audit-log.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');

function getAdminUser(request) {
  return getRequestUser(request) || 'admin';
}

async function reviewRoutes(fastify) {
  fastify.get('/review-queue', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'data_review_center', 'view')) return;
    const items = await reviewService.listReviewItems({
      status: request.query?.status || null,
      moduleName: request.query?.module_name || null,
      recordKind: request.query?.record_kind || null,
      limit: request.query?.limit || 100,
    });
    return { success: true, items };
  });

  fastify.get('/review-queue/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'data_review_center', 'view')) return;
    const item = await reviewService.getReviewItem(request.params.id);
    if (!item) return reply.status(404).send({ success: false, message: 'Review item not found' });
    const history = await reviewService.getReviewHistory(request.params.id);
    return { success: true, item, history };
  });

  fastify.post('/review-queue/:id/decision', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'data_review_center', 'update')) return;
    const body = request.body || {};
    const reviewer = getAdminUser(request);
    const item = await reviewService.decideReviewItem(request.params.id, {
      decision: body.decision,
      reviewer,
      comment: body.comment || body.review_comment || null,
      payloadPatch: body.payload_patch || null,
    });
    if (!item) return reply.status(404).send({ success: false, message: 'Review item not found' });

    await audit.logStatusChange({
      request,
      module_name: 'data_review_center',
      summary: `Review item marked as ${body.decision}`,
      details: {
        review_queue_id: request.params.id,
        record_kind: item.record_kind,
        record_id: item.record_id,
        decision: body.decision,
      },
    });

    if (body.decision === 'approved') {
      await audit.logApprove({ request, module_name: 'data_review_center', summary: 'Review item approved', details: { review_queue_id: request.params.id } });
    } else if (body.decision === 'rejected') {
      await audit.logReject({ request, module_name: 'data_review_center', summary: 'Review item rejected', details: { review_queue_id: request.params.id } });
    }

    return { success: true, item };
  });
}

module.exports = reviewRoutes;
