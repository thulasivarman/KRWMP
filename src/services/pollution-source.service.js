const pool = require('../../config/database');
const personService = require('./person.service');

let enhancedSchemaReady = false;

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

async function ensureEnhancedSchema() {
  if (enhancedSchemaReady) return;
  await pool.query(`
    ALTER TABLE public.pollution_sources
      ADD COLUMN IF NOT EXISTS overseeing_institution text,
      ADD COLUMN IF NOT EXISTS source_contact_person_id uuid,
      ADD COLUMN IF NOT EXISTS source_evidence_url text;

    ALTER TABLE public.pollution_source_monitoring
      ADD COLUMN IF NOT EXISTS current_status text,
      ADD COLUMN IF NOT EXISTS action_recommendation text,
      ADD COLUMN IF NOT EXISTS action_recommendation_other text,
      ADD COLUMN IF NOT EXISTS reported_at timestamptz DEFAULT now(),
      ADD COLUMN IF NOT EXISTS reporting_userid text;
  `);
  enhancedSchemaReady = true;
}

function personIdFromMatches(matches = []) {
  const strong = matches.find(match => {
    const reasons = Array.isArray(match.match_reasons) ? match.match_reasons : [];
    return reasons.includes('phone_exact') || reasons.includes('email_exact') || reasons.includes('nic_exact') || Number(match.match_score || 0) >= 85;
  });
  return strong?.id || null;
}

async function resolveContactPerson(body = {}) {
  const explicitId = cleanText(body.source_contact_person_id || body.contact_person_id);
  if (explicitId) return explicitId;

  const fullName = cleanText(body.contact_person_name || body.source_contact_person_name);
  const phone = cleanText(body.contact_person_phone || body.source_contact_person_phone);
  const email = cleanText(body.contact_person_email || body.source_contact_person_email);
  if (!fullName && !phone && !email) return null;

  const candidate = {
    full_name: fullName || 'Pollution Source Contact',
    phone_number: phone,
    email,
    address: cleanText(body.location_description),
  };
  const matches = await personService.detectPossibleDuplicates(candidate);
  const existingId = personIdFromMatches(matches);
  if (existingId) return existingId;
  const person = await personService.createPerson(candidate);
  return person?.id || null;
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
    dsd_hotspots: [],
    immediate_action_required: actionList.rows,
  };
}

async function listSources({ status = null, risk_class = null, source_type_id = null, q = null, limit = 100 } = {}) {
  await ensureEnhancedSchema();
  const result = await pool.query(`
    SELECT r.*, ps.overseeing_institution, ps.source_contact_person_id,
           cp.full_name AS source_contact_person_name, cp.phone_number AS source_contact_person_phone, cp.email AS source_contact_person_email,
           ST_Y(r.geom) AS latitude, ST_X(r.geom) AS longitude
    FROM public.vw_pollution_source_risk r
    LEFT JOIN public.pollution_sources ps ON ps.id = r.id
    LEFT JOIN public.persons cp ON cp.id = ps.source_contact_person_id
    WHERE ($1::text IS NULL OR r.status = $1)
      AND ($2::text IS NULL OR r.risk_class = $2)
      AND ($3::uuid IS NULL OR ps.source_type_id = $3)
      AND ($4::text IS NULL OR r.source_code ILIKE '%' || $4 || '%' OR r.source_name ILIKE '%' || $4 || '%' OR r.dsd_name ILIKE '%' || $4 || '%' OR r.gnd_name ILIKE '%' || $4 || '%' OR ps.overseeing_institution ILIKE '%' || $4 || '%' OR cp.full_name ILIKE '%' || $4 || '%')
    ORDER BY r.risk_score DESC NULLS LAST, r.source_name
    LIMIT LEAST(GREATEST($5::integer, 1), 500);
  `, [status, risk_class, source_type_id || null, cleanText(q), Number(limit || 100)]);
  return result.rows;
}

async function getSource(id) {
  await ensureEnhancedSchema();
  const source = await pool.query(`
    SELECT ps.*, pst.type_name, pst.default_weight, r.risk_score, r.risk_class, r.last_inspection_date,
           ST_Y(ps.geom) AS latitude, ST_X(ps.geom) AS longitude,
           cp.full_name AS source_contact_person_name, cp.phone_number AS source_contact_person_phone, cp.email AS source_contact_person_email
    FROM public.pollution_sources ps
    JOIN public.pollution_source_types pst ON pst.id = ps.source_type_id
    LEFT JOIN public.vw_pollution_source_risk r ON r.id = ps.id
    LEFT JOIN public.persons cp ON cp.id = ps.source_contact_person_id
    WHERE ps.id = $1;
  `, [id]);
  if (!source.rows[0]) return null;
  const [monitoring, enforcement, linkages] = await Promise.all([listMonitoring(id), listEnforcement(id), getLinkages(id)]);
  return { ...source.rows[0], monitoring, enforcement, linkages };
}

async function createSource(body = {}, user = 'system') {
  await ensureEnhancedSchema();
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  validateCoordinates(latitude, longitude);
  const sourceName = cleanText(body.source_name);
  if (!sourceName || sourceName.length < 3) throw new Error('Pollution source name must be at least 3 characters.');
  if (!body.source_type_id) throw new Error('Source type is required.');
  const contactPersonId = await resolveContactPerson(body);
  const result = await pool.query(`
    INSERT INTO public.pollution_sources
      (source_code, source_name, source_type_id, description, status, location_description, geom, reported_date, overseeing_institution, source_contact_person_id, source_evidence_url, created_by, updated_by)
    VALUES
      ($1,$2,$3,$4,$5,$6,ST_SetSRID(ST_MakePoint($7::double precision,$8::double precision),4326),COALESCE($9::date,CURRENT_DATE),$10,$11,$12,$13,$13)
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
    cleanText(body.overseeing_institution),
    contactPersonId,
    cleanText(body.source_evidence_url || body.evidence_url),
    user,
  ]);
  return getSource(result.rows[0].id);
}

async function updateSource(id, body = {}, user = 'system') {
  await ensureEnhancedSchema();
  const existing = await getSource(id);
  if (!existing) return null;
  const latitude = toNumber(body.latitude ?? existing.latitude);
  const longitude = toNumber(body.longitude ?? existing.longitude);
  validateCoordinates(latitude, longitude);
  const contactPersonId = await resolveContactPerson(body);
  const result = await pool.query(`
    UPDATE public.pollution_sources
    SET source_name = COALESCE($2, source_name),
        source_type_id = COALESCE($3, source_type_id),
        description = COALESCE($4, description),
        status = COALESCE($5, status),
        location_description = COALESCE($6, location_description),
        geom = ST_SetSRID(ST_MakePoint($7::double precision,$8::double precision),4326),
        reported_date = COALESCE($9::date, reported_date),
        overseeing_institution = COALESCE($10, overseeing_institution),
        source_contact_person_id = COALESCE($11, source_contact_person_id),
        source_evidence_url = COALESCE($12, source_evidence_url),
        updated_by = $13,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, cleanText(body.source_name), body.source_type_id || null, cleanText(body.description), body.status || null, cleanText(body.location_description), longitude, latitude, body.reported_date || null, cleanText(body.overseeing_institution), contactPersonId, cleanText(body.source_evidence_url || body.evidence_url), user]);
  if (!result.rows[0]) return null;
  return getSource(id);
}

async function deleteSource(id, user = 'system') {
  const result = await pool.query(`UPDATE public.pollution_sources SET status = 'closed', updated_by = $2, updated_at = now() WHERE id = $1 RETURNING id;`, [id, user]);
  return result.rowCount > 0;
}

async function listMonitoring(sourceId) {
  await ensureEnhancedSchema();
  const result = await pool.query(`
    SELECT m.*,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'treatment_method_id', tm.id,
        'method_name', tm.method_name,
        'recommendation', mt.recommendation,
        'implementation_status', mt.implementation_status
      )) FILTER (WHERE tm.id IS NOT NULL), '[]'::jsonb) AS treatments
    FROM public.pollution_source_monitoring m
    LEFT JOIN public.pollution_monitoring_treatments mt ON mt.monitoring_id = m.id
    LEFT JOIN public.pollution_treatment_methods tm ON tm.id = mt.treatment_method_id
    WHERE m.pollution_source_id = $1
    GROUP BY m.id
    ORDER BY COALESCE(m.reported_at, m.created_at) DESC, m.inspection_date DESC;
  `, [sourceId]);
  return result.rows;
}

async function createMonitoring(sourceId, body = {}, user = 'system') {
  await ensureEnhancedSchema();
  const treatmentIds = normalizeArray(body.treatment_method_ids || body.action_recommendation_ids);
  const currentStatus = cleanText(body.current_status);
  const otherRecommendation = cleanText(body.action_recommendation_other || body.other_recommendation);
  const recommendation = cleanText(body.action_recommendation || body.recommendation) || otherRecommendation;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`
      INSERT INTO public.pollution_source_monitoring
        (pollution_source_id, inspection_date, inspected_by, inspection_agency, observation_summary, evidence_url, photo_url,
         follow_up_required, follow_up_deadline, follow_up_status, water_quality_exceedance, repeat_offender, current_status,
         action_recommendation, action_recommendation_other, reported_at, reporting_userid, created_by)
      VALUES ($1,COALESCE($2::date,CURRENT_DATE),$3,$4,$5,$6,$7,$8,$9::date,$10,$11,$12,$13,$14,$15,now(),$16,$16)
      RETURNING *;
    `, [
      sourceId,
      body.inspection_date || null,
      cleanText(body.inspected_by),
      cleanText(body.inspection_agency),
      cleanText(body.observation_summary || body.monitoring_notes),
      cleanText(body.evidence_url),
      cleanText(body.photo_url),
      currentStatus === 'Actions Need' || toBool(body.follow_up_required, false),
      body.follow_up_deadline || null,
      body.follow_up_status || (currentStatus === 'Actions Need' ? 'pending' : 'not_required'),
      toBool(body.water_quality_exceedance, false),
      toBool(body.repeat_offender, false),
      currentStatus,
      recommendation,
      otherRecommendation,
      user,
    ]);
    for (const treatmentId of treatmentIds) {
      await client.query(`
        INSERT INTO public.pollution_monitoring_treatments (monitoring_id, treatment_method_id, recommendation, implementation_status)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (monitoring_id, treatment_method_id) DO UPDATE SET recommendation = EXCLUDED.recommendation, implementation_status = EXCLUDED.implementation_status;
      `, [inserted.rows[0].id, treatmentId, recommendation, body.implementation_status || 'recommended']);
    }
    await client.query('COMMIT');
    return { source: await getSource(sourceId), monitoring: inserted.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listEnforcement(sourceId) {
  const result = await pool.query(`SELECT * FROM public.pollution_enforcement_notices WHERE pollution_source_id = $1 ORDER BY notice_date DESC, created_at DESC;`, [sourceId]);
  return result.rows;
}

async function createEnforcement(sourceId, body = {}, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.pollution_enforcement_notices
      (pollution_source_id, notice_no, notice_date, issued_by_agency, notice_type, compliance_deadline, agency_response, response_date, closure_status, closure_date, remarks, created_by)
    VALUES ($1,$2,COALESCE($3::date,CURRENT_DATE),$4,$5,$6::date,$7,$8::date,$9,$10::date,$11,$12)
    RETURNING *;
  `, [sourceId, cleanText(body.notice_no), body.notice_date || null, cleanText(body.issued_by_agency), body.notice_type || 'warning', body.compliance_deadline || null, cleanText(body.agency_response), body.response_date || null, body.closure_status || 'open', body.closure_date || null, cleanText(body.remarks), user]);
  return result.rows[0];
}

async function getLinkages(sourceId) {
  const [complaints, waterQuality, interventions] = await Promise.all([
    pool.query(`SELECT * FROM public.pollution_source_community_issues WHERE pollution_source_id = $1 ORDER BY created_at DESC;`, [sourceId]).catch(() => ({ rows: [] })),
    pool.query(`SELECT * FROM public.pollution_source_water_quality_records WHERE pollution_source_id = $1 ORDER BY created_at DESC;`, [sourceId]).catch(() => ({ rows: [] })),
    pool.query(`SELECT * FROM public.pollution_source_interventions WHERE pollution_source_id = $1 ORDER BY created_at DESC;`, [sourceId]).catch(() => ({ rows: [] })),
  ]);
  return { community_complaints: complaints.rows, water_quality_records: waterQuality.rows, interventions: interventions.rows };
}

async function linkCommunityIssue(sourceId, issueId, note = null, user = 'system') {
  const result = await pool.query(`INSERT INTO public.pollution_source_community_issues (pollution_source_id, community_issue_id, linkage_note, linked_by) VALUES ($1,$2,$3,$4) ON CONFLICT (pollution_source_id, community_issue_id) DO UPDATE SET linkage_note = EXCLUDED.linkage_note, linked_by = EXCLUDED.linked_by, created_at = now() RETURNING *;`, [sourceId, String(issueId), cleanText(note), user]);
  return result.rows[0];
}
async function unlinkCommunityIssue(sourceId, issueId) { const result = await pool.query('DELETE FROM public.pollution_source_community_issues WHERE pollution_source_id = $1 AND community_issue_id = $2;', [sourceId, String(issueId)]); return result.rowCount > 0; }
async function linkWaterQuality(sourceId, recordId, note = null, user = 'system') { const result = await pool.query(`INSERT INTO public.pollution_source_water_quality_records (pollution_source_id, water_quality_record_id, linkage_note, linked_by) VALUES ($1,$2,$3,$4) ON CONFLICT (pollution_source_id, water_quality_record_id) DO UPDATE SET linkage_note = EXCLUDED.linkage_note, linked_by = EXCLUDED.linked_by, created_at = now() RETURNING *;`, [sourceId, String(recordId), cleanText(note), user]); return result.rows[0]; }
async function unlinkWaterQuality(sourceId, recordId) { const result = await pool.query('DELETE FROM public.pollution_source_water_quality_records WHERE pollution_source_id = $1 AND water_quality_record_id = $2;', [sourceId, String(recordId)]); return result.rowCount > 0; }
async function linkIntervention(sourceId, interventionId, note = null, user = 'system') { const result = await pool.query(`INSERT INTO public.pollution_source_interventions (pollution_source_id, intervention_id, linkage_note, linked_by) VALUES ($1,$2,$3,$4) ON CONFLICT (pollution_source_id, intervention_id) DO UPDATE SET linkage_note = EXCLUDED.linkage_note, linked_by = EXCLUDED.linked_by, created_at = now() RETURNING *;`, [sourceId, String(interventionId), cleanText(note), user]); return result.rows[0]; }
async function unlinkIntervention(sourceId, interventionId) { const result = await pool.query('DELETE FROM public.pollution_source_interventions WHERE pollution_source_id = $1 AND intervention_id = $2;', [sourceId, String(interventionId)]); return result.rowCount > 0; }

async function suggestedLinkages() { return { community_complaints: [], water_quality_records: [], interventions: [] }; }

async function geoJson({ risk_class = null, status = null } = {}) {
  const result = await pool.query(`
    SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(feature),'[]'::jsonb)) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type','Feature', 'id', r.id, 'geometry', ST_AsGeoJSON(r.geom)::jsonb,
        'properties', jsonb_build_object('id', r.id, 'source_code', r.source_code, 'source_name', r.source_name, 'type_name', r.type_name, 'status', r.status, 'risk_score', r.risk_score, 'risk_class', r.risk_class, 'dsd_name', r.dsd_name, 'gnd_name', r.gnd_name, 'sub_watershed_name', r.sub_watershed_name, 'nearest_river_distance_m', r.nearest_river_distance_m, 'last_inspection_date', r.last_inspection_date)
      ) AS feature
      FROM public.vw_pollution_source_risk r
      WHERE ($1::text IS NULL OR r.risk_class = $1) AND ($2::text IS NULL OR r.status = $2)
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
  geoJson,
};
