const path = require('path');

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const GEOJSON_MIME_TYPES = new Set(['application/json', 'application/geo+json', 'application/octet-stream']);
const RASTER_MIME_TYPES = new Set(['image/tiff', 'image/geotiff', 'image/png', 'image/jpeg', 'application/octet-stream']);

function extension(filename = '') {
  return path.extname(String(filename)).toLowerCase();
}

function assertImageUpload(file, maxBytes = Number(process.env.MAX_COMPLAINT_PHOTO_SIZE || 5 * 1024 * 1024)) {
  if (!file) return;
  const ext = extension(file.filename);
  const mimetype = String(file.mimetype || '').toLowerCase();
  if (!IMAGE_MIME_TYPES.has(mimetype) || !['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    const error = new Error('Invalid photo upload. Only JPG, PNG and WEBP images are allowed.');
    error.statusCode = 400;
    throw error;
  }
  if (Number(file.size || 0) > maxBytes) {
    const error = new Error(`Photo is too large. Maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    error.statusCode = 413;
    throw error;
  }
}

function assertGeoJsonUpload(file) {
  if (!file) return;
  const ext = extension(file.filename);
  const mimetype = String(file.mimetype || '').toLowerCase();
  if (!['.geojson', '.json'].includes(ext) || !GEOJSON_MIME_TYPES.has(mimetype)) {
    const error = new Error('Invalid vector upload. Only GeoJSON or JSON files are allowed.');
    error.statusCode = 400;
    throw error;
  }
}

function assertRasterUpload(file) {
  if (!file) return;
  const ext = extension(file.filename);
  const mimetype = String(file.mimetype || '').toLowerCase();
  if (!['.tif', '.tiff', '.png', '.jpg', '.jpeg'].includes(ext) || !RASTER_MIME_TYPES.has(mimetype)) {
    const error = new Error('Invalid raster upload. Only TIFF/GeoTIFF, PNG and JPEG raster files are allowed.');
    error.statusCode = 400;
    throw error;
  }
}

module.exports = { assertImageUpload, assertGeoJsonUpload, assertRasterUpload };
