const communityIssueService = require('../services/community-issues.service');
const waterQualityService = require('../services/water-quality.service');
const { getRequestUser, hasPrivilege } = require('../middleware/privilege.middleware');

function getMapRequestUser(request) {
  return getRequestUser(request) || process.env.KRWMP_PUBLIC_MAP_USER || 'thulasi';
}

async function requireMapView(request, reply) {
  const user = getMapRequestUser(request);
  const allowed = await hasPrivilege(user, 'map_view', 'view');
  if (!allowed) {
    reply.status(403).send({ success: false, message: 'Access denied. Required privilege: map_view:view' });
    return false;
  }
  return true;
}

async function gisMapDataRoutes(fastify) {
  fastify.get('/community-reports.geojson', async (request, reply) => {
    if (!await requireMapView(request, reply)) return;
    const geojson = await communityIssueService.getReportsGeoJson({ status: request.query?.status || null });
    return reply.header('Content-Type', 'application/json').send(geojson);
  });

  fastify.get('/water-quality/latest.geojson', async (request, reply) => {
    if (!await requireMapView(request, reply)) return;
    return reply.header('Content-Type', 'application/json').send(await waterQualityService.latestGeoJson());
  });
}

module.exports = gisMapDataRoutes;
