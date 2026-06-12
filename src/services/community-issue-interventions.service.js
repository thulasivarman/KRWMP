const pool = require('../../config/database');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toLimit(value, fallback = 20) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

async function listInterventionsForComplaint(reportId) {
  const result = await pool.query(`
    SELECT
      cim.id AS mapping_id,
      cim.report_id,
      cim.intervention_id,
      cim.link_status,
      cim.link_note,
      cim.linked_by,
      cim.linked_at,
      cim.updated_by,
      cim.updated_at,
      ir.intervention_code,
      ir.intervention_title,
      ir.status AS intervention_status,
      ir.priority,
      ir.progress_percent,
      ir.dsd_name,
      ir.gnd_name,
      ir.implementing_office,
      ir.lead_officer_name,
      il.intervention_name AS library_name,
      il.intervention_category
    FROM public.complaint_intervention_mapping cim
    JOIN public.intervention_registry ir ON ir.id = cim.intervention_id
    LEFT JOIN public.intervention_library il ON il.id = ir.library_id
    WHERE cim.report_id = $1
    ORDER BY cim.linked_at DESC;
  `, [reportId]);
  return result.rows;
}

async function listComplaintsForIntervention(interventionId) {
  const result = await pool.query(`
    SELECT
      cim.id AS mapping_id,
      cim.report_id,
      cim.intervention_id,
      cim.link_status,
      cim.link_note,
      cim.linked_by,
      cim.linked_at,
      cim.updated_by,
      cim.updated_at,
      r.report_code,
      r.issue_title,
      r.description,
      r.status AS report_status,
      r.severity_level,
      r.latitude,
      r.longitude,
      r.location_description,
      r.photo_url,
      r.submitted_at,
      c.category_name,
      si.issue_name
    FROM public.complaint_intervention_mapping cim
    JOIN public.community_issue_reports r ON r.id = cim.report_id
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
    LEFT JOIN public.specific_issues si ON si.id = r.issue_id
    WHERE cim.intervention_id = $1
    ORDER BY cim.linked_at DESC;
  `, [interventionId]);
  return result.rows;
}

async function createMapping(body = {}, user = 'system') {
  const reportId = body.report_id || body.complaint_id || body.community_issue_id;
  const interventionId = body.intervention_id;
  if (!reportId) throw new Error('Community issue report is required.');
  if (!interventionId) throw new Error('Intervention is required.');

  const result = await pool.query(`
    INSERT INTO public.complaint_intervention_mapping
      (report_id, intervention_id, link_status, link_note, linked_by, updated_by)
    VALUES ($1, $2, COALESCE($3, 'active'), $4, $5, $5)
    ON CONFLICT (report_id, intervention_id) DO UPDATE SET
      link_status = EXCLUDED.link_status,
      link_note = COALESCE(EXCLUDED.link_note, public.complaint_intervention_mapping.link_note),
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
    RETURNING *;
  `, [reportId, interventionId, body.link_status || null, cleanText(body.link_note), user]);
  return result.rows[0];
}

async function updateMapping(mappingId, body = {}, user = 'system') {
  const result = await pool.query(`
    UPDATE public.complaint_intervention_mapping
    SET link_status = COALESCE($2, link_status),
        link_note = COALESCE($3, link_note),
        updated_by = $4,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [mappingId, body.link_status || null, cleanText(body.link_note), user]);
  return result.rows[0] || null;
}

async function deleteMapping(mappingId) {
  const result = await pool.query('DELETE FROM public.complaint_intervention_mapping WHERE id = $1 RETURNING id;', [mappingId]);
  return result.rowCount > 0;
}

async function searchInterventions({ q = null, status = null, limit = 20 } = {}) {
  const result = await pool.query(`
    SELECT
      ir.id,
      ir.intervention_code,
      ir.intervention_title,
      ir.status,
      ir.priority,
      ir.progress_percent,
      ir.dsd_name,
      ir.gnd_name,
      ir.implementing_office,
      ir.lead_officer_name,
      il.intervention_name AS library_name,
      il.intervention_category
    FROM public.intervention_registry ir
    LEFT JOIN public.intervention_library il ON il.id = ir.library_id
    WHERE ($1::text IS NULL OR ir.status = $1)
      AND (
        $2::text IS NULL OR
        ir.intervention_title ILIKE '%' || $2 || '%' OR
        ir.intervention_code ILIKE '%' || $2 || '%' OR
        ir.location_name ILIKE '%' || $2 || '%' OR
        ir.village_name ILIKE '%' || $2 || '%' OR
        ir.dsd_name ILIKE '%' || $2 || '%' OR
        ir.gnd_name ILIKE '%' || $2 || '%' OR
        ir.implementing_office ILIKE '%' || $2 || '%'
      )
    ORDER BY ir.updated_at DESC
    LIMIT $3;
  `, [status || null, cleanText(q), toLimit(limit)]);
  return result.rows;
}

async function searchReports({ q = null, status = null, limit = 20 } = {}) {
  const result = await pool.query(`
    SELECT
      r.id,
      r.report_code,
      r.issue_title,
      r.description,
      r.status,
      r.severity_level,
      r.latitude,
      r.longitude,
      r.location_description,
      r.submitted_at,
      c.category_name,
      si.issue_name
    FROM public.community_issue_reports r
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
    LEFT JOIN public.specific_issues si ON si.id = r.issue_id
    WHERE ($1::text IS NULL OR r.status = $1)
      AND (
        $2::text IS NULL OR
        r.report_code ILIKE '%' || $2 || '%' OR
        r.issue_title ILIKE '%' || $2 || '%' OR
        r.description ILIKE '%' || $2 || '%' OR
        r.location_description ILIKE '%' || $2 || '%' OR
        c.category_name ILIKE '%' || $2 || '%' OR
        si.issue_name ILIKE '%' || $2 || '%'
      )
    ORDER BY r.submitted_at DESC
    LIMIT $3;
  `, [status || null, cleanText(q), toLimit(limit)]);
  return result.rows;
}

module.exports = {
  listInterventionsForComplaint,
  listComplaintsForIntervention,
  createMapping,
  updateMapping,
  deleteMapping,
  searchInterventions,
  searchReports,
};
