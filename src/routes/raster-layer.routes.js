const rasterLayerService = require('../services/raster-layer.service');

function getAdminUser(request) {
  return String(
    request.headers['x-krwmp-user'] ||
    request.headers['x-user'] ||
    'admin'
  ).trim();
}

function getFieldValue(fields, fieldName) {
  const field = fields?.[fieldName];
  if (!field) return undefined;
  return field.value ?? field;
}

function extractFields(fields = {}) {
  return {
    name: getFieldValue(fields, 'name'),
    id: getFieldValue(fields, 'id'),
    visible: getFieldValue(fields, 'visible'),
    opacity: getFieldValue(fields, 'opacity'),
    minZoom: getFieldValue(fields, 'minZoom'),
    maxZoom: getFieldValue(fields, 'maxZoom'),
    attribution: getFieldValue(fields, 'attribution'),
    bounds: getFieldValue(fields, 'bounds'),
    fileType: getFieldValue(fields, 'fileType'),
  };
}

async function rasterLayerRoutes(fastify) {
  fastify.get('/raster-layers', async () => {
    const layers = await rasterLayerService.listRasterLayers({ activeOnly: true });
    return { success: true, layers };
  });

  fastify.get('/raster-layers/admin', async () => {
    const layers = await rasterLayerService.listRasterLayers({ activeOnly: false });
    return { success: true, layers };
  });

  fastify.post('/raster-layers/upload', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ success: false, message: 'No raster file uploaded' });
    }

    const fileBuffer = await data.toBuffer();
    const fields = extractFields(data.fields || {});

    const layer = await rasterLayerService.uploadRasterLayer({
      fileBuffer,
      filename: data.filename,
      mimeType: data.mimetype,
      fields,
      uploadedBy: getAdminUser(request),
    });

    return {
      success: true,
      message: 'Raster layer uploaded successfully',
      layer,
    };
  });

  fastify.post('/raster-layers/:id/process', async (request, reply) => {
    const result = await rasterLayerService.processRasterLayerForTiles(request.params.id, request.body || {});

    if (!result) {
      return reply.status(404).send({ success: false, message: 'Raster layer not found' });
    }

    return {
      success: result.success !== false,
      message: result.message,
      result,
    };
  });

  fastify.put('/raster-layers/:id', async (request, reply) => {
    const layer = await rasterLayerService.updateRasterLayer(request.params.id, request.body || {});

    if (!layer) {
      return reply.status(404).send({ success: false, message: 'Raster layer not found' });
    }

    return { success: true, message: 'Raster layer updated successfully', layer };
  });

  fastify.delete('/raster-layers/:id', async (request, reply) => {
    const deleted = await rasterLayerService.deleteRasterLayer(request.params.id, getAdminUser(request));

    if (!deleted) {
      return reply.status(404).send({ success: false, message: 'Raster layer not found' });
    }

    return { success: true, message: 'Raster layer deleted successfully', deleted: request.params.id };
  });
}

module.exports = rasterLayerRoutes;
