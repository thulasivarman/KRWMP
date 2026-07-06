const rasterTileService = require('../services/raster-tile.service');
const { getRequestUser, hasPrivilege } = require('../middleware/privilege.middleware');

function getMapRequestUser(request) {
  return getRequestUser(request) || process.env.KRWMP_PUBLIC_MAP_USER || 'thulasi';
}

async function rasterTileRoutes(fastify) {
  fastify.get('/raster-tiles/:layerKey/:z/:x/:y.png', async (request, reply) => {
    const user = getMapRequestUser(request);
    const allowed = await hasPrivilege(user, 'map_view', 'view');
    if (!allowed) return reply.status(403).send({ success: false, message: 'Access denied. Required privilege: map_view:view' });

    const tile = await rasterTileService.getRasterTile(
      request.params.layerKey,
      request.params.z,
      request.params.x,
      request.params.y
    );

    if (tile === null) return reply.status(404).send({ success: false, message: 'Raster layer not found' });

    return reply
      .header('Content-Type', 'image/png')
      .header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
      .send(tile);
  });
}

module.exports = rasterTileRoutes;
