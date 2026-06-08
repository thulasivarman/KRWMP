const pool = require('../../config/database');

const ADMIN_TABLE_PREFIX = 'uploaded_';

function sanitizeIdentifier(value, fallback = 'layer') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  const safe = cleaned || fallback;
  return /^[a-z_]/.test(safe) ? safe : `layer_${safe}`;
}

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
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

function normalizeStyle(input = {}) {
  return {
    color: input.color || '#10b981',
    weight: normalizeNumber(input.weight, 2),
    opacity: normalizeNumber(input.opacity, 1),
    fillColor: input.fillColor || input.color || '#10b981',
    fillOpacity: normalizeNumber(input.fillOpacity, 0.2),
    radius: normalizeNumber(input.radius, 6),
  };
}

function buildPopupFields(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function normalizeFeatureCollection(geojson) {
  if (!geojson || !geojson.type) {
    throw new Error('Invalid GeoJSON structure.');
  }

  if (geojson.type === 'FeatureCollection') {
    return geojson;
  }

  if (geojson.type === 'Feature') {
    return {
      type: 'FeatureCollection',
      features: [geojson],
    };
  }

  if (/Point|LineString|Polygon|MultiPoint|MultiLineString|MultiPolygon|GeometryCollection/.test(geojson.type)) {
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: geojson }],
    };
  }

  throw new Error('Unsupported GeoJSON type.');
}

function detectGeometryType(featureCollection) {
  const feature = featureCollection.features.find(item => item && item.geometry);
  return feature?.geometry?.type || 'Geometry';
}

function getPropertyColumns(featureCollection) {
  const columns = new Map();

  for (const feature of featureCollection.features) {
    const properties = feature.properties || {};

    Object.keys(properties).forEach(key => {
      const columnName = sanitizeIdentifier(key, 'attr');
      if (!columns.has(columnName)) columns.set(columnName, key);
    });
  }

  return [...columns.entries()].slice(0, 80).map(([columnName, propertyName]) => ({ columnName, propertyName }));
}

async function ensureRegistryColumns(client) {
  await client.query('CREATE EXTENSION IF NOT EXISTS postgis;');
  await client.query(`
    ALTER TABLE public.gis_layers
    ADD COLUMN IF NOT EXISTS uploaded_by text,
    ADD COLUMN IF NOT EXISTS uploaded_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS managed_by_admin boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS geometry_type text,
    ADD COLUMN IF NOT EXISTS popup_fields jsonb DEFAULT '[]'::jsonb;
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.gis_layer_upload_audit (
      id bigserial PRIMARY KEY,
      layer_key text NOT NULL,
      table_name text NOT NULL,
      original_filename text,
      feature_count integer DEFAULT 0,
      geometry_type text,
      uploaded_by text,
      uploaded_at timestamptz DEFAULT now(),
      action text NOT NULL DEFAULT 'upload'
    );
  `);
}

async function importGeoJsonLayer({ geojson, filename, fields, uploadedBy }) {
  const featureCollection = normalizeFeatureCollection(geojson);

  if (!Array.isArray(featureCollection.features) || featureCollection.features.length === 0) {
    throw new Error('GeoJSON has no features.');
  }

  const rawName = fields.name || filename?.replace(/\.geojson$|\.json$/i, '') || 'Uploaded Layer';
  const layerKey = sanitizeIdentifier(fields.id || rawName, 'uploaded_layer');
  const tableName = `${ADMIN_TABLE_PREFIX}${layerKey}`;
  const sourceId = `source_${layerKey}`;
  const fillLayerId = `layer_${layerKey}_fill`;
  const lineLayerId = `layer_${layerKey}_line`;
  const geometryType = detectGeometryType(featureCollection);
  const popupFields = buildPopupFields(fields.popupFields);
  const style = normalizeStyle(fields);
  const propertyColumns = getPropertyColumns(featureCollection);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await ensureRegistryColumns(client);

    await client.query(`DROP TABLE IF EXISTS public.${quoteIdent(tableName)};`);

    const propertyColumnSql = propertyColumns
      .map(column => `${quoteIdent(column.columnName)} text`)
      .join(',\n      ');

    await client.query(`
      CREATE TABLE public.${quoteIdent(tableName)} (
        id bigserial PRIMARY KEY,
        properties jsonb DEFAULT '{}'::jsonb,
        ${propertyColumnSql ? `${propertyColumnSql},` : ''}
        geom geometry(Geometry, 4326)
      );
    `);

    await client.query(`CREATE INDEX ${quoteIdent(`${tableName}_geom_idx`)} ON public.${quoteIdent(tableName)} USING GIST (geom);`);

    const insertColumns = ['properties', ...propertyColumns.map(column => column.columnName), 'geom'];
    const insertColumnSql = insertColumns.map(quoteIdent).join(', ');

    for (const feature of featureCollection.features) {
      if (!feature || !feature.geometry) continue;

      const properties = feature.properties || {};
      const values = [JSON.stringify(properties)];
      propertyColumns.forEach(column => values.push(properties[column.propertyName] == null ? null : String(properties[column.propertyName])));
      values.push(JSON.stringify(feature.geometry));

      const placeholders = values.map((_, index) => {
        if (index === values.length - 1) {
          return `ST_SetSRID(ST_GeomFromGeoJSON($${index + 1}), 4326)`;
        }
        return `$${index + 1}`;
      }).join(', ');

      await client.query(
        `INSERT INTO public.${quoteIdent(tableName)} (${insertColumnSql}) VALUES (${placeholders});`,
        values
      );
    }

    const featureCountResult = await client.query(`SELECT COUNT(*)::integer AS count FROM public.${quoteIdent(tableName)};`);
    const featureCount = featureCountResult.rows[0].count;

    await client.query(
      `
      DELETE FROM public.gis_layers
      WHERE layer_key = $1
         OR (managed_by_admin = true AND table_name = $2);
      `,
      [layerKey, tableName]
    );

    const sortOrderResult = await client.query('SELECT COALESCE(MAX(sort_order), 100) + 1 AS sort_order FROM public.gis_layers;');
    const sortOrder = sortOrderResult.rows[0].sort_order;

    await client.query(
      `
      INSERT INTO public.gis_layers (
        layer_key,
        layer_name,
        category,
        api_url,
        source_id,
        fill_layer_id,
        line_layer_id,
        popup_type,
        default_visible,
        min_zoom,
        max_zoom,
        fill_color,
        fill_opacity,
        line_color,
        line_width,
        sort_order,
        table_name,
        geom_column,
        active,
        uploaded_by,
        uploaded_at,
        managed_by_admin,
        geometry_type,
        popup_fields
      ) VALUES (
        $1, $2, 'uploaded_vector', $3, $4, $5, $6, $1, $7, 0, 22,
        $8, $9, $10, $11, $12, $13, 'geom', true, $14, now(), true, $15, $16::jsonb
      );
      `,
      [
        layerKey,
        rawName,
        `/api/spatial/layer/${layerKey}`,
        sourceId,
        fillLayerId,
        lineLayerId,
        normalizeBoolean(fields.visible, true),
        style.fillColor,
        style.fillOpacity,
        style.color,
        style.weight,
        sortOrder,
        tableName,
        uploadedBy || 'admin',
        geometryType,
        JSON.stringify(popupFields),
      ]
    );

    await client.query(
      `
      INSERT INTO public.gis_layer_upload_audit (
        layer_key, table_name, original_filename, feature_count, geometry_type, uploaded_by, action
      ) VALUES ($1, $2, $3, $4, $5, $6, 'upload');
      `,
      [layerKey, tableName, filename || null, featureCount, geometryType, uploadedBy || 'admin']
    );

    await client.query('COMMIT');

    return {
      layer_key: layerKey,
      layer_name: rawName,
      table_name: tableName,
      feature_count: featureCount,
      geometry_type: geometryType,
      api_url: `/api/spatial/layer/${layerKey}`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listManagedLayers() {
  const result = await pool.query(`
    SELECT
      layer_key AS id,
      layer_name AS name,
      table_name,
      geometry_type AS "geometryType",
      api_url AS url,
      default_visible AS visible,
      popup_fields AS "popupFields",
      jsonb_build_object(
        'color', line_color,
        'weight', line_width,
        'fillColor', fill_color,
        'fillOpacity', fill_opacity,
        'opacity', 1,
        'radius', 6
      ) AS style,
      uploaded_by AS "uploadedBy",
      uploaded_at AS "updatedAt"
    FROM public.gis_layers
    WHERE managed_by_admin = true
      AND active = true
    ORDER BY sort_order ASC;
  `);

  return result.rows;
}

async function updateManagedLayerStyle(layerKey, body = {}) {
  const style = normalizeStyle({ ...(body.style || {}), ...body });
  const visible = normalizeBoolean(body.visible, true);

  const result = await pool.query(
    `
    UPDATE public.gis_layers
    SET
      layer_name = COALESCE($2, layer_name),
      default_visible = $3,
      fill_color = $4,
      fill_opacity = $5,
      line_color = $6,
      line_width = $7,
      uploaded_at = now()
    WHERE layer_key = $1
      AND managed_by_admin = true
    RETURNING layer_key AS id, layer_name AS name;
    `,
    [layerKey, body.name || null, visible, style.fillColor, style.fillOpacity, style.color, style.weight]
  );

  if (!result.rows.length) return null;
  return result.rows[0];
}

async function deleteManagedLayer(layerKey, deletedBy = 'admin') {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const layerResult = await client.query(
      `SELECT table_name FROM public.gis_layers WHERE layer_key = $1 AND managed_by_admin = true LIMIT 1;`,
      [layerKey]
    );

    if (!layerResult.rows.length) {
      await client.query('ROLLBACK');
      return false;
    }

    const tableName = layerResult.rows[0].table_name;
    await client.query(`DROP TABLE IF EXISTS public.${quoteIdent(tableName)};`);
    await client.query(`DELETE FROM public.gis_layers WHERE layer_key = $1 AND managed_by_admin = true;`, [layerKey]);
    await client.query(
      `INSERT INTO public.gis_layer_upload_audit (layer_key, table_name, uploaded_by, action) VALUES ($1, $2, $3, 'delete');`,
      [layerKey, tableName, deletedBy]
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  importGeoJsonLayer,
  listManagedLayers,
  updateManagedLayerStyle,
  deleteManagedLayer,
};
