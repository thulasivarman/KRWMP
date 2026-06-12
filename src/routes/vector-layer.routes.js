const vectorLayerDbService = require('../services/vector-layer-db.service');
const { requirePrivilegeInline } = require('../middleware/privilege.middleware');
const { assertGeoJsonUpload } = require('../utils/upload-validation');

function getAdminUser(request) {
  return String(request.auth?.identifier || request.headers['x-krwmp-user'] || request.headers['x-user'] || 'admin').trim();
}

function getFieldValue(fields, fieldName) {
  const field = fields?.[fieldName];
  if (!field) return undefined;
  return field.value ?? field;
}

async function vectorLayerRoutes(fastify) {
  fastify.get('/vector-layers', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vector_layers', 'view')) return;
    const layers = await vectorLayerDbService.listManagedLayers();
    return { success: true, storage: 'postgis', layers };
  });

  fastify.post('/vector-layers/upload', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vector_layers', 'create')) return;
    const data = await request.file();
    if (!data) return reply.status(400).send({ success: false, message: 'No GeoJSON file uploaded' });
    assertGeoJsonUpload(data);
    const buffer = await data.toBuffer();
    let geojson;
    try { geojson = JSON.parse(buffer.toString('utf8')); }
    catch (error) { return reply.status(400).send({ success: false, message: 'Invalid GeoJSON file' }); }
    const fields = data.fields || {};
    const layer = await vectorLayerDbService.importGeoJsonLayer({
      geojson,
      filename: data.filename,
      fields: {
        name: getFieldValue(fields, 'name'), id: getFieldValue(fields, 'id'), visible: getFieldValue(fields, 'visible'),
        color: getFieldValue(fields, 'color'), weight: getFieldValue(fields, 'weight'), opacity: getFieldValue(fields, 'opacity'),
        fillColor: getFieldValue(fields, 'fillColor'), fillOpacity: getFieldValue(fields, 'fillOpacity'), radius: getFieldValue(fields, 'radius'), popupFields: getFieldValue(fields, 'popupFields')
      },
      uploadedBy: getAdminUser(request),
    });
    return { success: true, message: 'Vector layer imported successfully', layer };
  });

  fastify.put('/vector-layers/:id/style', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vector_layers', 'update')) return;
    const layer = await vectorLayerDbService.updateManagedLayerStyle(request.params.id, request.body || {});
    if (!layer) return reply.status(404).send({ success: false, message: 'Layer not found' });
    return { success: true, message: 'Layer style updated successfully', layer };
  });

  fastify.delete('/vector-layers/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vector_layers', 'delete')) return;
    const deleted = await vectorLayerDbService.deleteManagedLayer(request.params.id, getAdminUser(request));
    if (!deleted) return reply.status(404).send({ success: false, message: 'Layer not found' });
    return { success: true, message: 'Layer deleted successfully', deleted: request.params.id };
  });
}

module.exports = vectorLayerRoutes;
