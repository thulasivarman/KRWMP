const layersService = require('../services/layers.service');

async function layersRoutes(fastify) {
    fastify.get('/layers', async () => {
        return layersService.getActiveLayers();
    });

    fastify.get('/spatial/layer/:layerKey', async (request, reply) => {
        const { layerKey } = request.params;

        const geojson = await layersService.getLayerGeoJSON(layerKey);

        if (!geojson) {
            return reply.status(404).send({
                success: false,
                message: 'Layer not found'
            });
        }

        return reply
            .header('Content-Type', 'application/json')
            .header('Cache-Control', 'public, max-age=1800')
            .send(geojson);
    });
}

module.exports = layersRoutes;