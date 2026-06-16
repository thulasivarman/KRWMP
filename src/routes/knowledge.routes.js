const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const pool = require('../../config/database');
const service = require('../services/knowledge.service');
const { requirePrivilegeInline, getRequestUser, isMasterAdmin } = require('../middleware/privilege.middleware');

const PRIVILEGE_KEY = 'knowledge_portal';
const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/knowledge');
const PUBLIC_UPLOAD_PATH = '/uploads/knowledge';
const ALLOWED_RESOURCE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv'
]);

function currentUser(request) {
  return getRequestUser(request) || String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'system').trim();
}

function sanitizeFileName(value = 'knowledge-resource') {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'knowledge-resource';
}

async function isAdminIdentifier(identifier) {
  if (!identifier) return false;
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
  return !!result.rows[0]?.allowed;
}

async function requireAdminRequest(request, reply) {
  const identifier = getRequestUser(request);
  if (!identifier) {
    reply.status(401).send({ success: false, message: 'Authentication required' });
    return false;
  }
  if (!await isAdminIdentifier(identifier)) {
    reply.status(403).send({ success: false, message: 'Access denied. Only Admin users can update Knowledge Resource status.' });
    return false;
  }
  return true;
}

async function parseKnowledgePayload(request) {
  if (!request.isMultipart || !request.isMultipart()) return request.body || {};

  const payload = {};
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });

  for await (const part of request.parts()) {
    if (part.type !== 'file') {
      payload[part.fieldname] = part.value;
      continue;
    }

    if (!part.filename) continue;
    if (part.fieldname !== 'resource_file') {
      part.file.resume();
      continue;
    }

    if (!ALLOWED_RESOURCE_TYPES.has(part.mimetype)) {
      part.file.resume();
      throw new Error('Unsupported resource file type. Upload PDF, image, document, spreadsheet, presentation, TXT or CSV only.');
    }

    const safeName = sanitizeFileName(part.filename);
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    const destination = path.join(UPLOAD_DIR, uniqueName);
    await pipeline(part.file, fs.createWriteStream(destination));
    payload.file_url = `${PUBLIC_UPLOAD_PATH}/${uniqueName}`;
    payload.file_name = safeName;
    payload.file_mime_type = part.mimetype;
  }

  return payload;
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
    const publicOnly = request.query?.public === 'true';
    if (!publicOnly && !await requirePrivilegeInline(request, reply, 'map_view', 'view')) return;
    return reply.header('Content-Type', 'application/json').send(await service.geoJson(request.query || {}));
  });

  fastify.get('/knowledge/public', async (request) => {
    return { success: true, resources: await service.listContent(request.query || {}, { publicOnly: true }) };
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
    try {
      const payload = await parseKnowledgePayload(request);
      if (!await isAdminIdentifier(getRequestUser(request))) delete payload.status;
      const resource = await service.createContent(payload, currentUser(request));
      return reply.status(201).send({ success: true, message: 'Knowledge resource created successfully.', resource });
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.put('/knowledge/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'update')) return;
    try {
      const payload = await parseKnowledgePayload(request);
      if (payload.status && !await isAdminIdentifier(getRequestUser(request))) delete payload.status;
      const resource = await service.updateContent(request.params.id, payload, currentUser(request));
      if (!resource) return reply.status(404).send({ success: false, message: 'Knowledge resource not found.' });
      return { success: true, message: 'Knowledge resource updated successfully.', resource };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.patch('/knowledge/:id/status', async (request, reply) => {
    if (!await requireAdminRequest(request, reply)) return;
    const resource = await service.updateContentStatus(request.params.id, request.body?.status, currentUser(request), request.body?.review_remarks);
    if (!resource) return reply.status(404).send({ success: false, message: 'Knowledge resource not found.' });
    return { success: true, message: 'Knowledge resource status updated successfully.', resource };
  });

  fastify.delete('/knowledge/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, PRIVILEGE_KEY, 'delete')) return;
    const archived = await service.deleteContent(request.params.id, currentUser(request));
    if (!archived) return reply.status(404).send({ success: false, message: 'Knowledge resource not found.' });
    return { success: true, message: 'Knowledge resource deleted successfully.' };
  });
}

module.exports = knowledgeRoutes;
