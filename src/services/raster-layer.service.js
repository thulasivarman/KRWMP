const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');

const RASTER_DIR = path.join(__dirname, '../../public/data/raster-layers');
const RASTER_URL_PREFIX = '/data/raster-layers';

function ensureRasterStorage() {
  if (!fs.existsSync(RASTER_DIR)) {
    fs.mkdirSync(RASTER_DIR, { recursive: true });
  }
}

function sanitizeIdentifier(value, fallback = 'raster_layer') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const safe = cleaned || fallback;
  return /^[a-z_]/.test(safe) ? safe : `layer_${safe}`;
}

function safeFileName(value) {
  return String(value || 'raster.tif')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return fallback;
}

function normalizeNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function parseBounds(value) {
  if (!value) return null;

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed) && parsed.length === 4) {
      return parsed.map(Number);
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

async function ensureRasterTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.raster_layers (
      id bigserial PRIMARY KEY,
      layer_key text UNIQUE NOT NULL,
      layer_name text NOT NULL,
      file_name text NOT NULL,
      file_url text NOT NULL,
      file_type text,
      attribution text,
      default_visible boolean DEFAULT false,
      opacity numeric DEFAULT 0.7,
      min_zoom numeric DEFAULT 0,
      max_zoom numeric DEFAULT 22,
      bounds jsonb,
      active boolean DEFAULT true,
      uploaded_by text,
      uploaded_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(),
      sort_order integer DEFAULT 100
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.raster_layer_upload_audit (
      id bigserial PRIMARY KEY,
      layer_key text NOT NULL,
      file_name text,
      file_url text,
      uploaded_by text,
      uploaded_at timestamptz DEFAULT now(),
      action text NOT NULL DEFAULT 'upload'
    );
  `);
}

async function listRasterLayers({ activeOnly = true } = {}) {
  await ensureRasterTables();

  const result = await pool.query(`
    SELECT
      layer_key AS id,
      layer_key,
      layer_name,
      file_name,
      file_url,
      file_type,
      attribution,
      default_visible,
      opacity,
      min_zoom,
      max_zoom,
      bounds,
      active,
      uploaded_by,
      uploaded_at,
      updated_at,
      sort_order
    FROM public.raster_layers
    WHERE ($1::boolean = false OR active = true)
    ORDER BY sort_order ASC, uploaded_at DESC;
  `, [activeOnly]);

  return result.rows;
}

async function uploadRasterLayer({ fileBuffer, filename, mimeType, fields = {}, uploadedBy = 'admin' }) {
  ensureRasterStorage();
  await ensureRasterTables();

  const rawName = fields.name || filename?.replace(/\.[^.]+$/i, '') || 'Raster Layer';
  const layerKey = sanitizeIdentifier(fields.id || rawName, 'raster_layer');
  const originalName = safeFileName(filename || `${layerKey}.tif`);
  const ext = path.extname(originalName) || '.tif';
  const finalFileName = `${layerKey}${ext}`;
  const filePath = path.join(RASTER_DIR, finalFileName);
  const fileUrl = `${RASTER_URL_PREFIX}/${finalFileName}`;

  fs.writeFileSync(filePath, fileBuffer);

  const sortResult = await pool.query('SELECT COALESCE(MAX(sort_order), 100) + 1 AS sort_order FROM public.raster_layers;');
  const sortOrder = sortResult.rows[0].sort_order;

  const bounds = parseBounds(fields.bounds);

  const result = await pool.query(`
    INSERT INTO public.raster_layers (
      layer_key,
      layer_name,
      file_name,
      file_url,
      file_type,
      attribution,
      default_visible,
      opacity,
      min_zoom,
      max_zoom,
      bounds,
      active,
      uploaded_by,
      uploaded_at,
      updated_at,
      sort_order
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, true, $12, now(), now(), $13
    )
    ON CONFLICT (layer_key)
    DO UPDATE SET
      layer_name = EXCLUDED.layer_name,
      file_name = EXCLUDED.file_name,
      file_url = EXCLUDED.file_url,
      file_type = EXCLUDED.file_type,
      attribution = EXCLUDED.attribution,
      default_visible = EXCLUDED.default_visible,
      opacity = EXCLUDED.opacity,
      min_zoom = EXCLUDED.min_zoom,
      max_zoom = EXCLUDED.max_zoom,
      bounds = EXCLUDED.bounds,
      active = true,
      uploaded_by = EXCLUDED.uploaded_by,
      updated_at = now()
    RETURNING *;
  `, [
    layerKey,
    rawName,
    finalFileName,
    fileUrl,
    mimeType || fields.fileType || 'application/octet-stream',
    fields.attribution || null,
    normalizeBoolean(fields.visible, false),
    normalizeNumber(fields.opacity, 0.7),
    normalizeNumber(fields.minZoom, 0),
    normalizeNumber(fields.maxZoom, 22),
    bounds ? JSON.stringify(bounds) : null,
    uploadedBy,
    sortOrder,
  ]);

  await pool.query(`
    INSERT INTO public.raster_layer_upload_audit (layer_key, file_name, file_url, uploaded_by, action)
    VALUES ($1, $2, $3, $4, 'upload');
  `, [layerKey, finalFileName, fileUrl, uploadedBy]);

  return result.rows[0];
}

async function updateRasterLayer(layerKey, body = {}) {
  await ensureRasterTables();

  const result = await pool.query(`
    UPDATE public.raster_layers
    SET
      layer_name = COALESCE($2, layer_name),
      default_visible = COALESCE($3, default_visible),
      opacity = COALESCE($4, opacity),
      min_zoom = COALESCE($5, min_zoom),
      max_zoom = COALESCE($6, max_zoom),
      attribution = COALESCE($7, attribution),
      bounds = COALESCE($8::jsonb, bounds),
      updated_at = now()
    WHERE layer_key = $1
    RETURNING *;
  `, [
    layerKey,
    body.name || body.layer_name || null,
    body.visible === undefined ? null : normalizeBoolean(body.visible, false),
    body.opacity === undefined ? null : normalizeNumber(body.opacity, 0.7),
    body.minZoom === undefined ? null : normalizeNumber(body.minZoom, 0),
    body.maxZoom === undefined ? null : normalizeNumber(body.maxZoom, 22),
    body.attribution || null,
    body.bounds ? JSON.stringify(parseBounds(body.bounds)) : null,
  ]);

  return result.rows[0] || null;
}

async function deleteRasterLayer(layerKey, deletedBy = 'admin') {
  await ensureRasterTables();

  const result = await pool.query('SELECT * FROM public.raster_layers WHERE layer_key = $1 LIMIT 1;', [layerKey]);
  if (!result.rows.length) return false;

  const layer = result.rows[0];
  const filePath = path.join(RASTER_DIR, path.basename(layer.file_name));

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  await pool.query('DELETE FROM public.raster_layers WHERE layer_key = $1;', [layerKey]);
  await pool.query(`
    INSERT INTO public.raster_layer_upload_audit (layer_key, file_name, file_url, uploaded_by, action)
    VALUES ($1, $2, $3, $4, 'delete');
  `, [layerKey, layer.file_name, layer.file_url, deletedBy]);

  return true;
}

module.exports = {
  listRasterLayers,
  uploadRasterLayer,
  updateRasterLayer,
  deleteRasterLayer,
};
