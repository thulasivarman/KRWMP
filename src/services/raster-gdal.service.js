const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const pool = require('../../config/database');

const PUBLIC_DIR = path.join(__dirname, '../../public');
const TEMP_DIR = path.join(PUBLIC_DIR, 'data/raster-temp');
const CLIPPED_DIR = path.join(PUBLIC_DIR, 'data/raster-clipped');
const TILE_DIR = path.join(PUBLIC_DIR, 'data/raster-tiles');

function ensureDirs() {
  [TEMP_DIR, CLIPPED_DIR, TILE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${error.message}\n${stderr || ''}`;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function isGdalAvailable() {
  try {
    await runCommand('gdalwarp', ['--version']);
    return true;
  } catch (error) {
    return false;
  }
}

async function writeBasinCutline(layerKey) {
  ensureDirs();
  const result = await pool.query(`
    SELECT ST_AsGeoJSON(ST_Union(geom))::json AS geometry
    FROM public.basin_boundary
    WHERE geom IS NOT NULL;
  `);

  if (!result.rows.length || !result.rows[0].geometry) {
    throw new Error('Basin boundary geometry not found in public.basin_boundary.');
  }

  const cutline = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { name: 'KRWMP Basin Boundary' },
      geometry: result.rows[0].geometry
    }]
  };

  const cutlinePath = path.join(TEMP_DIR, `${layerKey}_basin_cutline.geojson`);
  fs.writeFileSync(cutlinePath, JSON.stringify(cutline));
  return cutlinePath;
}

async function processRasterWithGdal({ layerKey, originalPath, minZoom = 0, maxZoom = 14 }) {
  ensureDirs();

  const gdalAvailable = await isGdalAvailable();
  if (!gdalAvailable) {
    return {
      success: false,
      message: 'GDAL not available. Install GDAL to enable basin clipping and tile generation.'
    };
  }

  const cutlinePath = await writeBasinCutline(layerKey);
  const clippedFileName = `${layerKey}_clipped_wgs84.tif`;
  const clippedPath = path.join(CLIPPED_DIR, clippedFileName);
  const layerTileDir = path.join(TILE_DIR, layerKey);

  if (fs.existsSync(layerTileDir)) fs.rmSync(layerTileDir, { recursive: true, force: true });
  fs.mkdirSync(layerTileDir, { recursive: true });

  await runCommand('gdalwarp', [
    '-overwrite',
    '-dstalpha',
    '-t_srs', 'EPSG:4326',
    '-cutline', cutlinePath,
    '-crop_to_cutline',
    originalPath,
    clippedPath
  ]);

  await runCommand('gdal2tiles.py', [
    '--xyz',
    '-z', `${Number(minZoom)}-${Number(maxZoom)}`,
    '-w', 'none',
    clippedPath,
    layerTileDir
  ]);

  return {
    success: true,
    clippedFileName,
    clippedFileUrl: `/data/raster-clipped/${clippedFileName}`,
    tileUrlTemplate: `/data/raster-tiles/${layerKey}/{z}/{x}/{y}.png`,
    tileMinZoom: Number(minZoom),
    tileMaxZoom: Number(maxZoom),
    message: 'Raster clipped to basin and tiles generated successfully.'
  };
}

module.exports = {
  processRasterWithGdal,
  isGdalAvailable
};
