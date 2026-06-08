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

module.exports = {
    getBasin,
    getDSD,
    getGND,
    getForest
};