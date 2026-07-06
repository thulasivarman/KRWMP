const rasterLayerService = require('../services/raster-layer.service');
const { getRequestUser, hasPrivilege } = require('../middleware/privilege.middleware');

function getMapRequestUser(request) {
  return getRequestUser(request) || process.env.KRWMP_PUBLIC_MAP_USER || 'thulasi';
}

async function gisRasterLayerRoutes(fastify) {
  fastify.get('/raster-layers', async (request, reply) => {
    const user = getMapRequestUser(request);
    const allowed = await hasPrivilege(user, 'raster_layers', 'view') || await hasPrivilege(user, 'map_view', 'view');
    if (!allowed) return reply.status(403).send({ success: false, message: 'Access denied. Required privilege: raster_layers:view or map_view:view' });
    const layers = await rasterLayerService.listRasterLayers({ activeOnly: true });
    return { success: true, layers };
  });
}

module.exports = gisRasterLayerRoutes;
