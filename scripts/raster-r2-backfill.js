require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');
const storage = require('../src/services/raster-object-storage.service');

const rasterDir = path.join(__dirname, '../public/data/raster-layers');
const previewDir = path.join(__dirname, '../public/data/raster-previews');
const stamp = new Date().toISOString().slice(0, 7).replace('-', '/');

function makeKey(kind, layerKey, fileName) {
  return ['rasters', kind, stamp, layerKey, fileName].join('/');
}

function mime(fileName) {
  if (/\.png$/i.test(fileName)) return 'image/png';
  if (/\.tiff?$/i.test(fileName)) return 'image/tiff';
  return 'application/octet-stream';
}

async function putLocal(filePath, objectKey, contentType, metadata) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return storage.putObject({ objectKey, buffer: fs.readFileSync(filePath), contentType, metadata });
}

async function main() {
  const result = await pool.query('SELECT * FROM public.raster_layers ORDER BY layer_key');
  for (const layer of result.rows) {
    const originalName = layer.original_file_name || layer.file_name || `${layer.layer_key}.tif`;
    const previewName = layer.preview_file_name || `${layer.layer_key}.png`;
    const original = layer.original_object_key ? null : await putLocal(path.join(rasterDir, path.basename(originalName)), makeKey('originals', layer.layer_key, path.basename(originalName)), mime(originalName), { layer_key: layer.layer_key, role: 'original' });
    const preview = layer.preview_object_key ? null : await putLocal(path.join(previewDir, path.basename(previewName)), makeKey('previews', layer.layer_key, path.basename(previewName)), 'image/png', { layer_key: layer.layer_key, role: 'preview' });
    if (!original && !preview) continue;
    await pool.query(
      'UPDATE public.raster_layers SET storage_provider=$1, r2_bucket=COALESCE($2,r2_bucket), original_object_key=COALESCE($3,original_object_key), original_file_url=COALESCE($4,original_file_url), preview_object_key=COALESCE($5,preview_object_key), preview_file_url=COALESCE($6,preview_file_url), file_url=COALESCE($6,file_url), tile_url_template=COALESCE(tile_url_template, $7), tile_status=$8, updated_at=now() WHERE layer_key=$9',
      ['r2', original?.bucket || preview?.bucket || null, original?.object_key || null, original?.public_url || null, preview?.object_key || null, preview?.public_url || null, `/api/raster-tiles/${encodeURIComponent(layer.layer_key)}/{z}/{x}/{y}.png`, 'ready', layer.layer_key]
    );
    console.log(`Raster layer moved to R2: ${layer.layer_key}`);
  }
}

main().finally(async () => { await pool.end(); });
