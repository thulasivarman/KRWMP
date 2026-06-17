const fileAttachmentService = require('../services/file-attachment.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');
const { assertImageUpload } = require('../utils/upload-validation');

const MODULE_POLICIES = {
  community_issues: { view: 'community_issues_review', create: 'community_issues_review', update: 'community_issues_review', delete: 'community_issues_review' },
  community_issue_review: { view: 'community_issues_review', create: 'community_issues_review', update: 'community_issues_review', delete: 'community_issues_review' },
  knowledge_resources: { view: 'knowledge_portal', create: 'knowledge_portal', update: 'knowledge_portal', delete: 'knowledge_portal' },
  vwmc: { view: 'vwmc_view', create: 'vwmc_management', update: 'vwmc_management', delete: 'vwmc_management' },
  volunteer_organisations: { view: 'volunteer_organisation_management', create: 'volunteer_organisation_management', update: 'volunteer_organisation_management', delete: 'volunteer_organisation_management' },
  water_quality: { view: 'water_quality_records', create: 'water_quality_records', update: 'water_quality_records', delete: 'water_quality_records' },
  pollution_sources: { view: 'pollution_source_management', create: 'pollution_source_management', update: 'pollution_source_management', delete: 'pollution_source_management' },
  intervention_registry: { view: 'intervention_registry_view', create: 'intervention_registry_manage', update: 'intervention_registry_manage', delete: 'intervention_registry_manage' },
};

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function uploadActionFor(recordId) {
  return cleanText(recordId) ? 'update' : 'create';
}

function modulePolicy(moduleKey, reply) {
  const key = cleanText(moduleKey);
  const policy = MODULE_POLICIES[key];
  if (!key || !policy) {
    reply.status(400).send({ success: false, message: 'Unsupported attachment module.' });
    return null;
  }
  return { key, policy };
}

async function requireModulePrivilege(request, reply, moduleKey, action) {
  const resolved = modulePolicy(moduleKey, reply);
  if (!resolved) return false;
  return requirePrivilegeInline(request, reply, resolved.policy[action], action);
}

async function requireFilePrivilege(request, reply, fileId, action) {
  const attachment = await fileAttachmentService.getAttachment(fileId);
  if (!attachment) {
    reply.status(404).send({ success: false, message: 'Attachment not found.' });
    return null;
  }
  const allowed = await requireModulePrivilege(request, reply, attachment.module_key, action);
  if (!allowed) return null;
  return attachment;
}

function currentUser(request) {
  return getRequestUser(request) || 'system';
}

function isPublicCommunityPhotoPayload(body = {}) {
  return cleanText(body.module_key) === 'community_issues'
    && cleanText(body.attachment_role || body.attachmentRole || body.role) === 'report_photo';
}

function assertPublicCommunityPhoto(body = {}) {
  if (!isPublicCommunityPhotoPayload(body)) return false;
  assertImageUpload({
    filename: body.original_filename,
    mimetype: body.mime_type,
    size: body.file_size_bytes,
  });
  return true;
}

function publicCommunityPayload(body = {}) {
  return {
    ...body,
    module_key: 'community_issues',
    attachment_role: 'report_photo',
    visibility: 'private',
  };
}

async function fileAttachmentRoutes(fastify) {
  fastify.post('/files/presign-upload', async (request, reply) => {
    const body = request.body || {};
    if (assertPublicCommunityPhoto(body)) {
      const result = await fileAttachmentService.createPresignedUploadUrl(publicCommunityPayload(body), 'public');
      return reply.status(201).send({ success: true, ...result });
    }
    if (!await requireModulePrivilege(request, reply, body.module_key, uploadActionFor(body.record_id))) return;
    const result = await fileAttachmentService.createPresignedUploadUrl(body, currentUser(request));
    return reply.status(201).send({ success: true, ...result });
  });

  fastify.post('/files/confirm-upload', async (request, reply) => {
    const body = request.body || {};
    const fileId = cleanText(body.file_id || body.fileId || body.id);
    if (!fileId) return reply.status(400).send({ success: false, message: 'file_id is required.' });

    const existing = await fileAttachmentService.getAttachment(fileId);
    if (!existing) return reply.status(404).send({ success: false, message: 'Attachment not found.' });

    if (isPublicCommunityPhotoPayload(existing)) {
      const attachment = await fileAttachmentService.completeUpload(fileId, publicCommunityPayload(body), 'public');
      if (!attachment) return reply.status(404).send({ success: false, message: 'Attachment not found.' });
      return { success: true, attachment };
    }

    const action = uploadActionFor(body.record_id || existing.record_id);
    if (!await requireModulePrivilege(request, reply, existing.module_key, action)) return;

    const attachment = await fileAttachmentService.completeUpload(fileId, body, currentUser(request));
    if (!attachment) return reply.status(404).send({ success: false, message: 'Attachment not found.' });
    return { success: true, attachment };
  });

  fastify.get('/files/:module/:recordId', async (request, reply) => {
    const { module, recordId } = request.params || {};
    if (!await requireModulePrivilege(request, reply, module, 'view')) return;
    const files = await fileAttachmentService.listAttachments({
      module_key: module,
      record_id: recordId,
      attachment_role: request.query?.attachment_role,
      status: request.query?.status || 'attached',
      limit: request.query?.limit,
    });
    return { success: true, files };
  });

  fastify.get('/files/:fileId/download', async (request, reply) => {
    const { fileId } = request.params || {};
    await requireFilePrivilege(request, reply, fileId, 'view');
    if (reply.sent) return;
    const result = await fileAttachmentService.createPresignedDownloadUrl(fileId, {
      expires_in: request.query?.expires_in,
      download: request.query?.download !== 'false',
    });
    if (!result) return reply.status(404).send({ success: false, message: 'Attachment not found.' });
    return { success: true, ...result };
  });

  fastify.delete('/files/:fileId', async (request, reply) => {
    const { fileId } = request.params || {};
    await requireFilePrivilege(request, reply, fileId, 'delete');
    if (reply.sent) return;
    const attachment = await fileAttachmentService.softDeleteAttachment(fileId, currentUser(request));
    if (!attachment) return reply.status(404).send({ success: false, message: 'Attachment not found.' });
    return { success: true, message: 'Attachment deleted successfully.', attachment };
  });
}

module.exports = fileAttachmentRoutes;
