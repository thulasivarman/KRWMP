const pool = require('../../config/database');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
}

function sourceCode() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PS-${stamp}-${rand}`;
}

function validateCoordinates(latitude, longitude) {
  if (latitude === null || longitude === null) throw new Error('Valid latitude and longitude are required.');
  if (latitude < 5 || latitude > 10) throw new Error('Latitude must be within Sri Lanka coordinate range.');
  if (longitude < 79 || longitude > 82) throw new Error('Longitude must be within Sri Lanka coordinate range.');
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch (_) {}
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

async function listSourceTypes({ includeInactive = false } = {}) {
  const result = await pool.query(`
    SELECT * FROM public.pollution_source_types
    WHERE ($1::boolean = true OR is_active = true)
    ORDER BY is_active DESC, type_name;
  `, [includeInactive]);
  return result.rows;
}

async function listImpactLevels() {
  const result = await pool.query('SELECT * FROM public.pollution_impact_levels WHERE is_active = true ORDER BY level_score ASC;');
  return result.rows;
}

async function listImpacts({ includeInactive = false } = {}) {
  const result = await pool.query(`
    SELECT i.*, l.level_name AS default_level_name, l.level_score AS default_level_score
    FROM public.pollution_impact_library i
    LEFT JOIN public.pollution_impact_levels l ON l.id = i.default_level_id
    WHERE ($1::boolean = true OR i.is_active = true)
    ORDER BY i.is_active DESC, i.impact_name;
  `, [includeInactive]);
  return result.rows;
}

async function listTreatmentMethods({ includeInactive = false } = {}) {
  const result = await pool.query(`
    SELECT * FROM public.pollution_treatment_methods
    WHERE ($1::boolean = true OR is_active = true)
    ORDER BY is_active DESC, method_name;
  `, [includeInactive]);
  return result.rows;
}

async function dashboard() {
  const summary = await pool.query('SELECT * FROM public.vw_pollution_dashboard_summary;');
  const riskDistribution = await pool.query(`
    SELECT risk_class, COUNT(*)::integer AS count
    FROM public.vw_pollution_source_risk
    GROUP BY risk_class
    ORDER BY CASE risk_class WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Moderate' THEN 3 ELSE 4 END;
  `);
  const sourceTypes = await pool.query(`
    SELECT type_name, COUNT(*)::integer AS count
    FROM public.vw_pollution_source_risk
    GROUP BY type_name
    ORDER BY count DESC, type_name;
  `);
  const dsdHotspots = await pool.query(`
    SELECT COALESCE(dsd_name, 'Unknown') AS dsd_name, COUNT(*)::integer AS source_count,
           ROUND(AVG(risk_score)::numeric, 2) AS avg_risk_score,
           COUNT(*) FILTER (WHERE risk_class IN ('Critical','High'))::integer AS high_priority_count
    FROM public.vw_pollution_source_risk
    GROUP BY COALESCE(dsd_name, 'Unknown')
    ORDER BY high_priority_count DESC, avg_risk_score DESC, source_count DESC
    LIMIT 10;
  `);
  const actionList = await pool.query(`
    SELECT id, source_code, source_name, type_name, dsd_name, gnd_name, risk_class, risk_score,
           last_inspection_date, nearest_river_distance_m
    FROM public.vw_pollution_source_risk
    WHERE risk_class IN ('Critical', 'High')
       OR last_inspection_date IS NULL
       OR last_inspection_date < CURRENT_DATE - INTERVAL '90 days'
    ORDER BY CASE risk_class WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Moderate' THEN 3 ELSE 4 END,
             risk_score DESC NULLS LAST
    LIMIT 25;
  `);
  return {
    summary: summary.rows[0] || {},
    risk_distribution: riskDistribution.rows,
    source_types: sourceTypes.rows,
    dsd_hotspots: dsdHotspots.rows,
    immediate_action_required: actionList.rows
  };
}

async function listSources({ status = null, risk_class = null, source_type_id = null, q = null, limit = 100 } = {}) {
  const result = await pool.query(`
    SELECT r.*, ST_Y(r.geom) AS latitude, ST_X(r.geom) AS longitude
    FROM public.vw_pollution_source_risk r
    WHERE ($1::text IS NULL OR r.status = $1)
      AND ($2::text IS NULL OR r.risk_class = $2)
      AND ($3::uuid IS NULL OR EXISTS (
        SELECT 1 FROM public.pollution_sources ps WHERE ps.id = r.id AND ps.source_type_id = $3
      ))
      AND ($4::text IS NULL OR r.source_code ILIKE '%' || $4 || '%' OR r.source_name ILIKE '%' || $4 || '%' OR r.dsd_name ILIKE '%' || $4 || '%' OR r.gnd_name ILIKE '%' || $4 || '%')
    ORDER BY r.risk_score DESC NULLS LAST, r.source_name
    LIMIT LEAST(GREATEST($5::integer, 1), 500);
  `, [status, risk_class, source_type_id || null, cleanText(q), Number(limit || 100)]);
  return result.rows;
}

async function getSource(id) {
  const source = await pool.query(`
    SELECT ps.*, pst.type_name, pst.default_weight, r.risk_score, r.risk_class, r.last_inspection_date
    FROM public.pollution_sources ps
    JOIN public.pollution_source_types pst ON pst.id = ps.source_type_id
    LEFT JOIN public.vw_pollution_source_risk r ON r.id = ps.id
    WHERE ps.id = $1;
  `, [id]);
  if (!source.rows[0]) return null;
  const [monitoring, enforcement, linkages] = await Promise.all([
    listMonitoring(id),
    listEnforcement(id),
    getLinkages(id)
  ]);
  return { ...source.rows[0], monitoring, enforcement, linkages };
}

async function createSource(body = {}, user = 'system') {
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  validateCoordinates(latitude, longitude);
  const sourceName = cleanText(body.source_name);
  if (!sourceName || sourceName.length < 3) throw new Error('Pollution source name must be at least 3 characters.');
  if (!body.source_type_id) throw new Error('Source type is required.');
  const result = await pool.query(`
    INSERT INTO public.pollution_sources
      (source_code, source_name, source_type_id, description, status, location_description, geom, reported_date, created_by, updated_by)
    VALUES
      ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7::double precision,$8::double precision),4326),COALESCE($9::date,CURRENT_DATE),$10,$10)
    RETURNING *;
  `, [
    cleanText(body.source_code) || sourceCode(),
    sourceName,
    body.source_type_id,
    cleanText(body.description),
    body.status || 'active',
    cleanText(body.location_description),
    longitude,
    latitude,
    body.reported_date || null,
    user
  ]);
  return getSource(result.rows[0].id);
}

async function updateSource(id, body = {}, user = 'system') {
  const existing = await getSource(id);
  if (!existing) return null;
  const latitude = toNumber(body.latitude ?? existing.latitude);
  const longitude = toNumber(body.longitude ?? existing.longitude);
  validateCoordinates(latitude, longitude);
  const result = await pool.query(`
    UPDATE public.pollution_sources
    SET source_name = COALESCE($2, source_name),
        source_type_id = COALESCE($3, source_type_id),
        description = COALESCE($4, description),
        status = COALESCE($5, status),
        location_description = COALESCE($6, location_description),
        geom = ST_SetSRID(ST_MakePoint($7::double precision,$8::double precision),4326),
        reported_date = COALESCE($9::date, reported_date),
        updated_by = $10,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [
    id,
    cleanText(body.source_name),
    body.source_type_id || null,
    cleanText(body.description),
    body.status || null,
    cleanText(body.location_description),
    longitude,
    latitude,
    body.reported_date || null,
    user
  ]);
  if (!result.rows[0]) return null;
  return getSource(id);
}

async function deleteSource(id, user = 'system') {
  const result = await pool.query(`
    UPDATE public.pollution_sources
    SET status = 'closed', updated_by = $2, updated_at = now()
    WHERE id = $1
    RETURNING id;
  `, [id, user]);
  return result.rowCount > 0;
}

async function listMonitoring(sourceId) {
  const result = await pool.query(`
    SELECT m.*,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'impact_id', i.id,
        'impact_name', i.impact_name,
        'impact_level_id', il.id,
        'level_name', il.level_name,
        'level_score', il.level_score,
        'remarks', mi.remarks
      )) FILTER (WHERE i.id IS NOT NULL), '[]'::jsonb) AS impacts,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'treatment_method_id', tm.id,
        'method_name', tm.method_name,
        'recommendation', mt.recommendation,
        'implementation_status', mt.implementation_status
      )) FILTER (WHERE tm.id IS NOT NULL), '[]'::jsonb) AS treatments
    FROM public.pollution_source_monitoring m
    LEFT JOIN public.pollution_monitoring_impacts mi ON mi.monitoring_id = m.id
    LEFT JOIN public.pollution_impact_library i ON i.id = mi.impact_id
    LEFT JOIN public.pollution_impact_levels il ON il.id = mi.impact_level_id
    LEFT JOIN public.pollution_monitoring_treatments mt ON mt.monitoring_id = m.id
    LEFT JOIN public.pollution_treatment_methods tm ON tm.id = mt.treatment_method_id
    WHERE m.pollution_source_id = $1
    GROUP BY m.id
    ORDER BY m.inspection_date DESC, m.created_at DESC;
  `, [sourceId]);
  return result.rows;
}

async function createMonitoring(sourceId, body = {}, user = 'system') {
  const impactIds = normalizeArray(body.impact_ids);
  const treatmentIds = normalizeArray(body.treatment_method_ids);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`
      INSERT INTO public.pollution_source_monitoring
        (pollution_source_id, inspection_date, inspected_by, inspection_agency, observation_summary, evidence_url, photo_url,
         follow_up_required, follow_up_deadline, follow_up_status, water_quality_exceedance, repeat_offender, created_by)
      VALUES ($1,COALESCE($2::date,CURRENT_DATE),$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$13)
      RETURNING *;
    `, [
      sourceId,
      body.inspection_date || null,
      cleanText(body.inspected_by),
      cleanText(body.inspection_agency),
      cleanText(body.observation_summary),
      cleanText(body.evidence_url),
      cleanText(body.photo_url),
      toBool(body.follow_up_required, false),
      body.follow_up_deadline || null,
      body.follow_up_status || (toBool(body.follow_up_required, false) ? 'pending' : 'not_required'),
      toBool(body.water_quality_exceedance, false),
      toBool(body.repeat_offender, false),
      user
    ]);
    for (const impactId of impactIds) {
      await client.query(`
        INSERT INTO public.pollution_monitoring_impacts (monitoring_id, impact_id, impact_level_id, remarks)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (monitoring_id, impact_id) DO UPDATE SET impact_level_id = EXCLUDED.impact_level_id, remarks = EXCLUDED.remarks;
      `, [inserted.rows[0].id, impactId, body.impact_level_id || null, cleanText(body.impact_remarks)]);
    }
    for (const treatmentId of treatmentIds) {
      await client.query(`
        INSERT INTO public.pollution_monitoring_treatments (monitoring_id, treatment_method_id, recommendation, implementation_status)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (monitoring_id, treatment_method_id) DO UPDATE SET recommendation = EXCLUDED.recommendation, implementation_status = EXCLUDED.implementation_status;
      `, [inserted.rows[0].id, treatmentId, cleanText(body.recommendation), body.implementation_status || 'recommended']);
    }
    await client.query('COMMIT');
    return getSource(sourceId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listEnforcement(sourceId) {
  const result = await pool.query(`
    SELECT * FROM public.pollution_enforcement_notices
    WHERE pollution_source_id = $1
    ORDER BY notice_date DESC, created_at DESC;
  `, [sourceId]);
  return result.rows;
}

async function createEnforcement(sourceId, body = {}, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.pollution_enforcement_notices
      (pollution_source_id, notice_no, notice_date, issued_by_agency, notice_type, compliance_deadline, agency_response, response_date, closure_status, closure_date, remarks, created_by)
    VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6::date,$7,$8::date,$9,$10::date,$11,$12)
    RETURNING *;
  `, [
    sourceId,
    cleanText(body.notice_no),
    body.notice_date || null,
    cleanText(body.issued_by_agency),
    body.notice_type || 'warning',
    body.compliance_deadline || null,
    cleanText(body.agency_response),
    body.response_date || null,
    body.closure_status || 'open',
    body.closure_date || null,
    cleanText(body.remarks),
    user
  ]);
  return result.rows[0];
}

async function getLinkages(sourceId) {
  const [complaints, waterQuality, interventions] = await Promise.all([
    pool.query(`
      SELECT l.*, r.report_code, r.issue_title, r.status, r.severity_level, r.dsd_name, r.gnd_name, r.submitted_at,
             c.category_name, si.issue_name,
             CASE WHEN r.geom IS NOT NULL AND ps.geom IS NOT NULL THEN ROUND(ST_Distance(ps.geom::geography, r.geom::geography)::numeric, 2) ELSE NULL END AS distance_m
      FROM public.pollution_source_community_issues l
      JOIN public.pollution_sources ps ON ps.id = l.pollution_source_id
      LEFT JOIN public.community_issue_reports r ON r.id::text = l.community_issue_id
      LEFT JOIN public.issue_categories c ON c.id = r.category_id
      LEFT JOIN public.specific_issues si ON si.id = r.issue_id
      WHERE l.pollution_source_id = $1
      ORDER BY l.created_at DESC;
    `, [sourceId]),
    pool.query(`
      SELECT l.*, t.sample_code, t.sample_location_name, t.sample_collection_datetime, t.overall_status, t.dsd_name, t.gnd_name,
             CASE WHEN t.geom IS NOT NULL AND ps.geom IS NOT NULL THEN ROUND(ST_Distance(ps.geom::geography, t.geom::geography)::numeric, 2) ELSE NULL END AS distance_m
      FROM public.pollution_source_water_quality_records l
      JOIN public.pollution_sources ps ON ps.id = l.pollution_source_id
      LEFT JOIN public.water_quality_tests t ON t.id::text = l.water_quality_record_id
      WHERE l.pollution_source_id = $1
      ORDER BY l.created_at DESC;
    `, [sourceId]),
    pool.query(`
      SELECT l.*, i.intervention_code, i.intervention_title, i.status, i.priority, i.dsd_name, i.gnd_name, i.progress_percent,
             CASE WHEN i.geom IS NOT NULL AND ps.geom IS NOT NULL THEN ROUND(ST_Distance(ps.geom::geography, i.geom::geography)::numeric, 2) ELSE NULL END AS distance_m
      FROM public.pollution_source_interventions l
      JOIN public.pollution_sources ps ON ps.id = l.pollution_source_id
      LEFT JOIN public.intervention_registry i ON i.id::text = l.intervention_id
      WHERE l.pollution_source_id = $1
      ORDER BY l.created_at DESC;
    `, [sourceId])
  ]);
  return {
    community_complaints: complaints.rows,
    water_quality_records: waterQuality.rows,
    interventions: interventions.rows
  };
}

async function linkCommunityIssue(sourceId, issueId, note = null, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.pollution_source_community_issues (pollution_source_id, community_issue_id, linkage_note, linked_by)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (pollution_source_id, community_issue_id) DO UPDATE SET linkage_note = EXCLUDED.linkage_note, linked_by = EXCLUDED.linked_by, created_at = now()
    RETURNING *;
  `, [sourceId, String(issueId), cleanText(note), user]);
  return result.rows[0];
}

async function unlinkCommunityIssue(sourceId, issueId) {
  const result = await pool.query('DELETE FROM public.pollution_source_community_issues WHERE pollution_source_id = $1 AND community_issue_id = $2;', [sourceId, String(issueId)]);
  return result.rowCount > 0;
}

async function linkWaterQuality(sourceId, recordId, note = null, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.pollution_source_water_quality_records (pollution_source_id, water_quality_record_id, linkage_note, linked_by)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (pollution_source_id, water_quality_record_id) DO UPDATE SET linkage_note = EXCLUDED.linkage_note, linked_by = EXCLUDED.linked_by, created_at = now()
    RETURNING *;
  `, [sourceId, String(recordId), cleanText(note), user]);
  return result.rows[0];
}

async function unlinkWaterQuality(sourceId, recordId) {
  const result = await pool.query('DELETE FROM public.pollution_source_water_quality_records WHERE pollution_source_id = $1 AND water_quality_record_id = $2;', [sourceId, String(recordId)]);
  return result.rowCount > 0;
}

async function linkIntervention(sourceId, interventionId, note = null, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.pollution_source_interventions (pollution_source_id, intervention_id, linkage_note, linked_by)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (pollution_source_id, intervention_id) DO UPDATE SET linkage_note = EXCLUDED.linkage_note, linked_by = EXCLUDED.linked_by, created_at = now()
    RETURNING *;
  `, [sourceId, String(interventionId), cleanText(note), user]);
  return result.rows[0];
}

async function unlinkIntervention(sourceId, interventionId) {
  const result = await pool.query('DELETE FROM public.pollution_source_interventions WHERE pollution_source_id = $1 AND intervention_id = $2;', [sourceId, String(interventionId)]);
  return result.rowCount > 0;
}

async function suggestedLinkages(sourceId, { complaint_distance_m = 500, water_quality_distance_m = 1000, intervention_distance_m = 1000 } = {}) {
  const [complaints, waterQuality, interventions] = await Promise.all([
    pool.query(`
      SELECT r.id::text AS id, r.report_code, r.issue_title, r.status, r.severity_level, r.dsd_name, r.gnd_name, r.submitted_at,
             c.category_name, si.issue_name,
             ROUND(ST_Distance(ps.geom::geography, r.geom::geography)::numeric, 2) AS distance_m
      FROM public.pollution_sources ps
      JOIN public.community_issue_reports r ON r.geom IS NOT NULL AND ST_DWithin(ps.geom::geography, r.geom::geography, $2::double precision)
      LEFT JOIN public.issue_categories c ON c.id = r.category_id
      LEFT JOIN public.specific_issues si ON si.id = r.issue_id
      WHERE ps.id = $1
        AND NOT EXISTS (SELECT 1 FROM public.pollution_source_community_issues l WHERE l.pollution_source_id = ps.id AND l.community_issue_id = r.id::text)
      ORDER BY distance_m ASC, r.submitted_at DESC
      LIMIT 25;
    `, [sourceId, Number(complaint_distance_m || 500)]),
    pool.query(`
      SELECT t.id::text AS id, t.sample_code, t.sample_location_name, t.sample_collection_datetime, t.overall_status, t.dsd_name, t.gnd_name,
             ROUND(ST_Distance(ps.geom::geography, t.geom::geography)::numeric, 2) AS distance_m
      FROM public.pollution_sources ps
      JOIN public.water_quality_tests t ON t.geom IS NOT NULL AND ST_DWithin(ps.geom::geography, t.geom::geography, $2::double precision)
      WHERE ps.id = $1
        AND t.overall_status IN ('non_compliant', 'caution')
        AND NOT EXISTS (SELECT 1 FROM public.pollution_source_water_quality_records l WHERE l.pollution_source_id = ps.id AND l.water_quality_record_id = t.id::text)
      ORDER BY distance_m ASC, t.sample_collection_datetime DESC
      LIMIT 25;
    `, [sourceId, Number(water_quality_distance_m || 1000)]),
    pool.query(`
      SELECT i.id::text AS id, i.intervention_code, i.intervention_title, i.status, i.priority, i.progress_percent, i.dsd_name, i.gnd_name,
             ROUND(ST_Distance(ps.geom::geography, i.geom::geography)::numeric, 2) AS distance_m
      FROM public.pollution_sources ps
      JOIN public.intervention_registry i ON i.geom IS NOT NULL AND ST_DWithin(ps.geom::geography, i.geom::geography, $2::double precision)
      WHERE ps.id = $1
        AND NOT EXISTS (SELECT 1 FROM public.pollution_source_interventions l WHERE l.pollution_source_id = ps.id AND l.intervention_id = i.id::text)
      ORDER BY distance_m ASC, i.updated_at DESC
      LIMIT 25;
    `, [sourceId, Number(intervention_distance_m || 1000)])
  ]);
  return {
    community_complaints: complaints.rows,
    water_quality_records: waterQuality.rows,
    interventions: interventions.rows
  };
}

async function geoJson({ risk_class = null, status = null } = {}) {
  const result = await pool.query(`
    SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(feature),'[]'::jsonb)) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type','Feature',
        'id', r.id,
        'geometry', ST_AsGeoJSON(r.geom)::jsonb,
        'properties', jsonb_build_object(
          'id', r.id,
          'source_code', r.source_code,
          'source_name', r.source_name,
          'type_name', r.type_name,
          'status', r.status,
          'risk_score', r.risk_score,
          'risk_class', r.risk_class,
          'dsd_name', r.dsd_name,
          'gnd_name', r.gnd_name,
          'sub_watershed_name', r.sub_watershed_name,
          'nearest_river_distance_m', r.nearest_river_distance_m,
          'last_inspection_date', r.last_inspection_date
        )
      ) AS feature
      FROM public.vw_pollution_source_risk r
      WHERE ($1::text IS NULL OR r.risk_class = $1)
        AND ($2::text IS NULL OR r.status = $2)
    ) x;
  `, [risk_class || null, status || null]);
  return result.rows[0].geojson;
}

module.exports = {
  listSourceTypes,
  listImpactLevels,
  listImpacts,
  listTreatmentMethods,
  dashboard,
  listSources,
  getSource,
  createSource,
  updateSource,
  deleteSource,
  listMonitoring,
  createMonitoring,
  listEnforcement,
  createEnforcement,
  getLinkages,
  linkCommunityIssue,
  unlinkCommunityIssue,
  linkWaterQuality,
  unlinkWaterQuality,
  linkIntervention,
  unlinkIntervention,
  suggestedLinkages,
  geoJson
};
