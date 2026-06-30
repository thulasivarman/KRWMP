const pool = require('../../config/database');

const MODEL_CODE = 'pollution_pressure';

function parseNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDateFilter(query, params) {
  const conditions = [];

  if (query.date_from) {
    params.push(query.date_from);
    conditions.push(`record_date >= $${params.length}::date`);
  }

  if (query.date_to) {
    params.push(query.date_to);
    conditions.push(`record_date <= $${params.length}::date`);
  }

  return conditions;
}

async function getHeatmapPoints(query = {}) {
  const params = [];
  const conditions = ['latitude IS NOT NULL', 'longitude IS NOT NULL', 'intensity > 0'];

  const minIntensity = parseNumber(query.min_intensity, null);
  if (minIntensity !== null) {
    params.push(minIntensity);
    conditions.push(`intensity >= $${params.length}`);
  }

  if (query.component_code) {
    params.push(query.component_code);
    conditions.push(`component_code = $${params.length}`);
  }

  const sql = `
    SELECT
      record_id,
      component_code,
      latitude,
      longitude,
      ROUND(intensity::numeric, 2) AS intensity
    FROM public.vw_pollution_pressure_heatmap
    WHERE ${conditions.join(' AND ')}
    ORDER BY intensity DESC
    LIMIT 10000;
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}

async function getHeatmapGeoJson(query = {}) {
  const points = await getHeatmapPoints(query);

  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      id: point.record_id,
      geometry: {
        type: 'Point',
        coordinates: [Number(point.longitude), Number(point.latitude)]
      },
      properties: {
        record_id: point.record_id,
        component_code: point.component_code,
        intensity: Number(point.intensity),
        intensity_normalized: Math.min(Math.max(Number(point.intensity) / 100, 0), 1)
      }
    }))
  };
}

async function getGNSummary() {
  const sql = `
    SELECT
      gn_id,
      gn_name,
      pressure_score,
      pressure_level,
      color_code
    FROM public.vw_gn_pollution_pressure_summary
    ORDER BY pressure_score DESC, gn_name ASC;
  `;

  const result = await pool.query(sql);
  return result.rows;
}

async function getDashboardSummary() {
  const sql = `
    SELECT
      pressure_level,
      gn_count,
      color_code
    FROM public.vw_pollution_pressure_dashboard_summary
    ORDER BY sort_order ASC;
  `;

  const result = await pool.query(sql);
  return result.rows;
}

async function getModelConfiguration() {
  const sql = `
    SELECT jsonb_build_object(
      'model', (
        SELECT to_jsonb(m)
        FROM public.heatmap_models m
        WHERE m.model_code = $1
      ),
      'components', COALESCE((
        SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order)
        FROM public.heatmap_model_components c
        WHERE c.model_code = $1
      ), '[]'::jsonb),
      'rules', COALESCE((
        SELECT jsonb_agg(to_jsonb(r) ORDER BY r.component_code, r.sort_order)
        FROM public.heatmap_scoring_rules r
        WHERE r.model_code = $1
      ), '[]'::jsonb),
      'classes', COALESCE((
        SELECT jsonb_agg(to_jsonb(pc) ORDER BY pc.sort_order)
        FROM public.heatmap_pressure_classes pc
        WHERE pc.model_code = $1
      ), '[]'::jsonb)
    ) AS config;
  `;

  const result = await pool.query(sql, [MODEL_CODE]);
  return result.rows[0]?.config || null;
}

module.exports = {
  getHeatmapPoints,
  getHeatmapGeoJson,
  getGNSummary,
  getDashboardSummary,
  getModelConfiguration
};
