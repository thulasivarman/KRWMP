const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const pool = require('../../config/database');
const service = require('../services/volunteer-organisation.service');
const { getRequestUser, isMasterAdmin } = require('../middleware/privilege.middleware');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/volunteer-organisations');
const PUBLIC_UPLOAD_PATH = '/uploads/volunteer-organisations';
const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

function getUser(request) {
  return String(request.headers['x-krwmp-user'] || getRequestUser(request) || 'system').trim();
}

async function requireAdminUserGroup(request, reply) {
  const identifier = getRequestUser(request);
  if (!identifier) {
    reply.status(401).send({ success: false, message: 'Authentication required' });
    return false;
  }
  if (isMasterAdmin(identifier)) return true;

  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      LEFT JOIN public.user_roles ur ON ur.user_id = u.id
      LEFT JOIN public.roles r ON r.id = COALESCE(ur.role_id, u.role_id)
      WHERE u.identifier = $1 AND LOWER(r.role_name) = 'admin'
    ) AS allowed;
  `, [identifier]);

  if (!result.rows[0]?.allowed) {
    reply.status(403).send({ success: false, message: 'Access denied. Only Admin user group can delete volunteer organisations.' });
    return false;
  }

  return true;
}

function sanitizeFileName(value = 'supporting-document') {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'supporting-document';
}

async function parseVolunteerPayload(request) {
  if (!request.isMultipart || !request.isMultipart()) return request.body || {};

  const payload = {};
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

  for await (const part of request.parts()) {
    if (part.type !== 'file') {
      payload[part.fieldname] = part.value;
      continue;
    }

    if (!part.filename) continue;
    if (part.fieldname !== 'supporting_document') {
      part.file.resume();
      continue;
    }

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

  fastify.delete('/volunteer-organisations/:id', async (request, reply) => {
    if (!await requireAdminUserGroup(request, reply)) return;
    const deleted = await service.deleteOrganisation(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Volunteer organisation not found.' });
    return { success: true, deleted: request.params.id };
  });

  fastify.get('/volunteer-organisations/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'volunteer_organisation_management', 'view')) return;
    const organisation = await service.getOrganisation(request.params.id);
    if (!organisation) return reply.status(404).send({ success: false, message: 'Record not found.' });
    return { success: true, organisation };
  });
}

module.exports = volunteerOrganisationRoutes;
