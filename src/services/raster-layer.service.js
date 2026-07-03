const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');
const rasterStorage = require('./raster-object-storage.service');

const RASTER_DIR = path.join(__dirname, '../../public/data/raster-layers');
const PREVIEW_DIR = path.join(__dirname, '../../public/data/raster-previews');
const RASTER_URL_PREFIX = '/data/raster-layers';
const PREVIEW_URL_PREFIX = '/data/raster-previews';
const MAX_PREVIEW_SIZE = 1200;
const MAX_RASTER_CLASSES = 10;

function ensureRasterStorage() {
  [RASTER_DIR, PREVIEW_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function sanitizeIdentifier(value, fallback = 'raster_layer') {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  const safe = cleaned || fallback;
  return /^[a-z_]/.test(safe) ? safe : `layer_${safe}`;
}

function safeFileName(value) {
  return String(value || 'raster.tif').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
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
    if (Array.isArray(parsed) && parsed.length === 4) return parsed.map(Number);
    return parsed;
  } catch (error) {
    return null;
  }
}

function isWgs84Bounds(bounds) {
  return Array.isArray(bounds) && bounds.length === 4 &&
    bounds[0] >= -180 && bounds[0] <= 180 &&
    bounds[2] >= -180 && bounds[2] <= 180 &&
    bounds[1] >= -90 && bounds[1] <= 90 &&
    bounds[3] >= -90 && bounds[3] <= 90;
}

function utmToLonLat(easting, northing, zone, northernHemisphere = true) {
  const a = 6378137.0;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  let x = Number(easting) - 500000.0;
  let y = Number(northing);
  if (!northernHemisphere) y -= 10000000.0;
  const longOrigin = (zone - 1) * 6 - 180 + 3;
  const m = y / k0;
  const mu = m / (a * (1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * Math.pow(eccSquared, 3) / 256));
  const phi1Rad = mu + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu) + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad));
  const t1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
  const c1 = eccPrimeSquared * Math.cos(phi1Rad) * Math.cos(phi1Rad);
  const r1 = a * (1 - eccSquared) / Math.pow(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
  const d = x / (n1 * k0);
  let lat = phi1Rad - (n1 * Math.tan(phi1Rad) / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * eccPrimeSquared) * Math.pow(d, 4) / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * eccPrimeSquared - 3 * c1 * c1) * Math.pow(d, 6) / 720);
  lat = lat * 180 / Math.PI;
  let lon = (d - (1 + 2 * t1 + c1) * Math.pow(d, 3) / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * eccPrimeSquared + 24 * t1 * t1) * Math.pow(d, 5) / 120) / Math.cos(phi1Rad);
  lon = longOrigin + lon * 180 / Math.PI;
  return [lon, lat];
}

function getUtmZoneFromCrs(crs) {
  const match = String(crs || '').match(/EPSG:(326|327)(\d{2})/i);
  if (!match) return null;
  return { zone: Number(match[2]), northernHemisphere: match[1] === '326' };
}

function convertBoundsToWgs84(bounds, crs) {
  if (isWgs84Bounds(bounds)) return bounds;
  const utm = getUtmZoneFromCrs(crs);
  if (!utm) return bounds;
  const corners = [
    utmToLonLat(bounds[0], bounds[1], utm.zone, utm.northernHemisphere),
    utmToLonLat(bounds[0], bounds[3], utm.zone, utm.northernHemisphere),
    utmToLonLat(bounds[2], bounds[1], utm.zone, utm.northernHemisphere),
    utmToLonLat(bounds[2], bounds[3], utm.zone, utm.northernHemisphere)
  ];
  const lons = corners.map(c => c[0]);
  const lats = corners.map(c => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

function hexToRgb(hex, fallback = [255, 255, 255]) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function normalizeSymbology(value) {
  if (!value) return null;
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch (error) { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const mode = parsed.mode === 'classified' ? 'classified' : 'stretch';
  const classes = Array.isArray(parsed.classes) ? parsed.classes.slice(0, MAX_RASTER_CLASSES).map((item, index) => {
    const min = Number(item.min);
    const max = Number(item.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min: Math.min(min, max), max: Math.max(min, max), color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : defaultClassColor(index), label: String(item.label || `${Math.min(min, max)} - ${Math.max(min, max)}`).slice(0, 80) };
  }).filter(Boolean) : [];
  return { mode, classes };
}

function defaultClassColor(index) {
  return ['#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d73027', '#7f0000'][index] || '#cccccc';
}

function findClassColor(value, classes) {
  for (const cls of classes) {
    if (value >= cls.min && value <= cls.max) return hexToRgb(cls.color);
  }
  return null;
}

async function ensureRasterTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS public.raster_layers (id bigserial PRIMARY KEY, layer_key text UNIQUE NOT NULL, layer_name text NOT NULL, file_name text NOT NULL, file_url text NOT NULL, file_type text, attribution text, default_visible boolean DEFAULT false, opacity numeric DEFAULT 0.7, min_zoom numeric DEFAULT 0, max_zoom numeric DEFAULT 22, bounds jsonb, active boolean DEFAULT true, uploaded_by text, uploaded_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), sort_order integer DEFAULT 100);`);
  await pool.query(`ALTER TABLE public.raster_layers ADD COLUMN IF NOT EXISTS original_file_name text, ADD COLUMN IF NOT EXISTS original_file_url text, ADD COLUMN IF NOT EXISTS preview_file_name text, ADD COLUMN IF NOT EXISTS preview_file_url text, ADD COLUMN IF NOT EXISTS crs text, ADD COLUMN IF NOT EXISTS raster_width integer, ADD COLUMN IF NOT EXISTS raster_height integer, ADD COLUMN IF NOT EXISTS pixel_size_x numeric, ADD COLUMN IF NOT EXISTS pixel_size_y numeric, ADD COLUMN IF NOT EXISTS original_bounds jsonb, ADD COLUMN IF NOT EXISTS symbology jsonb DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS symbology_mode text DEFAULT 'stretch', ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'local', ADD COLUMN IF NOT EXISTS r2_bucket text, ADD COLUMN IF NOT EXISTS original_object_key text, ADD COLUMN IF NOT EXISTS preview_object_key text, ADD COLUMN IF NOT EXISTS tile_url_template text, ADD COLUMN IF NOT EXISTS tile_min_zoom numeric DEFAULT 0, ADD COLUMN IF NOT EXISTS tile_max_zoom numeric DEFAULT 22, ADD COLUMN IF NOT EXISTS tile_status text DEFAULT 'ready';`);
  await pool.query(`CREATE TABLE IF NOT EXISTS public.raster_layer_upload_audit (id bigserial PRIMARY KEY, layer_key text NOT NULL, file_name text, file_url text, uploaded_by text, uploaded_at timestamptz DEFAULT now(), action text NOT NULL DEFAULT 'upload');`);
}

function validateGeoTiffFile(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (!['.tif', '.tiff'].includes(ext)) throw new Error('Only GeoTIFF files are allowed for raster upload. Please upload .tif or .tiff.');
}

function getGeoKeysDirectory(image) { try { return image.getGeoKeys ? image.getGeoKeys() : {}; } catch (error) { return {}; } }
function getCrsLabel(image) { const geoKeys = getGeoKeysDirectory(image); if (geoKeys.ProjectedCSTypeGeoKey) return `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`; if (geoKeys.GeographicTypeGeoKey) return `EPSG:${geoKeys.GeographicTypeGeoKey}`; return 'Unknown'; }

async function createGeoTiffPreview(inputPath, previewPath, symbologyInput = null) {
  const { fromFile } = require('geotiff');
  const { PNG } = require('pngjs');
  const symbology = normalizeSymbology(symbologyInput);
  const tiff = await fromFile(inputPath);
  const image = await tiff.getImage();
  const sourceWidth = image.getWidth();
  const sourceHeight = image.getHeight();
  const bbox = image.getBoundingBox();
  const resolution = image.getResolution ? image.getResolution() : null;
  if (!bbox || bbox.length !== 4 || bbox.some(value => !Number.isFinite(Number(value)))) throw new Error('GeoTIFF bounds could not be extracted. Please provide a valid georeferenced GeoTIFF.');
  const scale = Math.min(1, MAX_PREVIEW_SIZE / Math.max(sourceWidth, sourceHeight));
  const previewWidth = Math.max(1, Math.round(sourceWidth * scale));
  const previewHeight = Math.max(1, Math.round(sourceHeight * scale));
  const raster = await image.readRasters({ width: previewWidth, height: previewHeight, interleave: false });
  const bands = Array.isArray(raster) ? raster : [raster];
  const png = new PNG({ width: previewWidth, height: previewHeight });
  const primary = bands[0];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < primary.length; i += 1) {
    const value = Number(primary[i]);
    if (Number.isFinite(value)) { if (value < min) min = value; if (value > max) max = value; }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) { min = 0; max = 255; }
  const useClassified = symbology?.mode === 'classified' && Array.isArray(symbology.classes) && symbology.classes.length > 0;
  for (let i = 0; i < previewWidth * previewHeight; i += 1) {
    const idx = i * 4;
    const primaryValue = Number(primary[i]);
    if (useClassified) {
      const rgb = Number.isFinite(primaryValue) ? findClassColor(primaryValue, symbology.classes) : null;
      if (rgb) { png.data[idx] = rgb[0]; png.data[idx + 1] = rgb[1]; png.data[idx + 2] = rgb[2]; png.data[idx + 3] = 255; }
      else { png.data[idx] = 0; png.data[idx + 1] = 0; png.data[idx + 2] = 0; png.data[idx + 3] = 0; }
    } else if (bands.length >= 3) {
      png.data[idx] = normalizeBandValue(bands[0][i]); png.data[idx + 1] = normalizeBandValue(bands[1][i]); png.data[idx + 2] = normalizeBandValue(bands[2][i]); png.data[idx + 3] = 255;
    } else {
      const gray = Math.round(((primaryValue - min) / (max - min)) * 255);
      const value = Math.max(0, Math.min(255, gray));
      png.data[idx] = value; png.data[idx + 1] = value; png.data[idx + 2] = value; png.data[idx + 3] = 255;
    }
  }
  await new Promise((resolve, reject) => png.pack().pipe(fs.createWriteStream(previewPath)).on('finish', resolve).on('error', reject));
  return { bounds: bbox.map(Number), crs: getCrsLabel(image), sourceWidth, sourceHeight, previewWidth, previewHeight, pixelSizeX: resolution ? Math.abs(Number(resolution[0])) : null, pixelSizeY: resolution ? Math.abs(Number(resolution[1])) : null, dataMin: min, dataMax: max };
}

function normalizeBandValue(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 0;
  if (numberValue <= 1 && numberValue >= 0) return Math.round(numberValue * 255);
  return Math.max(0, Math.min(255, Math.round(numberValue)));
}

function datedRasterObjectKey(type, layerKey, fileName) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return ['rasters', type, yyyy, mm, layerKey, fileName].join('/');
}

async function listRasterLayers({ activeOnly = true } = {}) {
  await ensureRasterTables();
  const result = await pool.query(`SELECT layer_key AS id, layer_key, layer_name, file_name, file_url, original_file_name, original_file_url, preview_file_name, preview_file_url, storage_provider, r2_bucket, original_object_key, preview_object_key, tile_url_template, tile_min_zoom, tile_max_zoom, tile_status, file_type, attribution, default_visible, opacity, min_zoom, max_zoom, bounds, original_bounds, crs, raster_width, raster_height, pixel_size_x, pixel_size_y, active, uploaded_by, uploaded_at, updated_at, sort_order, symbology, symbology_mode FROM public.raster_layers WHERE ($1::boolean = false OR active = true) ORDER BY sort_order ASC, uploaded_at DESC;`, [activeOnly]);
  return result.rows.map(layer => ({ ...layer, tile_url_template: layer.tile_url_template || `/api/raster-tiles/${encodeURIComponent(layer.layer_key)}/{z}/{x}/{y}.png` }));
}

async function uploadRasterLayer({ fileBuffer, filename, mimeType, fields = {}, uploadedBy = 'admin' }) {
  ensureRasterStorage();
  await ensureRasterTables();
  validateGeoTiffFile(filename);
  const rawName = fields.name || filename?.replace(/\.[^.]+$/i, '') || 'Raster Layer';
  const layerKey = sanitizeIdentifier(fields.id || rawName, 'raster_layer');
  const originalName = safeFileName(filename || `${layerKey}.tif`);
  const ext = path.extname(originalName).toLowerCase() || '.tif';
  const finalFileName = `${layerKey}${ext}`;
  const previewFileName = `${layerKey}.png`;
  const filePath = path.join(RASTER_DIR, finalFileName);
  const previewPath = path.join(PREVIEW_DIR, previewFileName);
  fs.writeFileSync(filePath, fileBuffer);
  const symbology = normalizeSymbology(fields.symbology);
  const metadata = await createGeoTiffPreview(filePath, previewPath, symbology);
  const previewBuffer = fs.readFileSync(previewPath);
  const originalObjectKey = datedRasterObjectKey('originals', layerKey, finalFileName);
  const previewObjectKey = datedRasterObjectKey('previews', layerKey, previewFileName);
  const originalUpload = await rasterStorage.putObject({ objectKey: originalObjectKey, buffer: fileBuffer, contentType: mimeType || 'image/tiff', metadata: { layer_key: layerKey, role: 'original' } });
  const previewUpload = await rasterStorage.putObject({ objectKey: previewObjectKey, buffer: previewBuffer, contentType: 'image/png', metadata: { layer_key: layerKey, role: 'preview' } });
  const originalFileUrl = originalUpload.public_url || `${RASTER_URL_PREFIX}/${finalFileName}`;
  const previewFileUrl = previewUpload.public_url || `${PREVIEW_URL_PREFIX}/${previewFileName}`;
  const originalBounds = metadata.bounds;
  const mapBounds = parseBounds(fields.bounds) || convertBoundsToWgs84(originalBounds, metadata.crs);
  const sortResult = await pool.query('SELECT COALESCE(MAX(sort_order), 100) + 1 AS sort_order FROM public.raster_layers;');
  const sortOrder = sortResult.rows[0].sort_order;
  const tileUrlTemplate = `/api/raster-tiles/${encodeURIComponent(layerKey)}/{z}/{x}/{y}.png`;
  const result = await pool.query(`INSERT INTO public.raster_layers (layer_key, layer_name, file_name, file_url, original_file_name, original_file_url, preview_file_name, preview_file_url, storage_provider, r2_bucket, original_object_key, preview_object_key, tile_url_template, tile_min_zoom, tile_max_zoom, tile_status, file_type, attribution, default_visible, opacity, min_zoom, max_zoom, bounds, original_bounds, crs, raster_width, raster_height, pixel_size_x, pixel_size_y, active, uploaded_by, uploaded_at, updated_at, sort_order, symbology, symbology_mode) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'r2',$9,$10,$11,$12,$13,$14,'ready',$15,$16,$17,$18,$19,$20,$21::jsonb,$22::jsonb,$23,$24,$25,$26,$27,true,$28,now(),now(),$29,$30::jsonb,$31) ON CONFLICT (layer_key) DO UPDATE SET layer_name=EXCLUDED.layer_name, file_name=EXCLUDED.file_name, file_url=EXCLUDED.file_url, original_file_name=EXCLUDED.original_file_name, original_file_url=EXCLUDED.original_file_url, preview_file_name=EXCLUDED.preview_file_name, preview_file_url=EXCLUDED.preview_file_url, storage_provider=EXCLUDED.storage_provider, r2_bucket=EXCLUDED.r2_bucket, original_object_key=EXCLUDED.original_object_key, preview_object_key=EXCLUDED.preview_object_key, tile_url_template=EXCLUDED.tile_url_template, tile_min_zoom=EXCLUDED.tile_min_zoom, tile_max_zoom=EXCLUDED.tile_max_zoom, tile_status='ready', file_type=EXCLUDED.file_type, attribution=EXCLUDED.attribution, default_visible=EXCLUDED.default_visible, opacity=EXCLUDED.opacity, min_zoom=EXCLUDED.min_zoom, max_zoom=EXCLUDED.max_zoom, bounds=EXCLUDED.bounds, original_bounds=EXCLUDED.original_bounds, crs=EXCLUDED.crs, raster_width=EXCLUDED.raster_width, raster_height=EXCLUDED.raster_height, pixel_size_x=EXCLUDED.pixel_size_x, pixel_size_y=EXCLUDED.pixel_size_y, active=true, uploaded_by=EXCLUDED.uploaded_by, symbology=EXCLUDED.symbology, symbology_mode=EXCLUDED.symbology_mode, updated_at=now() RETURNING *;`, [layerKey, rawName, previewFileName, previewFileUrl, finalFileName, originalFileUrl, previewFileName, previewFileUrl, originalUpload.bucket, originalObjectKey, previewObjectKey, tileUrlTemplate, normalizeNumber(fields.minZoom, 0), normalizeNumber(fields.maxZoom, 22), mimeType || 'image/tiff', fields.attribution || null, normalizeBoolean(fields.visible, false), normalizeNumber(fields.opacity, 0.7), normalizeNumber(fields.minZoom, 0), normalizeNumber(fields.maxZoom, 22), JSON.stringify(mapBounds), JSON.stringify(originalBounds), metadata.crs, metadata.sourceWidth, metadata.sourceHeight, metadata.pixelSizeX, metadata.pixelSizeY, uploadedBy, sortOrder, JSON.stringify(symbology || {}), symbology?.mode || 'stretch']);
  await pool.query(`INSERT INTO public.raster_layer_upload_audit (layer_key, file_name, file_url, uploaded_by, action) VALUES ($1, $2, $3, $4, 'upload');`, [layerKey, finalFileName, originalFileUrl, uploadedBy]);
  return result.rows[0];
}

async function updateRasterLayer(layerKey, body = {}) {
  ensureRasterStorage();
  await ensureRasterTables();
  const symbologyProvided = Object.prototype.hasOwnProperty.call(body, 'symbology');
  const symbology = symbologyProvided ? normalizeSymbology(body.symbology) : null;
  if (symbologyProvided) {
    const existing = await pool.query('SELECT * FROM public.raster_layers WHERE layer_key = $1 LIMIT 1;', [layerKey]);
    if (!existing.rows.length) return null;
    const layer = existing.rows[0];
    const originalName = layer.original_file_name || layer.file_name;
    const previewName = layer.preview_file_name || `${layer.layer_key}.png`;
    const inputPath = path.join(RASTER_DIR, path.basename(originalName));
    const previewPath = path.join(PREVIEW_DIR, path.basename(previewName));
    if (!fs.existsSync(inputPath) && layer.original_object_key) {
      fs.writeFileSync(inputPath, await rasterStorage.getObjectBuffer(layer.original_object_key));
    }
    if (!fs.existsSync(inputPath)) throw new Error('Original GeoTIFF file not found. Re-upload the raster before applying classified symbology.');
    await createGeoTiffPreview(inputPath, previewPath, symbology);
    const previewBuffer = fs.readFileSync(previewPath);
    const previewObjectKey = layer.preview_object_key || datedRasterObjectKey('previews', layer.layer_key, previewName);
    const previewUpload = await rasterStorage.putObject({ objectKey: previewObjectKey, buffer: previewBuffer, contentType: 'image/png', metadata: { layer_key: layer.layer_key, role: 'preview' } });
    await pool.query('UPDATE public.raster_layers SET preview_object_key=$2, preview_file_url=COALESCE($3, preview_file_url), tile_status=$4 WHERE layer_key=$1;', [layerKey, previewObjectKey, previewUpload.public_url, 'ready']);
  }
  const result = await pool.query(`UPDATE public.raster_layers SET layer_name=COALESCE($2,layer_name), default_visible=COALESCE($3,default_visible), opacity=COALESCE($4,opacity), min_zoom=COALESCE($5,min_zoom), max_zoom=COALESCE($6,max_zoom), tile_min_zoom=COALESCE($5,tile_min_zoom), tile_max_zoom=COALESCE($6,tile_max_zoom), attribution=COALESCE($7,attribution), bounds=COALESCE($8::jsonb,bounds), tile_url_template=COALESCE(tile_url_template, '/api/raster-tiles/' || layer_key || '/{z}/{x}/{y}.png'), symbology=CASE WHEN $9::boolean THEN COALESCE($10::jsonb, '{}'::jsonb) ELSE symbology END, symbology_mode=CASE WHEN $9::boolean THEN COALESCE($11, 'stretch') ELSE symbology_mode END, updated_at=now() WHERE layer_key=$1 RETURNING *;`, [layerKey, body.name || body.layer_name || null, body.visible === undefined ? null : normalizeBoolean(body.visible, false), body.opacity === undefined ? null : normalizeNumber(body.opacity, 0.7), body.minZoom === undefined ? null : normalizeNumber(body.minZoom, 0), body.maxZoom === undefined ? null : normalizeNumber(body.maxZoom, 22), body.attribution || null, body.bounds ? JSON.stringify(parseBounds(body.bounds)) : null, symbologyProvided, JSON.stringify(symbology || {}), symbology?.mode || 'stretch']);
  return result.rows[0] || null;
}

async function deleteRasterLayer(layerKey, deletedBy = 'admin') {
  await ensureRasterTables();
  const result = await pool.query('SELECT * FROM public.raster_layers WHERE layer_key = $1 LIMIT 1;', [layerKey]);
  if (!result.rows.length) return false;
  const layer = result.rows[0];
  [layer.original_object_key, layer.preview_object_key].filter(Boolean).forEach(objectKey => rasterStorage.deleteObject(objectKey).catch(() => {}));
  [layer.original_file_name, layer.preview_file_name, layer.file_name].filter(Boolean).forEach(fileName => {
    const filePath = fileName.endsWith('.png') ? path.join(PREVIEW_DIR, path.basename(fileName)) : path.join(RASTER_DIR, path.basename(fileName));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  await pool.query('DELETE FROM public.raster_layers WHERE layer_key = $1;', [layerKey]);
  await pool.query(`INSERT INTO public.raster_layer_upload_audit (layer_key, file_name, file_url, uploaded_by, action) VALUES ($1, $2, $3, $4, 'delete');`, [layerKey, layer.original_file_name || layer.file_name, layer.original_file_url || layer.file_url, deletedBy]);
  return true;
}

module.exports = { listRasterLayers, uploadRasterLayer, updateRasterLayer, deleteRasterLayer };
