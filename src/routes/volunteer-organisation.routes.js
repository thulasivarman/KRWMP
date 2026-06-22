const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const service = require('../services/volunteer-organisation.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/volunteer-organisations');
const PUBLIC_UPLOAD_PATH = '/uploads/volunteer-organisations';
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

function getUser(request) { return getRequestUser(request) || 'system'; }
function sanitizeFileName(value = 'supporting-document') { return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'supporting-document'; }

async function parseVolunteerPayload(request) {
  if (!request.isMultipart || !request.isMultipart()) return request.body || {};
  const payload = {};
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  for await (const part of request.parts()) {
    if (part.type !== 'file') { payload[part.fieldname] = part.value; continue; }
    if (!part.filename) continue;
    if (part.fieldname !== 'supporting_document') { part.file.resume(); continue; }
    if (!ALLOWED_DOCUMENT_TYPES.has(part.mimetype)) {
      part.file.resume();
      throw new Error('Unsupported supporting document type. Upload PDF, image, DOC/DOCX or XLS/XLSX only.');
    }
    const safeName = sanitizeFileName(part.filename);
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const destination = path.join(UPLOAD_DIR, uniqueName);
    await pipeline(part.file, fs.createWriteStream(destination));
    payload.supporting_document_url = `${PUBLIC_UPLOAD_PATH}/${uniqueName}`;
    payload.supporting_document_name = safeName;
    payload.supporting_document_mime_type = part.mimetype;
  }
  return payload;
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
      const payload = await parseVolunteerPayload(request);
      const organisation = await service.createOrganisation(payload, getUser(request));
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

  fastify.put('/volunteer-organisations/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'update')) return;
    try {
      const payload = await parseVolunteerPayload(request);
      const organisation = await service.updateOrganisation(request.params.id, payload, getUser(request));
      if (!organisation) return reply.status(404).send({ success: false, message: 'Volunteer organisation not found.' });
      return { success: true, organisation };
    } catch (error) {
      const duplicate = String(error.message || '').includes('duplicate key') || error.code === '23505';
      return reply.status(duplicate ? 409 : 400).send({ success: false, message: duplicate ? 'Organisation name or registration/code already exists.' : error.message });
    }
  });

  fastify.delete('/volunteer-organisations/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'delete')) return;
    const deleted = await service.deleteOrganisation(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Volunteer organisation not found.' });
    return { success: true, deleted: request.params.id };
  });

  fastify.get('/volunteer-organisations/:id/members', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'view')) return;
    return { success: true, members: await service.listMembers(request.params.id) };
  });

  fastify.post('/volunteer-organisations/:id/members', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'update')) return;
    const member = await service.addMember(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, member });
  });

  fastify.delete('/volunteer-organisations/:id/members/:memberId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'update')) return;
    const removed = await service.removeMember(request.params.id, request.params.memberId, getUser(request));
    if (!removed) return reply.status(404).send({ success: false, message: 'Member link not found.' });
    return { success: true, deleted: request.params.memberId };
  });
}

module.exports = volunteerOrganisationRoutes;
