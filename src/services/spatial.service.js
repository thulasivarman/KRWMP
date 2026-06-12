const pool = require('../../config/database');

async function getBasin() {
  const sql = `
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
    ) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', ST_AsGeoJSON(geom)::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'washd_no', washd_no,
          'wshd_name', wshd_name,
          'hectares', hectares,
          'area_sqkm', area_sqkm
        )
      ) AS feature
      FROM public.basin_boundary
    ) x;
  `;

  const result = await pool.query(sql);
  return result.rows[0].geojson;
}

async function getDSD() {
  const sql = `
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
    ) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', ST_AsGeoJSON(geom)::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'objectid', objectid,
          'dsd_n', dsd_n,
          'iddistrict', iddistrict,
          'iddsd', iddsd
        )
      ) AS feature
      FROM public.dsd_boundary
    ) x;
  `;

  const result = await pool.query(sql);
  return result.rows[0].geojson;
}

async function getGND() {
  const sql = `
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
    ) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0001))::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'objectid', objectid,
          'gnd_name', COALESCE(gnd_name, 'Unknown GND'),
          'la', COALESCE(la, 'N/A'),
          'idgnd', idgnd,
          'area_ha', area_ha,
          'iddsd', iddsd
        )
      ) AS feature
      FROM public.gnd_boundary
    ) x;
  `;

  const result = await pool.query(sql);
  return result.rows[0].geojson;
}

async function getForest() {
  const sql = `
    SELECT jsonb_build_object(
      'type', 'FeatureCollection',
      'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
    ) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type', 'Feature',
        'id', id,
        'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0001))::jsonb,
        'properties', jsonb_build_object(
          'id', id,
          'source_id', source_id,
          'name', name,
          'district', district,
          'range_name', range_name,
          'beat', beat,
          'dsd', dsd,
          'area', area,
          'lc', lc,
          'forest_type', forest_type
        )
      ) AS feature
      FROM public.forest_cover
    ) x;
  `;

  const result = await pool.query(sql);
  return result.rows[0].geojson;
}

async function identifyLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Valid latitude and longitude are required.');
  }

  const pointSql = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)';

  const sql = `
    WITH p AS (SELECT ${pointSql} AS geom),
    gnd_match AS (
      SELECT g.id, g.gnd_name, g.idgnd, g.iddsd, g.la
      FROM public.gnd_boundary g, p
      WHERE ST_Intersects(g.geom, p.geom)
      LIMIT 1
    ),
    dsd_match AS (
      SELECT d.id, d.dsd_n, d.iddistrict, d.iddsd
      FROM public.dsd_boundary d, p
      WHERE ST_Intersects(d.geom, p.geom)
      LIMIT 1
    ),
    sub_match AS (
      SELECT s.id, s.name, s.area
      FROM public.sub_watersheds s, p
      WHERE s.geom IS NOT NULL AND ST_Intersects(s.geom, p.geom)
      LIMIT 1
    )
    SELECT
      (SELECT jsonb_build_object('id', id, 'gnd_name', gnd_name, 'idgnd', idgnd, 'iddsd', iddsd, 'la', la) FROM gnd_match) AS gnd,
      (SELECT jsonb_build_object('id', id, 'dsd_name', dsd_n, 'iddistrict', iddistrict, 'iddsd', iddsd) FROM dsd_match) AS dsd,
      (SELECT jsonb_build_object('id', id, 'name', name, 'area', area) FROM sub_match) AS sub_watershed;
  `;

  const result = await pool.query(sql, [lng, lat]);
  const row = result.rows[0] || {};
  return {
    latitude: lat,
    longitude: lng,
    gnd: row.gnd || null,
    dsd: row.dsd || null,
    sub_watershed: row.sub_watershed || null
  };
}

module.exports = {
  getBasin,
  getDSD,
  getGND,
  getForest,
  identifyLocation
};
