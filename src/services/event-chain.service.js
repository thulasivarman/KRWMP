const pool = require('../../config/database');

async function queryOrEmpty(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    return [];
  }
}

async function getIntervention(interventionId) {
  const result = await pool.query(`
    SELECT ir.*, il.intervention_name AS library_name, il.intervention_category
    FROM public.intervention_registry ir
    LEFT JOIN public.intervention_library il ON il.id = ir.library_id
    WHERE ir.id = $1;
  `, [interventionId]);
  return result.rows[0] || null;
}

async function getComplaints(interventionId) {
  return queryOrEmpty(`
    SELECT
      cim.id AS mapping_id,
      cim.report_id,
      cim.intervention_id,
      cim.link_status,
      cim.link_note,
      cim.linked_by,
      cim.linked_at,
      r.report_code,
      r.issue_title,
      r.description,
      r.status AS report_status,
      r.severity_level,
      r.latitude,
      r.longitude,
      r.location_description,
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
}

async function getPollutionSources(interventionId) {
  return queryOrEmpty(`
    SELECT
      psi.pollution_source_id,
      psi.intervention_id,
      COALESCE(psi.link_type, 'direct') AS link_type,
      psi.linkage_note,
      psi.linked_by,
      psi.created_at AS linked_at,
      ps.source_code,
      ps.source_name,
      ps.description,
      ps.status,
      ps.location_description,
      ps.reported_date,
      pst.type_name,
      risk.risk_score,
      risk.risk_class,
      risk.dsd_name,
      risk.gnd_name,
      risk.sub_watershed_name,
      risk.nearest_river_distance_m,
      ST_Y(ps.geom) AS latitude,
      ST_X(ps.geom) AS longitude
    FROM public.pollution_source_interventions psi
    JOIN public.pollution_sources ps ON ps.id = psi.pollution_source_id
    LEFT JOIN public.pollution_source_types pst ON pst.id = ps.source_type_id
    LEFT JOIN public.vw_pollution_source_risk risk ON risk.id = ps.id
    WHERE psi.intervention_id = $1
    ORDER BY psi.created_at DESC;
  `, [interventionId]);
}

async function getTimeline(interventionId) {
  return queryOrEmpty(`
    SELECT t.*, p.full_name AS responsible_person_full_name, p.phone_number AS responsible_person_phone_number, p.email AS responsible_person_email
    FROM public.intervention_action_timeline t
    LEFT JOIN public.persons p ON p.id = t.responsible_person_id
    WHERE t.intervention_id = $1
    ORDER BY t.action_date DESC, t.created_at DESC;
  `, [interventionId]);
}

async function getMonitoring(sourceIds = []) {
  if (!sourceIds.length) return [];
  return queryOrEmpty(`
    SELECT
      m.*,
      ps.source_code,
      ps.source_name,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
        'treatment_method_id', tm.id,
        'method_name', tm.method_name,
        'recommendation', mt.recommendation,
        'implementation_status', mt.implementation_status
      )) FILTER (WHERE tm.id IS NOT NULL), '[]'::jsonb) AS treatments
    FROM public.pollution_source_monitoring m
    JOIN public.pollution_sources ps ON ps.id = m.pollution_source_id
    LEFT JOIN public.pollution_monitoring_treatments mt ON mt.monitoring_id = m.id
    LEFT JOIN public.pollution_treatment_methods tm ON tm.id = mt.treatment_method_id
    WHERE m.pollution_source_id = ANY($1::uuid[])
    GROUP BY m.id, ps.source_code, ps.source_name
    ORDER BY COALESCE(m.reported_at, m.created_at) DESC, m.inspection_date DESC;
  `, [sourceIds]);
}

async function getWaterQuality(sourceIds = []) {
  if (!sourceIds.length) return [];
  return queryOrEmpty(`
    SELECT
      l.pollution_source_id,
      l.water_quality_record_id,
      l.linkage_note,
      l.linked_by,
      l.created_at AS linked_at,
      ps.source_code,
      ps.source_name,
      t.sample_code,
      t.sample_location_name,
      t.sample_collection_datetime,
      t.collected_by,
      t.dsd_name,
      t.gnd_name,
      t.sub_watershed_name,
      t.overall_status,
      t.signed_report_pdf_url,
      t.remarks,
      t.latitude,
      t.longitude
    FROM public.pollution_source_water_quality_records l
    JOIN public.pollution_sources ps ON ps.id = l.pollution_source_id
    LEFT JOIN public.water_quality_tests t ON t.id = l.water_quality_record_id
    WHERE l.pollution_source_id = ANY($1::uuid[])
    ORDER BY t.sample_collection_datetime DESC NULLS LAST, l.created_at DESC;
  `, [sourceIds]);
}

function buildSummary({ intervention, complaints, pollutionSources, timeline, monitoring, waterQuality }) {
  const unresolvedComplaints = complaints.filter(item => !['resolved', 'closed', 'rejected'].includes(String(item.report_status || '').toLowerCase())).length;
  const activeSources = pollutionSources.filter(item => !['closed', 'resolved', 'inactive'].includes(String(item.status || '').toLowerCase())).length;
  const criticalSources = pollutionSources.filter(item => ['critical', 'high'].includes(String(item.risk_class || '').toLowerCase())).length;
  const latestAction = timeline[0] || null;
  const latestMonitoring = monitoring[0] || null;
  return {
    intervention_id: intervention.id,
    intervention_code: intervention.intervention_code,
    intervention_status: intervention.status,
    progress_percent: intervention.progress_percent,
    complaint_count: complaints.length,
    unresolved_complaint_count: unresolvedComplaints,
    pollution_source_count: pollutionSources.length,
    active_pollution_source_count: activeSources,
    critical_or_high_source_count: criticalSources,
    action_count: timeline.length,
    monitoring_record_count: monitoring.length,
    water_quality_record_count: waterQuality.length,
    latest_action_date: latestAction?.action_date || null,
    latest_monitoring_date: latestMonitoring?.inspection_date || latestMonitoring?.reported_at || null,
  };
}

async function getEventChain(interventionId) {
  const intervention = await getIntervention(interventionId);
  if (!intervention) return null;

  const [complaints, pollutionSources, timeline] = await Promise.all([
    getComplaints(interventionId),
    getPollutionSources(interventionId),
    getTimeline(interventionId),
  ]);

  const sourceIds = pollutionSources.map(source => source.pollution_source_id).filter(Boolean);
  const [monitoring, waterQuality] = await Promise.all([
    getMonitoring(sourceIds),
    getWaterQuality(sourceIds),
  ]);

  return {
    summary: buildSummary({ intervention, complaints, pollutionSources, timeline, monitoring, waterQuality }),
    intervention,
    complaints,
    pollution_sources: pollutionSources,
    timeline,
    monitoring,
    water_quality_records: waterQuality,
  };
}

async function listRelationshipRows({ status = null, dsd_name = null, gnd_name = null, limit = 500 } = {}) {
  const rowLimit = Math.max(1, Math.min(Number(limit || 500), 1000));
  return queryOrEmpty(`
    SELECT
      i.id AS intervention_id,
      i.intervention_code,
      i.intervention_title,
      i.status AS intervention_status,
      i.priority,
      i.progress_percent,
      i.dsd_name,
      i.gnd_name,
      cim.report_id AS community_issue_id,
      cir.report_code,
      cir.issue_title,
      cir.status AS complaint_status,
      psi.pollution_source_id,
      ps.source_code,
      ps.source_name,
      ps.status AS pollution_source_status,
      COALESCE(psi.link_type, 'direct') AS pollution_link_type,
      risk.risk_class,
      risk.risk_score,
      COUNT(t.id)::integer AS action_count
    FROM public.intervention_registry i
    LEFT JOIN public.complaint_intervention_mapping cim ON cim.intervention_id = i.id
    LEFT JOIN public.community_issue_reports cir ON cir.id = cim.report_id
    LEFT JOIN public.pollution_source_interventions psi ON psi.intervention_id = i.id
    LEFT JOIN public.pollution_sources ps ON ps.id = psi.pollution_source_id
    LEFT JOIN public.vw_pollution_source_risk risk ON risk.id = ps.id
    LEFT JOIN public.intervention_action_timeline t ON t.intervention_id = i.id
    WHERE ($1::text IS NULL OR i.status = $1)
      AND ($2::text IS NULL OR i.dsd_name = $2)
      AND ($3::text IS NULL OR i.gnd_name = $3)
    GROUP BY i.id, cim.report_id, cir.report_code, cir.issue_title, cir.status, psi.pollution_source_id, ps.source_code, ps.source_name, ps.status, psi.link_type, risk.risk_class, risk.risk_score
    ORDER BY i.updated_at DESC
    LIMIT $4;
  `, [status || null, dsd_name || null, gnd_name || null, rowLimit]);
}

module.exports = {
  getEventChain,
  listRelationshipRows,
};
