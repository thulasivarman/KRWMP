const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pool = require('../../config/database');
const rasterStorage = require('./raster-object-storage.service');

const TILE_SIZE = 256;
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;
const LOCAL_PREVIEW_DIR = path.join(__dirname, '../../public/data/raster-previews');

function normalizeTileCoordinate(value, field, min, max) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    const error = new Error(`Invalid raster tile ${field}.`);
    error.statusCode = 400;
    throw error;
  }
  return numberValue;
}

function validateTile(z, x, y) {
  const zoom = normalizeTileCoordinate(z, 'z', MIN_ZOOM, MAX_ZOOM);
  const max = (2 ** zoom) - 1;
  return {
    z: zoom,
    x: normalizeTileCoordinate(x, 'x', 0, max),
    y: normalizeTileCoordinate(y, 'y', 0, max),
  };
}

function tileLon(x, z) {
  return (x / (2 ** z)) * 360 - 180;
}

function tileLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / (2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function tileBounds(z, x, y) {
  return [tileLon(x, z), tileLat(y + 1, z), tileLon(x + 1, z), tileLat(y, z)];
}

function parseBounds(value) {
  if (!value) return null;
  const bounds = Array.isArray(value) ? value : JSON.parse(value);
  if (!Array.isArray(bounds) || bounds.length !== 4) return null;
  const numeric = bounds.map(Number);
  return numeric.every(Number.isFinite) ? numeric : null;
}

function intersects(a, b) {
  return !(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3]);
}

function emptyPngBuffer() {
  const png = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  return PNG.sync.write(png);
}

async function getRasterLayer(layerKey) {
  const result = await pool.query(
    `
    SELECT layer_key, layer_name, preview_object_key, preview_file_name, preview_file_url, file_url, bounds, min_zoom, max_zoom, active
    FROM public.raster_layers
    WHERE layer_key = $1 AND active = true
    LIMIT 1;
    `,
    [layerKey]
  );
  return result.rows[0] || null;
}

async function loadPreviewBuffer(layer) {
  if (layer.preview_object_key) return rasterStorage.getObjectBuffer(layer.preview_object_key);
  const previewName = layer.preview_file_name || path.basename(layer.preview_file_url || '');
  if (previewName) {
    const localPath = path.join(LOCAL_PREVIEW_DIR, path.basename(previewName));
    if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
  }
  return null;
}

function samplePreviewToTile(previewPng, rasterBounds, requestedTileBounds) {
  const output = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  const [rMinLon, rMinLat, rMaxLon, rMaxLat] = rasterBounds;
  const [tMinLon, tMinLat, tMaxLon, tMaxLat] = requestedTileBounds;
  const lonSpan = rMaxLon - rMinLon;
  const latSpan = rMaxLat - rMinLat;
  const tileLonSpan = tMaxLon - tMinLon;
  const tileLatSpan = tMaxLat - tMinLat;

  if (!lonSpan || !latSpan || !tileLonSpan || !tileLatSpan) return output;

  for (let y = 0; y < TILE_SIZE; y += 1) {
    const lat = tMaxLat - ((y + 0.5) / TILE_SIZE) * tileLatSpan;
    if (lat < rMinLat || lat > rMaxLat) continue;
    const py = Math.floor(((rMaxLat - lat) / latSpan) * previewPng.height);
    if (py < 0 || py >= previewPng.height) continue;

    for (let x = 0; x < TILE_SIZE; x += 1) {
      const lon = tMinLon + ((x + 0.5) / TILE_SIZE) * tileLonSpan;
      if (lon < rMinLon || lon > rMaxLon) continue;
      const px = Math.floor(((lon - rMinLon) / lonSpan) * previewPng.width);
      if (px < 0 || px >= previewPng.width) continue;
      const sourceIdx = (py * previewPng.width + px) * 4;
      const targetIdx = (y * TILE_SIZE + x) * 4;
      output.data[targetIdx] = previewPng.data[sourceIdx];
      output.data[targetIdx + 1] = previewPng.data[sourceIdx + 1];
      output.data[targetIdx + 2] = previewPng.data[sourceIdx + 2];
      output.data[targetIdx + 3] = previewPng.data[sourceIdx + 3];
    }
  }

  return output;
}

async function getRasterTile(layerKey, zValue, xValue, yValue) {
  const tile = validateTile(zValue, xValue, yValue);
  const layer = await getRasterLayer(layerKey);
  if (!layer) return null;

  const minZoom = Number(layer.min_zoom ?? MIN_ZOOM);
  const maxZoom = Number(layer.max_zoom ?? MAX_ZOOM);
  if (tile.z < minZoom || tile.z > maxZoom) return emptyPngBuffer();

  const rasterBounds = parseBounds(layer.bounds);
  if (!rasterBounds) return emptyPngBuffer();
  const requestedTileBounds = tileBounds(tile.z, tile.x, tile.y);
  if (!intersects(rasterBounds, requestedTileBounds)) return emptyPngBuffer();

  const buffer = await loadPreviewBuffer(layer);
  if (!buffer) return emptyPngBuffer();
  const previewPng = PNG.sync.read(buffer);
  const tilePng = samplePreviewToTile(previewPng, rasterBounds, requestedTileBounds);
  return PNG.sync.write(tilePng);
}

module.exports = {
  getRasterTile,
  tileBounds,
  validateTile,
};
