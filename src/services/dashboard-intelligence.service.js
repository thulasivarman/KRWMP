const pool = require('../../config/database');

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function healthClass(score) {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Moderate';
  if (score >= 40) return 'Degraded';
  return 'Critical';
}

async function complaintConversionRate() {
  const result = await pool.query(`
    WITH verified AS (
      SELECT id FROM public.community_issue_reports
      WHERE lower(COALESCE(status,'')) IN ('verified','assigned','converted_to_intervention','resolved','closed')
    ), converted AS (
      SELECT DISTINCT report_id AS id FROM public.complaint_intervention_mapping
    )
    SELECT COUNT(v.id)::integer AS verified_complaints,
           COUNT(c.id)::integer AS converted_complaints,
           ROUND((COUNT(c.id)::numeric / NULLIF(COUNT(v.id),0)) * 100, 2) AS conversion_rate_percent
    FROM verified v LEFT JOIN converted c ON c.id = v.id;
  `);
  const row = result.rows[0] || {};
  return { verified_complaints: Number(row.verified_complaints || 0), converted_complaints: Number(row.converted_complaints || 0), conversion_rate_percent: Number(row.conversion_rate_percent || 0) };
}

async function unresolvedHotspotDensity() {
  const result = await pool.query(`
    WITH unresolved AS (
      SELECT id, geom, severity_level FROM public.community_issue_reports
      WHERE geom IS NOT NULL AND lower(COALESCE(status,'')) NOT IN ('resolved','closed','rejected','converted_to_intervention')
    ), area AS (
      SELECT NULLIF(SUM(ST_Area(geom::geography)) / 1000000.0, 0) AS km2 FROM public.dsd_boundary
    ), density AS (
      SELECT COUNT(*)::integer AS unresolved_cases,
             COALESCE((SELECT km2 FROM area), 0) AS basin_area_km2,
             ROUND(CAST((COUNT(*)::numeric / NULLIF((SELECT km2 FROM area), 0)) AS numeric), 4) AS unresolved_density_per_km2
      FROM unresolved
    ), hotspots AS (
      SELECT id AS cluster_id, 1::integer AS case_count, severity_level AS severity_max, ST_X(geom) AS longitude, ST_Y(geom) AS latitude
      FROM unresolved
      ORDER BY severity_level DESC NULLS LAST, id DESC
      LIMIT 20
    )
    SELECT d.*, COALESCE(jsonb_agg(jsonb_build_object('cluster_id', h.cluster_id, 'case_count', h.case_count, 'severity_max', h.severity_max, 'longitude', h.longitude, 'latitude', h.latitude)) FILTER (WHERE h.cluster_id IS NOT NULL), '[]'::jsonb) AS hotspots
    FROM density d LEFT JOIN hotspots h ON true
    GROUP BY d.unresolved_cases, d.basin_area_km2, d.unresolved_density_per_km2;
  `);
  const row = result.rows[0] || {};
  return { unresolved_cases: Number(row.unresolved_cases || 0), basin_area_km2: Number(row.basin_area_km2 || 0), unresolved_density_per_km2: Number(row.unresolved_density_per_km2 || 0), hotspots: row.hotspots || [] };
}

async function pollutionRecurrenceIndex() {
  const result = await pool.query(`
    WITH linked AS (
      SELECT pollution_source_id, COUNT(DISTINCT intervention_id)::integer AS intervention_count FROM public.pollution_source_interventions GROUP BY pollution_source_id
    ), nearby AS (
      SELECT ps.id AS pollution_source_id, COUNT(c.id)::integer AS complaint_count
      FROM public.pollution_sources ps
      LEFT JOIN public.community_issue_reports c ON c.geom IS NOT NULL AND ps.geom IS NOT NULL AND ST_DWithin(c.geom::geography, ps.geom::geography, 200)
      GROUP BY ps.id
    ), combined AS (
      SELECT ps.id, ps.source_code, ps.source_name, ps.status, COALESCE(l.intervention_count,0) AS intervention_count, COALESCE(n.complaint_count,0) AS complaint_count,
             COALESCE(l.intervention_count,0) + COALESCE(n.complaint_count,0) AS recurrence_count
      FROM public.pollution_sources ps
      LEFT JOIN linked l ON l.pollution_source_id = ps.id
      LEFT JOIN nearby n ON n.pollution_source_id = ps.id
    )
    SELECT COUNT(*)::integer AS total_sources,
           COUNT(*) FILTER (WHERE recurrence_count >= 2)::integer AS recurring_sources,
           ROUND((COUNT(*) FILTER (WHERE recurrence_count >= 2)::numeric / NULLIF(COUNT(*),0)) * 100, 2) AS recurrence_index_percent,
           COALESCE(jsonb_agg(jsonb_build_object('pollution_source_id', id, 'source_code', source_code, 'source_name', source_name, 'status', status, 'recurrence_count', recurrence_count, 'intervention_count', intervention_count, 'complaint_count', complaint_count, 'recurrence_class', CASE WHEN recurrence_count >= 5 THEN 'Chronic' WHEN recurrence_count >= 2 THEN 'Recurring' ELSE 'Stable' END) ORDER BY recurrence_count DESC) FILTER (WHERE recurrence_count >= 2), '[]'::jsonb) AS recurring_sources_list
    FROM combined;
  `);
  const row = result.rows[0] || {};
  return { total_sources: Number(row.total_sources || 0), recurring_sources: Number(row.recurring_sources || 0), recurrence_index_percent: Number(row.recurrence_index_percent || 0), recurring_sources_list: row.recurring_sources_list || [] };
}

async function interventionEffectiveness() {
  const result = await pool.query(`
    WITH base AS (
      SELECT r.id, r.intervention_code, r.intervention_title, r.status,
             COALESCE(ROUND(AVG(COALESCE(t.progress_percent,0)))::integer, COALESCE(r.progress_percent,0), 0) AS progress_percent,
             COUNT(DISTINCT t.id)::integer AS action_count,
             COUNT(DISTINCT cim.report_id)::integer AS linked_complaints,
             COUNT(DISTINCT psi.pollution_source_id)::integer AS linked_pollution_sources,
             COUNT(DISTINCT iwq.water_quality_record_id)::integer AS linked_water_quality_records
      FROM public.intervention_registry r
      LEFT JOIN public.intervention_action_timeline t ON t.intervention_id = r.id
      LEFT JOIN public.complaint_intervention_mapping cim ON cim.intervention_id = r.id
      LEFT JOIN public.pollution_source_interventions psi ON psi.intervention_id = r.id
      LEFT JOIN public.intervention_water_quality_records iwq ON iwq.intervention_id = r.id
      GROUP BY r.id
    ), scored AS (
      SELECT *, ROUND(CAST(LEAST(100, GREATEST(0, progress_percent * 0.55 + CASE WHEN lower(COALESCE(status,''))='completed' THEN 25 WHEN lower(COALESCE(status,''))='ongoing' THEN 12 ELSE 0 END + LEAST(action_count,5) * 4)) AS numeric), 2) AS effectiveness_score
      FROM base
    )
    SELECT COUNT(*)::integer AS total_interventions,
           ROUND(AVG(effectiveness_score), 2) AS average_effectiveness_score,
           COUNT(*) FILTER (WHERE effectiveness_score >= 70)::integer AS effective_count,
           COUNT(*) FILTER (WHERE effectiveness_score >= 40 AND effectiveness_score < 70)::integer AS moderate_count,
           COUNT(*) FILTER (WHERE effectiveness_score < 40)::integer AS weak_count,
           COALESCE(jsonb_agg(jsonb_build_object('intervention_id', id, 'intervention_code', intervention_code, 'intervention_title', intervention_title, 'status', status, 'progress_percent', progress_percent, 'action_count', action_count, 'linked_complaints', linked_complaints, 'linked_pollution_sources', linked_pollution_sources, 'linked_water_quality_records', linked_water_quality_records, 'effectiveness_score', effectiveness_score, 'effectiveness_class', CASE WHEN effectiveness_score >= 70 THEN 'Effective' WHEN effectiveness_score >= 40 THEN 'Moderate' ELSE 'Weak' END) ORDER BY effectiveness_score DESC), '[]'::jsonb) AS interventions
    FROM scored;
  `);
  const row = result.rows[0] || {};
  return { total_interventions: Number(row.total_interventions || 0), average_effectiveness_score: Number(row.average_effectiveness_score || 0), effective_count: Number(row.effective_count || 0), moderate_count: Number(row.moderate_count || 0), weak_count: Number(row.weak_count || 0), interventions: row.interventions || [] };
}

async function waterQualityPressureScore() {
  const result = await pool.query(`SELECT COUNT(*)::integer AS total_tests, COUNT(*) FILTER (WHERE lower(COALESCE(overall_status,'')) IN ('poor','bad','critical','unsafe','failed','exceedance','polluted'))::integer AS poor_tests FROM public.water_quality_tests;`);
  const row = result.rows[0] || {};
  const total = Number(row.total_tests || 0);
  const poor = Number(row.poor_tests || 0);
  return { total_tests: total, poor_tests: poor, pressure_score: clampScore(total ? (poor / total) * 100 : 0) };
}

async function watershedHealthScore(parts = null) {
  const metrics = parts || { conversion: await complaintConversionRate(), unresolved: await unresolvedHotspotDensity(), recurrence: await pollutionRecurrenceIndex(), effectiveness: await interventionEffectiveness(), water_quality: await waterQualityPressureScore() };
  const complaintPressure = Math.min(100, Number(metrics.unresolved.unresolved_density_per_km2 || 0) * 10);
  const pollutionPressure = Number(metrics.recurrence.recurrence_index_percent || 0);
  const waterPressure = Number(metrics.water_quality.pressure_score || 0);
  const interventionSuccess = Number(metrics.effectiveness.average_effectiveness_score || 0);
  const conversion = Number(metrics.conversion.conversion_rate_percent || 0);
  const health = clampScore((100 - complaintPressure) * 0.20 + (100 - pollutionPressure) * 0.25 + (100 - waterPressure) * 0.25 + interventionSuccess * 0.20 + conversion * 0.10);
  return { watershed_health_score: health, health_class: healthClass(health), components: { complaint_pressure_score: clampScore(complaintPressure), pollution_recurrence_pressure_score: clampScore(pollutionPressure), water_quality_pressure_score: clampScore(waterPressure), intervention_success_score: clampScore(interventionSuccess), complaint_conversion_score: clampScore(conversion) }, weights: { complaint_pressure: 0.20, pollution_recurrence: 0.25, water_quality: 0.25, intervention_success: 0.20, complaint_conversion: 0.10 } };
}

async function summary() {
  const conversion = await complaintConversionRate();
  const unresolved = await unresolvedHotspotDensity();
  const recurrence = await pollutionRecurrenceIndex();
  const effectiveness = await interventionEffectiveness();
  const water_quality = await waterQualityPressureScore();
  const health = await watershedHealthScore({ conversion, unresolved, recurrence, effectiveness, water_quality });
  return { generated_at: new Date().toISOString(), watershed_health: health, complaint_conversion: conversion, unresolved_hotspot_density: unresolved, pollution_recurrence: recurrence, intervention_effectiveness: effectiveness, water_quality_pressure: water_quality };
}

module.exports = { complaintConversionRate, unresolvedHotspotDensity, pollutionRecurrenceIndex, interventionEffectiveness, waterQualityPressureScore, watershedHealthScore, summary };
