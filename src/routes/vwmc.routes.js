const pool = require('../../config/database');
const service = require('../services/vwmc.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');

function getUser(request) {
  return getRequestUser(request) || 'system';
}

async function getVwmcGeoJson() {
  const result = await pool.query(`
    SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(feature),'[]'::jsonb)) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type','Feature',
        'id', c.id,
        'geometry', ST_AsGeoJSON(c.geom)::jsonb,
        'properties', jsonb_build_object(
          'id', c.id,
          'committee_code', c.committee_code,
          'committee_name', c.committee_name,
          'village_name', c.village_name,
          'dsd_name', c.dsd_name,
          'gnd_name', c.gnd_name,
          'address', c.address,
          'status', c.status,
          'member_count', (SELECT COUNT(*) FROM public.vwmc_members m WHERE m.committee_id = c.id AND m.active = true),
          'created_by', c.created_by,
          'created_at', c.created_at,
          'updated_by', c.updated_by,
          'updated_at', c.updated_at
        )
      ) AS feature
      FROM public.vwmc_committees c
      WHERE c.geom IS NOT NULL
    ) x;
  `);
  return result.rows[0].geojson;
}

async function vwmcRoutes(fastify) {
  fastify.get('/vwmc/lookups/dsds', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_view', 'view')) return;
    const result = await pool.query(`SELECT DISTINCT dsd_n AS dsd_name FROM public.dsd_boundary WHERE dsd_n IS NOT NULL AND trim(dsd_n) <> '' ORDER BY dsd_n;`);
    return { success: true, dsds: result.rows };
  });

  fastify.get('/vwmc/lookups/gnds', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_view', 'view')) return;
    const dsdName = request.query?.dsd_name || null;
    const result = await pool.query(`
      SELECT DISTINCT g.gnd_name
      FROM public.gnd_boundary AS g
      LEFT JOIN public.dsd_boundary AS d ON d.dsd_n = $1::text AND g.geom IS NOT NULL AND d.geom IS NOT NULL AND ST_Intersects(g.geom, d.geom)
      WHERE g.gnd_name IS NOT NULL AND trim(g.gnd_name) <> '' AND ($1::text IS NULL OR d.id IS NOT NULL)
      ORDER BY g.gnd_name;
    `, [dsdName]);
    return { success: true, gnds: result.rows };
  });

  fastify.get('/vwmc/committees.geojson', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'map_view', 'view')) return;
    return getVwmcGeoJson();
  });

  fastify.get('/vwmc/committees', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_view', 'view')) return;
    const committees = await service.listCommittees();
    return { success: true, committees };
  });

  fastify.get('/vwmc/committees/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_view', 'view')) return;
    const committee = await service.getCommittee(request.params.id);
    if (!committee) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, committee };
  });

  fastify.post('/vwmc/committees', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_management', 'create')) return;
    const committee = await service.createCommittee(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, committee });
  });

  fastify.put('/vwmc/committees/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_management', 'update')) return;
    const committee = await service.updateCommittee(request.params.id, request.body || {}, getUser(request));
    if (!committee) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, committee };
  });

  fastify.delete('/vwmc/committees/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_management', 'delete')) return;
    const deleted = await service.deleteCommittee(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, deleted: request.params.id };
  });

  fastify.post('/vwmc/committees/:id/members', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_management', 'create')) return;
    const member = await service.createMember(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, member });
  });

  fastify.put('/vwmc/members/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_management', 'update')) return;
    const member = await service.updateMember(request.params.id, request.body || {}, getUser(request));
    if (!member) return reply.status(404).send({ success: false, message: 'Member not found' });
    return { success: true, member };
  });

  fastify.delete('/vwmc/members/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vwmc_management', 'delete')) return;
    const deleted = await service.deleteMember(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Member not found' });
    return { success: true, deleted: request.params.id };
  });
}

module.exports = vwmcRoutes;
