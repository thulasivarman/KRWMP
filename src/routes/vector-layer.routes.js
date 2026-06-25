const pool = require('../../config/database');
const vectorLayerDbService = require('../services/vector-layer-db.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');
const { assertGeoJsonUpload } = require('../utils/upload-validation');

function getAdminUser(request) {
  return getRequestUser(request) || 'admin';
}

function getFieldValue(fields, fieldName) {
  const field = fields?.[fieldName];
  if (!field) return undefined;
  return field.value ?? field;
}

function prettifyLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, char => char.toUpperCase());
}

function normalisePopupFields(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return { key: item.trim(), label: prettifyLabel(item), type: 'text' };
      return { key: String(item.key || '').trim(), label: String(item.label || prettifyLabel(item.key)).trim(), type: item.type || 'text', digits: item.digits };
    }).filter(item => item.key);
  }
  return String(value).split(',').map(key => key.trim()).filter(Boolean).map(key => ({ key, label: prettifyLabel(key), type: 'text' }));
}

async function ensurePopupColumns() {
  await pool.query(`
    ALTER TABLE public.gis_layers
    ADD COLUMN IF NOT EXISTS popup_title_field text,
    ADD COLUMN IF NOT EXISTS popup_subtitle text,
    ADD COLUMN IF NOT EXISTS popup_fields jsonb DEFAULT '[]'::jsonb;
  `);
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

  fastify.put('/vector-layers/:id/popup', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vector_layers', 'update')) return;
    await ensurePopupColumns();
    const body = request.body || {};
    const popupTitleField = String(body.popupTitleField || '').trim() || null;
    const popupSubtitle = String(body.popupSubtitle || '').trim() || null;
    const popupFields = normalisePopupFields(body.popupFields);

    const result = await pool.query(
      `
      UPDATE public.gis_layers
      SET popup_title_field = $2,
          popup_subtitle = $3,
          popup_fields = $4::jsonb,
          uploaded_at = now()
      WHERE layer_key = $1
        AND managed_by_admin = true
      RETURNING layer_key AS id, layer_name AS name, popup_title_field AS "popupTitleField", popup_subtitle AS "popupSubtitle", popup_fields AS "popupFields";
      `,
      [request.params.id, popupTitleField, popupSubtitle, JSON.stringify(popupFields)]
    );

    if (!result.rows.length) return reply.status(404).send({ success: false, message: 'Layer not found' });
    return { success: true, message: 'Popup configuration updated successfully', layer: result.rows[0] };
  });

  fastify.delete('/vector-layers/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'vector_layers', 'delete')) return;
    const deleted = await vectorLayerDbService.deleteManagedLayer(request.params.id, getAdminUser(request));
    if (!deleted) return reply.status(404).send({ success: false, message: 'Layer not found' });
    return { success: true, message: 'Layer deleted successfully', deleted: request.params.id };
  });
}

module.exports = vectorLayerRoutes;
