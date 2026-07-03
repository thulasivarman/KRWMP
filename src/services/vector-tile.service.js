const pool = require('../../config/database');
const { hasPrivilege } = require('../middleware/privilege.middleware');

const TILE_EXTENT = 4096;
const TILE_BUFFER = 64;
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

const STATIC_ALLOWED_TABLES = new Set([
  'basin_boundary',
  'forest_cover',
  'dsd_boundary',
  'gnd_boundary',
  'district_boundary',
  'community_issue_reports',
  'vwmc_committees',
  'intervention_registry',
  'intervention_institutions',
  'vw_volunteer_organisation_performance',
  'pollution_sources',
  'water_quality_tests',
]);

const LAT_LNG_TABLES = new Set([
  'intervention_registry',
]);

function isSafeIdentifier(value) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(value || ''));
}

function quoteIdent(identifier) {
  if (!isSafeIdentifier(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function cleanLayerName(value) {
  const name = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return name || 'layer';
}

function normalizeTileCoordinate(value, field, min, max) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    const error = new Error(`Invalid tile ${field}.`);
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

function isAdminUploadedLayer(layer) {
  return layer.managed_by_admin === true && String(layer.table_name || '').startsWith('uploaded_');
}

function isAllowedTable(layer) {
  return STATIC_ALLOWED_TABLES.has(layer.table_name) || isAdminUploadedLayer(layer);
}

async function getLayerConfig(layerKey, identifier = '') {
  const result = await pool.query(
    `
    SELECT
      layer_key,
      table_name,
      geom_column,
      managed_by_admin,
      min_zoom,
      max_zoom,
      COALESCE(required_privilege, 'map_view') AS required_privilege
    FROM public.gis_layers
    WHERE layer_key = $1
      AND active = true
    LIMIT 1;
    `,
    [layerKey]
  );

  if (!result.rows.length) return null;
  const layer = result.rows[0];

  const allowed = await hasPrivilege(identifier, layer.required_privilege || 'map_view', 'view');
  if (!allowed) return null;

  if (!isAllowedTable(layer)) {
    const error = new Error('Unauthorized spatial table.');
    error.statusCode = 403;
    throw error;
  }
  if (!isSafeIdentifier(layer.table_name)) {
    const error = new Error('Invalid spatial layer table configuration.');
    error.statusCode = 500;
    throw error;
  }
  if (!LAT_LNG_TABLES.has(layer.table_name) && !isSafeIdentifier(layer.geom_column || 'geom')) {
    const error = new Error('Invalid spatial layer geometry configuration.');
    error.statusCode = 500;
    throw error;
  }

  return {
    ...layer,
    geom_column: layer.geom_column || 'geom',
    uses_lat_lng: LAT_LNG_TABLES.has(layer.table_name),
    mvt_layer_name: cleanLayerName(layer.layer_key),
  };
}

function tileIsOutsideScale(layer, z) {
  const minZoom = Number(layer.min_zoom ?? MIN_ZOOM);
  const maxZoom = Number(layer.max_zoom ?? MAX_ZOOM);
  return z < minZoom || z > maxZoom;
}

function geometryExpression(layer) {
  if (layer.uses_lat_lng) {
    return 'ST_SetSRID(ST_MakePoint(t.longitude, t.latitude), 4326)';
  }
  return `t.${quoteIdent(layer.geom_column)}`;
}

function geometryWhereClause(layer, geomExpr) {
  if (layer.uses_lat_lng) {
    return `t.latitude IS NOT NULL AND t.longitude IS NOT NULL AND ${geomExpr} IS NOT NULL`;
  }
  return `${geomExpr} IS NOT NULL`;
}

function propertyExpression(layer) {
  if (layer.uses_lat_lng) {
    return 'to_jsonb(t)';
  }
  return `(to_jsonb(t) - '${layer.geom_column}')`;
}

async function getLayerTile(layerKey, zValue, xValue, yValue, identifier = '') {
  const tile = validateTile(zValue, xValue, yValue);
  const layer = await getLayerConfig(layerKey, identifier);
  if (!layer) return null;
  if (tileIsOutsideScale(layer, tile.z)) return Buffer.alloc(0);

  const tableSql = `public.${quoteIdent(layer.table_name)}`;
  const geomExpr = geometryExpression(layer);
  const whereExpr = geometryWhereClause(layer, geomExpr);
  const propertiesExpr = propertyExpression(layer);
  const mvtLayerName = layer.mvt_layer_name;

  const sql = `
    WITH bounds AS (
      SELECT ST_TileEnvelope($1, $2, $3) AS geom
    ), source AS (
      SELECT
        t.id::text AS id,
        ${propertiesExpr} AS properties,
        ST_AsMVTGeom(
          ST_Transform(${geomExpr}, 3857),
          bounds.geom,
          $4,
          $5,
          true
        ) AS geom
      FROM ${tableSql} AS t
      CROSS JOIN bounds
      WHERE ${whereExpr}
        AND ST_Intersects(ST_Transform(${geomExpr}, 3857), bounds.geom)
    ), mvt_features AS (
      SELECT id, properties, geom
      FROM source
      WHERE geom IS NOT NULL
    )
    SELECT ST_AsMVT(mvt_features, $6, $4, 'geom') AS tile
    FROM mvt_features;
  `;

  const result = await pool.query(sql, [tile.z, tile.x, tile.y, TILE_EXTENT, TILE_BUFFER, mvtLayerName]);
  const rawTile = result.rows[0]?.tile;
  if (!rawTile) return Buffer.alloc(0);
  return Buffer.isBuffer(rawTile) ? rawTile : Buffer.from(rawTile);
}

module.exports = {
  getLayerTile,
  getLayerConfig,
  validateTile,
};
