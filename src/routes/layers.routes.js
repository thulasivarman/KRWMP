const layersService = require('../services/layers.service');
const { getRequestUser, hasPrivilege } = require('../middleware/privilege.middleware');

function getMapRequestUser(request) {
    return getRequestUser(request) || process.env.KRWMP_PUBLIC_MAP_USER || 'thulasi';
}

async function layersRoutes(fastify) {
    fastify.get('/layers', async (request, reply) => {
        const user = getMapRequestUser(request);
        const allowed = await hasPrivilege(user, 'map_view', 'view');
        if (!allowed) return reply.status(403).send({ success: false, message: 'Access denied. Required privilege: map_view:view' });
        return layersService.getActiveLayers(user);
    });

    fastify.get('/spatial/layer/:layerKey', async (request, reply) => {
        const user = getMapRequestUser(request);
        const allowed = await hasPrivilege(user, 'map_view', 'view');
        if (!allowed) return reply.status(403).send({ success: false, message: 'Access denied. Required privilege: map_view:view' });

        const { layerKey } = request.params;
        const geojson = await layersService.getLayerGeoJSON(layerKey, user);

        if (!geojson) {
            return reply.status(404).send({ success: false, message: 'Layer not found' });
        }

        return reply.header('Content-Type', 'application/json').header('Cache-Control', 'public, max-age=1800').send(geojson);
    });
}

module.exports = layersRoutes;