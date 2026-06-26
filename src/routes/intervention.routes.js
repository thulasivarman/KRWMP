const pool = require('../../config/database');
const service = require('../services/intervention.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');

function getUser(request) {
  return getRequestUser(request) || 'system';
}

function cleanText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeEmail(value) {
  const email = cleanText(value);
  return email ? email.toLowerCase() : null;
}

function normalizePhone(value) {
  const phone = cleanText(value);
  return phone;
}

function parseCoordinate(value, min, max, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max) throw new Error(`${fieldName} must be a valid number between ${min} and ${max}.`);
  return numberValue;
}

function validateInstitutionPayload(body = {}, partial = false) {
  const institutionName = cleanText(body.institution_name);
  const institutionType = cleanText(body.institution_type);
  const contactPerson = cleanText(body.contact_person);
  const contactPhone = normalizePhone(body.contact_phone);
  const contactEmail = normalizeEmail(body.contact_email);
  const address = cleanText(body.address);
  const dsdName = cleanText(body.dsd_name);
  const gndName = cleanText(body.gnd_name);
  const latitude = parseCoordinate(body.latitude, -90, 90, 'Latitude');
  const longitude = parseCoordinate(body.longitude, -180, 180, 'Longitude');
  if (!partial && !institutionName) throw new Error('Institution name is required.');
  if (institutionName && institutionName.length < 3) throw new Error('Institution name must contain at least 3 characters.');
  if (institutionName && institutionName.length > 200) throw new Error('Institution name must not exceed 200 characters.');
  if (institutionType && institutionType.length > 100) throw new Error('Institution type must not exceed 100 characters.');
  if (contactPerson && contactPerson.length > 150) throw new Error('Contact person must not exceed 150 characters.');
  if (contactPhone && !/^[0-9+()\-\s]{7,30}$/.test(contactPhone)) throw new Error('Contact phone format is invalid.');
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Contact email format is invalid.');
  if ((latitude === null) !== (longitude === null)) throw new Error('Both latitude and longitude are required when setting institution location.');
  return { institution_name: institutionName, institution_type: institutionType, contact_person: contactPerson, contact_phone: contactPhone, contact_email: contactEmail, address, dsd_name: dsdName, gnd_name: gndName, latitude, longitude, active: body.active === undefined ? true : Boolean(body.active) };
}

async function interventionRoutes(fastify) {
  fastify.get('/interventions/lookups/dsds', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const result = await pool.query(`SELECT DISTINCT d.dsd_n AS dsd_name FROM public.dsd_boundary AS d WHERE d.dsd_n IS NOT NULL AND trim(d.dsd_n) <> '' ORDER BY d.dsd_n;`);
    return { success: true, dsds: result.rows };
  });

  fastify.get('/interventions/lookups/gnds', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const dsdName = request.query?.dsd_name || null;
    const result = await pool.query(`
      SELECT DISTINCT g.gnd_name FROM public.gnd_boundary AS g
      LEFT JOIN public.dsd_boundary AS d ON d.dsd_n = $1::text AND g.geom IS NOT NULL AND d.geom IS NOT NULL AND ST_Intersects(g.geom, d.geom)
      WHERE g.gnd_name IS NOT NULL AND trim(g.gnd_name) <> '' AND ($1::text IS NULL OR d.id IS NOT NULL)
      ORDER BY g.gnd_name;
    `, [dsdName]);
    return { success: true, gnds: result.rows };
  });

  fastify.get('/interventions/lookups/pollution-sources', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const sources = await service.searchPollutionSources(request.query || {});
    return { success: true, sources };
  });

  fastify.get('/interventions/lookups/institutions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const includeInactive = String(request.query?.include_inactive || '').toLowerCase() === 'true';
    const result = await pool.query(`
      SELECT id, institution_name, institution_type, contact_person, contact_phone, contact_email,
             address, dsd_name, gnd_name, latitude, longitude, active, created_by, created_at, updated_by, updated_at
      FROM public.intervention_institutions
      WHERE ($1::boolean = true OR active = true)
      ORDER BY active DESC, institution_name;
    `, [includeInactive]);
    return { success: true, institutions: result.rows };
  });

  fastify.post('/interventions/lookups/institutions', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'create')) return;
    try {
      const body = validateInstitutionPayload(request.body || {});
      const result = await pool.query(`
        INSERT INTO public.intervention_institutions
          (institution_name, institution_type, contact_person, contact_phone, contact_email, address, dsd_name, gnd_name, latitude, longitude, geom, active, created_by, updated_by)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $9::double precision IS NOT NULL AND $10::double precision IS NOT NULL THEN ST_SetSRID(ST_MakePoint($10,$9),4326) ELSE NULL END,$11,$12,$12)
        ON CONFLICT (institution_name) DO UPDATE SET
          institution_type = EXCLUDED.institution_type, contact_person = EXCLUDED.contact_person, contact_phone = EXCLUDED.contact_phone,
          contact_email = EXCLUDED.contact_email, address = EXCLUDED.address, dsd_name = EXCLUDED.dsd_name, gnd_name = EXCLUDED.gnd_name,
          latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, geom = EXCLUDED.geom, active = EXCLUDED.active,
          updated_by = EXCLUDED.updated_by, updated_at = now()
        RETURNING *;
      `, [body.institution_name, body.institution_type, body.contact_person, body.contact_phone, body.contact_email, body.address, body.dsd_name, body.gnd_name, body.latitude, body.longitude, body.active, getUser(request)]);
      return reply.status(201).send({ success: true, institution: result.rows[0] });
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.put('/interventions/lookups/institutions/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'update')) return;
    try {
      const body = validateInstitutionPayload(request.body || {}, true);
      const result = await pool.query(`
        UPDATE public.intervention_institutions SET institution_name = COALESCE($2, institution_name), institution_type = $3, contact_person = $4,
          contact_phone = $5, contact_email = $6, address = $7, dsd_name = $8, gnd_name = $9, latitude = $10, longitude = $11,
          geom = CASE WHEN $10::double precision IS NOT NULL AND $11::double precision IS NOT NULL THEN ST_SetSRID(ST_MakePoint($11,$10),4326) ELSE NULL END,
          active = $12, updated_by = $13, updated_at = now()
        WHERE id = $1 RETURNING *;
      `, [request.params.id, body.institution_name, body.institution_type, body.contact_person, body.contact_phone, body.contact_email, body.address, body.dsd_name, body.gnd_name, body.latitude, body.longitude, body.active, getUser(request)]);
      if (!result.rows[0]) return reply.status(404).send({ success: false, message: 'Institution not found.' });
      return { success: true, institution: result.rows[0] };
    } catch (error) {
      return reply.status(400).send({ success: false, message: error.message });
    }
  });

  fastify.delete('/interventions/lookups/institutions/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'institution_management', 'delete')) return;
    const result = await pool.query(`UPDATE public.intervention_institutions SET active = false, updated_by = $2, updated_at = now() WHERE id = $1 RETURNING id;`, [request.params.id, getUser(request)]);
    if (!result.rows[0]) return reply.status(404).send({ success: false, message: 'Institution not found.' });
    return { success: true, deleted: request.params.id };
  });

  fastify.get('/interventions/library', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_library_manage', 'view')) return;
    const library = await service.listLibrary();
    return { success: true, library };
  });

  fastify.get('/interventions/library/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_library_manage', 'view')) return;
    const item = await service.getLibrary(request.params.id);
    if (!item) return reply.status(404).send({ success: false, message: 'Intervention library item not found' });
    return { success: true, item };
  });

  fastify.post('/interventions/library', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_library_manage', 'create')) return;
    const item = await service.createLibrary(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, item });
  });

  fastify.put('/interventions/library/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_library_manage', 'update')) return;
    const item = await service.updateLibrary(request.params.id, request.body || {}, getUser(request));
    if (!item) return reply.status(404).send({ success: false, message: 'Intervention library item not found' });
    return { success: true, item };
  });

  fastify.delete('/interventions/library/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_library_manage', 'delete')) return;
    const deleted = await service.deleteLibrary(request.params.id, getUser(request));
    if (!deleted) return reply.status(404).send({ success: false, message: 'Intervention library item not found' });
    return { success: true, deleted: request.params.id };
  });

  fastify.get('/interventions/registry', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const interventions = await service.listRegistry();
    return { success: true, interventions };
  });

  fastify.get('/interventions/registry/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const intervention = await service.getRegistry(request.params.id);
    if (!intervention) return reply.status(404).send({ success: false, message: 'Intervention not found' });
    return { success: true, intervention };
  });

  fastify.post('/interventions/registry', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_manage', 'create')) return;
    const intervention = await service.createRegistry(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, intervention });
  });

  fastify.put('/interventions/registry/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_manage', 'update')) return;
    const intervention = await service.updateRegistry(request.params.id, request.body || {}, getUser(request));
    if (!intervention) return reply.status(404).send({ success: false, message: 'Intervention not found' });
    return { success: true, intervention };
  });

  fastify.delete('/interventions/registry/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_manage', 'delete')) return;
    const deleted = await service.deleteRegistry(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Intervention not found' });
    return { success: true, deleted: request.params.id };
  });

  fastify.get('/interventions/registry/:id/pollution-sources', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const sources = await service.listLinkedPollutionSources(request.params.id);
    return { success: true, sources };
  });

  fastify.post('/interventions/registry/:id/pollution-sources', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_manage', 'update')) return;
    const sourceId = request.body?.pollution_source_id || request.body?.source_id;
    if (!sourceId) return reply.status(400).send({ success: false, message: 'pollution_source_id is required.' });
    const linkage = await service.linkPollutionSource(request.params.id, sourceId, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, linkage });
  });

  fastify.delete('/interventions/registry/:id/pollution-sources/:sourceId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_manage', 'update')) return;
    const removed = await service.unlinkPollutionSource(request.params.id, request.params.sourceId);
    if (!removed) return reply.status(404).send({ success: false, message: 'Pollution source linkage not found.' });
    return { success: true };
  });

  fastify.post('/interventions/registry/:id/timeline', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_progress_update', 'create')) return;
    try {
      const action = await service.createTimeline(request.params.id, request.body || {}, getUser(request));
      return reply.status(201).send({ success: true, action });
    } catch (error) {
      return reply.status(error.statusCode || 400).send({ success: false, message: error.message });
    }
  });

  fastify.get('/interventions/registry/:id/timeline', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_view', 'view')) return;
    const actions = await service.listTimeline(request.params.id);
    return { success: true, actions };
  });

  fastify.put('/interventions/registry/:id/timeline/:actionId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_progress_update', 'update')) return;
    try {
      const action = await service.updateTimeline(request.params.id, request.params.actionId, request.body || {}, getUser(request));
      if (!action) return reply.status(404).send({ success: false, message: 'Action not found' });
      return { success: true, action };
    } catch (error) {
      return reply.status(error.statusCode || 400).send({ success: false, message: error.message });
    }
  });

  fastify.delete('/interventions/registry/:id/timeline/:actionId', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_progress_update', 'delete')) return;
    const deleted = await service.deleteTimeline(request.params.id, request.params.actionId, getUser(request));
    if (!deleted) return reply.status(404).send({ success: false, message: 'Action not found' });
    return { success: true, deleted: request.params.actionId };
  });

  fastify.post('/interventions/registry/:id/officers', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'intervention_registry_manage', 'create')) return;
    const officer = await service.createOfficer(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, officer });
  });

  fastify.get('/interventions/registry.geojson', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'map_view', 'view')) return;
    return service.getGeoJson();
  });
}

module.exports = interventionRoutes;
