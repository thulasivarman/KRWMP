const pool = require('../../config/database');

const MODEL_CODE = 'pollution_pressure';

function parseNumber(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildWhere(query = {}, options = {}) {
  const params = [];
  const conditions = [];
  const alias = options.alias ? `${options.alias}.` : '';

  if (query.component_code) {
    params.push(query.component_code);
    conditions.push(`${alias}component_code = $${params.length}`);
  }

  const minIntensity = parseNumber(query.min_intensity, null);
  if (minIntensity !== null) {
    params.push(minIntensity);
    conditions.push(`${alias}intensity >= $${params.length}`);
  }

  if (query.date_from && options.hasRecordDate) {
    params.push(query.date_from);
    conditions.push(`${alias}record_date >= $${params.length}::date`);
  }

  if (query.date_to && options.hasRecordDate) {
    params.push(query.date_to);
    conditions.push(`${alias}record_date <= $${params.length}::date`);
  }

  return { params, conditions };
}

async function columnExists(viewName, columnName) {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists;
  `, [viewName, columnName]);
  return result.rows[0]?.exists === true;
}

async function getHeatmapPoints(query = {}) {
  const hasRecordDate = await columnExists('vw_pollution_pressure_heatmap', 'record_date');
  const { params, conditions } = buildWhere(query, { hasRecordDate });
  conditions.unshift('latitude IS NOT NULL', 'longitude IS NOT NULL', 'intensity > 0');

  const sql = `
    SELECT
      record_id,
      component_code,
      latitude,
      longitude,
      ROUND(intensity::numeric, 2) AS intensity
      ${hasRecordDate ? ', record_date' : ''}
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
        intensity_normalized: Math.min(Math.max(Number(point.intensity) / 100, 0), 1),
        record_date: point.record_date || null
      }
    }))
  };
}

async function getGNSummary(query = {}) {
  const params = [];
  const conditions = [];

  if (query.pressure_level) {
    params.push(query.pressure_level);
    conditions.push(`pressure_level = $${params.length}`);
  }

  const limit = parseNumber(query.limit, null);

  const sql = `
    SELECT
      gn_id,
      gn_name,
      pressure_score,
      pressure_level,
      color_code
    FROM public.vw_gn_pollution_pressure_summary
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY pressure_score DESC, gn_name ASC
    ${limit ? `LIMIT ${Math.max(1, Math.min(limit, 100))}` : ''};
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}

async function getDashboardSummary(query = {}) {
  const params = [];
  const conditions = [];

  if (query.pressure_level) {
    params.push(query.pressure_level);
    conditions.push(`pressure_level = $${params.length}`);
  }

  const sql = `
    SELECT
      pressure_level,
      gn_count,
      color_code
    FROM public.vw_pollution_pressure_dashboard_summary
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY sort_order ASC;
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}

async function getCriticalGNs(query = {}) {
  const limit = Math.max(1, Math.min(parseNumber(query.limit, 10), 50));
  const sql = `
    SELECT
      gn_id,
      gn_name,
      pressure_score,
      pressure_level,
      color_code
    FROM public.vw_gn_pollution_pressure_summary
    WHERE pressure_level IN ('High', 'Critical')
    ORDER BY pressure_score DESC, gn_name ASC
    LIMIT $1;
  `;

  const result = await pool.query(sql, [limit]);
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

async function updateComponent(id, body = {}) {
  const result = await pool.query(`
    UPDATE public.heatmap_model_components
    SET component_name = COALESCE($2, component_name),
        weight = COALESCE($3, weight),
        is_active = COALESCE($4, is_active),
        sort_order = COALESCE($5, sort_order),
        updated_at = now()
    WHERE id = $1
      AND model_code = $6
    RETURNING *;
  `, [id, body.component_name || null, parseNumber(body.weight, null), typeof body.is_active === 'boolean' ? body.is_active : null, parseNumber(body.sort_order, null), MODEL_CODE]);
  return result.rows[0];
}

async function updateRule(id, body = {}) {
  const result = await pool.query(`
    UPDATE public.heatmap_scoring_rules
    SET rule_name = COALESCE($2, rule_name),
        condition_field = COALESCE($3, condition_field),
        condition_operator = COALESCE($4, condition_operator),
        condition_value = $5,
        score = COALESCE($6, score),
        is_active = COALESCE($7, is_active),
        sort_order = COALESCE($8, sort_order),
        updated_at = now()
    WHERE id = $1
      AND model_code = $9
    RETURNING *;
  `, [
    id,
    body.rule_name || null,
    body.condition_field || null,
    body.condition_operator || null,
    body.condition_value === undefined ? null : String(body.condition_value),
    parseNumber(body.score, null),
    typeof body.is_active === 'boolean' ? body.is_active : null,
    parseNumber(body.sort_order, null),
    MODEL_CODE
  ]);
  return result.rows[0];
}

async function updatePressureClass(id, body = {}) {
  const result = await pool.query(`
    UPDATE public.heatmap_pressure_classes
    SET class_name = COALESCE($2, class_name),
        min_score = COALESCE($3, min_score),
        max_score = COALESCE($4, max_score),
        color_code = COALESCE($5, color_code),
        sort_order = COALESCE($6, sort_order),
        updated_at = now()
    WHERE id = $1
      AND model_code = $7
    RETURNING *;
  `, [id, body.class_name || null, parseNumber(body.min_score, null), parseNumber(body.max_score, null), body.color_code || null, parseNumber(body.sort_order, null), MODEL_CODE]);
  return result.rows[0];
}

module.exports = {
  getHeatmapPoints,
  getHeatmapGeoJson,
  getGNSummary,
  getDashboardSummary,
  getCriticalGNs,
  getModelConfiguration,
  updateComponent,
  updateRule,
  updatePressureClass
};
