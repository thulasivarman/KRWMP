const pool = require('../../config/database');
const service = require('../services/intervention.service');

function getUser(request) {
  return String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'system').trim();
}

function getRole(request) {
  return String(request.headers['x-krwmp-role'] || request.headers['x-role'] || '').trim().toLowerCase();
}

function isAdmin(request) { return getRole(request) === 'admin'; }
function canOfficerManage(request) { const role = getRole(request); return role === 'admin' || role === 'officer' || role === 'officers'; }
function requireAdmin(request, reply) { if (!isAdmin(request)) { reply.status(403).send({ success: false, message: 'Only admin users can manage the Intervention Library.' }); return false; } return true; }
function requireOfficer(request, reply) { if (!canOfficerManage(request)) { reply.status(403).send({ success: false, message: 'Only admin and officer users can manage intervention registry records.' }); return false; } return true; }

async function interventionRoutes(fastify) {
  fastify.get('/interventions/lookups/dsds', async () => {
    const result = await pool.query(`
      SELECT DISTINCT d.dsd_n AS dsd_name
      FROM public.dsd_boundary AS d
      WHERE d.dsd_n IS NOT NULL AND trim(d.dsd_n) <> ''
      ORDER BY d.dsd_n;
    `);
    return { success: true, dsds: result.rows };
  });

  fastify.get('/interventions/lookups/gnds', async (request) => {
    const dsdName = request.query?.dsd_name || null;
    const result = await pool.query(`
      SELECT DISTINCT g.gnd_name
      FROM public.gnd_boundary AS g
      LEFT JOIN public.dsd_boundary AS d
        ON d.dsd_n = $1::text
       AND g.geom IS NOT NULL
       AND d.geom IS NOT NULL
       AND ST_Intersects(g.geom, d.geom)
      WHERE g.gnd_name IS NOT NULL
        AND trim(g.gnd_name) <> ''
        AND ($1::text IS NULL OR d.id IS NOT NULL)
      ORDER BY g.gnd_name;
    `, [dsdName]);
    return { success: true, gnds: result.rows };
  });

  fastify.get('/interventions/lookups/institutions', async () => {
    const result = await pool.query(`
      SELECT id, institution_name, institution_type, contact_person, contact_phone, contact_email, active
      FROM public.intervention_institutions
      WHERE active = true
      ORDER BY institution_name;
    `);
    return { success: true, institutions: result.rows };
  });

  fastify.post('/interventions/lookups/institutions', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = request.body || {};
    const result = await pool.query(`
      INSERT INTO public.intervention_institutions (institution_name, institution_type, contact_person, contact_phone, contact_email, active, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5,true,$6,$6)
      ON CONFLICT (institution_name) DO UPDATE SET institution_type = EXCLUDED.institution_type, contact_person = EXCLUDED.contact_person, contact_phone = EXCLUDED.contact_phone, contact_email = EXCLUDED.contact_email, active = true, updated_by = EXCLUDED.updated_by, updated_at = now()
      RETURNING *;
    `, [body.institution_name, body.institution_type || null, body.contact_person || null, body.contact_phone || null, body.contact_email || null, getUser(request)]);
    return reply.status(201).send({ success: true, institution: result.rows[0] });
  });

  fastify.get('/interventions/library', async () => {
    const library = await service.listLibrary();
    return { success: true, library };
  });

  fastify.post('/interventions/library', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const item = await service.createLibrary(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, item });
  });

  fastify.put('/interventions/library/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const item = await service.updateLibrary(request.params.id, request.body || {}, getUser(request));
    if (!item) return reply.status(404).send({ success: false, message: 'Intervention library item not found' });
    return { success: true, item };
  });

  fastify.get('/interventions/registry', async () => {
    const interventions = await service.listRegistry();
    return { success: true, interventions };
  });

  fastify.post('/interventions/registry', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const intervention = await service.createRegistry(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, intervention });
  });

  fastify.put('/interventions/registry/:id', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const intervention = await service.updateRegistry(request.params.id, request.body || {}, getUser(request));
    if (!intervention) return reply.status(404).send({ success: false, message: 'Intervention not found' });
    return { success: true, intervention };
  });

  fastify.delete('/interventions/registry/:id', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const deleted = await service.deleteRegistry(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Intervention not found' });
    return { success: true, deleted: request.params.id };
  });

  fastify.post('/interventions/registry/:id/timeline', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const action = await service.createTimeline(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, action });
  });

  fastify.post('/interventions/registry/:id/officers', async (request, reply) => {
    if (!requireOfficer(request, reply)) return;
    const officer = await service.createOfficer(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, officer });
  });

  fastify.get('/interventions/registry.geojson', async () => service.getGeoJson());
}

module.exports = interventionRoutes;