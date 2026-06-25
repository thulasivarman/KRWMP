const layersService = require('../services/layers.service');

async function vectorLayerRoutes(fastify) {
    // Compatibility route for dynamically uploaded/vector GIS layers.
    // The active layer registry remains managed through public.gis_layers.
    fastify.get('/vector-layer/:layerKey', async (request, reply) => {
        const { layerKey } = request.params;
        const geojson = await layersService.getLayerGeoJSON(layerKey);

        if (!geojson) {
            return reply.status(404).send({
                success: false,
                message: 'Vector layer not found'
            });
        }

        return reply
            .header('Content-Type', 'application/json')
            .header('Cache-Control', 'public, max-age=1800')
            .send(geojson);
    });

    fastify.get('/vector-layers/:layerKey', async (request, reply) => {
        const { layerKey } = request.params;
        const geojson = await layersService.getLayerGeoJSON(layerKey);

        if (!geojson) {
            return reply.status(404).send({
                success: false,
                message: 'Vector layer not found'
            });
        }

        return reply
            .header('Content-Type', 'application/json')
            .header('Cache-Control', 'public, max-age=1800')
            .send(geojson);
    });
}

module.exports = vectorLayerRoutes;
