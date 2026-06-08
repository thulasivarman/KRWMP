const fs = require('fs');
const path = require('path');

async function vectorLayerRoutes(fastify) {

  fastify.get('/vector-layers', async () => {

    const configPath = path.join(
      __dirname,
      '../../public/data/layers-config.json'
    );

    if (!fs.existsSync(configPath)) {
      return {
        success: true,
        layers: [],
      };
    }

    const config = JSON.parse(
      fs.readFileSync(configPath, 'utf8')
    );

    return {
      success: true,
      layers: config.layers || [],
    };
  });

  fastify.post('/vector-layers/upload', async (request, reply) => {

    const data = await request.file();

    if (!data) {
      return reply.status(400).send({
        success: false,
        message: 'No file uploaded',
      });
    }

    const buffer = await data.toBuffer();

    let geojson;

    try {
      geojson = JSON.parse(buffer.toString());
    } catch (err) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid GeoJSON',
      });
    }

    const layerId = Date.now().toString();

    const savePath = path.join(
      __dirname,
      '../../public/data/vector-layers',
      `${layerId}.geojson`
    );

    fs.writeFileSync(
      savePath,
      JSON.stringify(geojson, null, 2)
    );

    const configPath = path.join(
      __dirname,
      '../../public/data/layers-config.json'
    );

    let config = { layers: [] };

    if (fs.existsSync(configPath)) {
      config = JSON.parse(
        fs.readFileSync(configPath, 'utf8')
      );
    }

    config.layers.push({
      id: layerId,
      name: data.filename,
      url: `/data/vector-layers/${layerId}.geojson`,
      visible: true,
      style: {
        color: '#3388ff',
        weight: 2,
        fillColor: '#3388ff',
        fillOpacity: 0.2,
      },
    });

    fs.writeFileSync(
      configPath,
      JSON.stringify(config, null, 2)
    );

    return {
      success: true,
      message: 'Layer uploaded successfully',
    };
  });
}

module.exports = vectorLayerRoutes;