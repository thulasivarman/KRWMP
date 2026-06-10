const pool = require('../../config/database');
const service = require('../services/vwmc.service');

function getUser(request) {
  return String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'system').trim();
}

function getRole(request) {
  return String(request.headers['x-krwmp-role'] || request.headers['x-role'] || '').trim().toLowerCase();
}

function canManage(request) {
  const role = getRole(request);
  return role === 'admin' || role === 'data_collectors' || role === 'data_collector';
}

function requireManage(request, reply) {
  if (!canManage(request)) {
    reply.status(403).send({ success: false, message: 'Only admin and data_collectors can manage VWMC records.' });
    return false;
  }
  return true;
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
  fastify.get('/vwmc/committees.geojson', async () => getVwmcGeoJson());

  fastify.get('/vwmc/committees', async () => {
    const committees = await service.listCommittees();
    return { success: true, committees };
  });

  fastify.get('/vwmc/committees/:id', async (request, reply) => {
    const committee = await service.getCommittee(request.params.id);
    if (!committee) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, committee };
  });

  fastify.post('/vwmc/committees', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const committee = await service.createCommittee(request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, committee });
  });

  fastify.put('/vwmc/committees/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const committee = await service.updateCommittee(request.params.id, request.body || {}, getUser(request));
    if (!committee) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, committee };
  });

  fastify.delete('/vwmc/committees/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const deleted = await service.deleteCommittee(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'VWMC not found' });
    return { success: true, deleted: request.params.id };
  });

  fastify.post('/vwmc/committees/:id/members', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const member = await service.createMember(request.params.id, request.body || {}, getUser(request));
    return reply.status(201).send({ success: true, member });
  });

  fastify.put('/vwmc/members/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const member = await service.updateMember(request.params.id, request.body || {}, getUser(request));
    if (!member) return reply.status(404).send({ success: false, message: 'Member not found' });
    return { success: true, member };
  });

  fastify.delete('/vwmc/members/:id', async (request, reply) => {
    if (!requireManage(request, reply)) return;
    const deleted = await service.deleteMember(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Member not found' });
    return { success: true, deleted: request.params.id };
  });
}

module.exports = vwmcRoutes;