const pool = require('../../config/database');

function intValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function pct(part, total) {
  const p = intValue(part);
  const t = intValue(total);
  return t > 0 ? Math.round((p / t) * 100) : 0;
}

async function tableExists(tableName) {
  const result = await pool.query('SELECT to_regclass($1) AS table_name;', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function countInstitutions() {
  if (!await tableExists('intervention_institutions')) return 0;
  const result = await pool.query(`
    SELECT COUNT(*)::integer AS count
    FROM public.intervention_institutions
    WHERE COALESCE(active, true) = true
      AND COALESCE(is_deleted, false) = false;
  `);
  return intValue(result.rows[0]?.count);
}

async function countActiveVwmcs() {
  if (!await tableExists('vwmc_committees')) return 0;
  const result = await pool.query(`
    SELECT COUNT(*)::integer AS count
    FROM public.vwmc_committees
    WHERE COALESCE(active, true) = true;
  `);
  return intValue(result.rows[0]?.count);
}

async function countActiveVolunteerOrganisations() {
  if (!await tableExists('intervention_institutions')) return 0;
  const result = await pool.query(`
    SELECT COUNT(*)::integer AS count
    FROM public.intervention_institutions
    WHERE COALESCE(active, true) = true
      AND COALESCE(is_deleted, false) = false
      AND (
        LOWER(COALESCE(institution_type, '')) LIKE '%volunteer%'
        OR LOWER(COALESCE(institution_type, '')) LIKE '%community based%'
        OR LOWER(COALESCE(institution_type, '')) LIKE '%youth group%'
        OR LOWER(COALESCE(institution_type, '')) LIKE '%environmental ngo%'
        OR LOWER(COALESCE(institution_type, '')) LIKE '%civil society%'
      );
  `);
  return intValue(result.rows[0]?.count);
}

async function countPersons() {
  if (!await tableExists('persons')) return 0;
  const result = await pool.query('SELECT COUNT(*)::integer AS count FROM public.persons;');
  return intValue(result.rows[0]?.count);
}

async function governanceStrength() {
  const [institutions, activeVwmcs, activeVolunteerOrganisations, persons] = await Promise.all([
    countInstitutions(),
    countActiveVwmcs(),
    countActiveVolunteerOrganisations(),
    countPersons(),
  ]);

  return {
    institutions,
    active_vwmcs: activeVwmcs,
    active_volunteer_organisations: activeVolunteerOrganisations,
    persons,
  };
}

async function complaintsByCategory() {
  if (!await tableExists('community_issue_reports')) return [];
  const result = await pool.query(`
    SELECT COALESCE(c.category_name, r.other_category_name, 'Unclassified') AS label,
           COUNT(*)::integer AS count
    FROM public.community_issue_reports r
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
    GROUP BY COALESCE(c.category_name, r.other_category_name, 'Unclassified')
    ORDER BY count DESC, label
    LIMIT 8;
  `);
  return result.rows;
}

async function pollutionSourcesByType() {
  if (!await tableExists('pollution_sources')) return [];
  const result = await pool.query(`
    SELECT COALESCE(t.type_name, 'Unclassified') AS label,
           COUNT(*)::integer AS count
    FROM public.pollution_sources s
    LEFT JOIN public.pollution_source_types t ON t.id = s.source_type_id
    WHERE COALESCE(s.status, 'active') <> 'closed'
    GROUP BY COALESCE(t.type_name, 'Unclassified')
    ORDER BY count DESC, label
    LIMIT 8;
  `);
  return result.rows;
}

async function interventionsByType() {
  if (!await tableExists('intervention_registry')) return [];
  const result = await pool.query(`
    SELECT COALESCE(l.intervention_category, l.intervention_name, 'Unclassified') AS label,
           COUNT(*)::integer AS count
    FROM public.intervention_registry r
    LEFT JOIN public.intervention_library l ON l.id = r.library_id
    GROUP BY COALESCE(l.intervention_category, l.intervention_name, 'Unclassified')
    ORDER BY count DESC, label
    LIMIT 8;
  `);
  return result.rows;
}

async function programmesByActivityType() {
  if (!await tableExists('volunteer_catchment_programme_activities')) return [];
  const result = await pool.query(`
    SELECT COALESCE(t.activity_type_name, a.other_activity_type, 'Unclassified') AS label,
           COUNT(*)::integer AS count
    FROM public.volunteer_catchment_programme_activities a
    LEFT JOIN public.catchment_programme_activity_types t ON t.id = a.activity_type_id
    WHERE COALESCE(a.active, true) = true
    GROUP BY COALESCE(t.activity_type_name, a.other_activity_type, 'Unclassified')
    ORDER BY count DESC, label
    LIMIT 8;
  `);
  return result.rows;
}

async function operationalSignals() {
  const [complaints_by_category, pollution_sources_by_type, interventions_by_type, programmes_by_activity_type] = await Promise.all([
    complaintsByCategory(),
    pollutionSourcesByType(),
    interventionsByType(),
    programmesByActivityType(),
  ]);
  return { complaints_by_category, pollution_sources_by_type, interventions_by_type, programmes_by_activity_type };
}

async function waterQualityPerformance() {
  if (!await tableExists('water_quality_tests')) return { total_samples: 0, failed_samples: 0, failed_percent: 0 };
  const result = await pool.query(`
    SELECT COUNT(*)::integer AS total_samples,
           COUNT(*) FILTER (WHERE overall_status IN ('non_compliant', 'caution'))::integer AS failed_samples
    FROM public.water_quality_tests;
  `);
  const total = intValue(result.rows[0]?.total_samples);
  const failed = intValue(result.rows[0]?.failed_samples);
  return { total_samples: total, failed_samples: failed, failed_percent: pct(failed, total) };
}

async function complaintPerformance() {
  if (!await tableExists('community_issue_reports')) return { total_complaints: 0, complaints_30_days: 0, linked_complaints: 0, escalation_percent: 0 };
  const mappingExists = await tableExists('complaint_intervention_mapping');
  const sql = mappingExists ? `
    SELECT COUNT(*)::integer AS total_complaints,
           COUNT(*) FILTER (WHERE r.submitted_at >= now() - INTERVAL '30 days')::integer AS complaints_30_days,
           COUNT(DISTINCT cim.report_id)::integer AS linked_complaints
    FROM public.community_issue_reports r
    LEFT JOIN public.complaint_intervention_mapping cim
      ON cim.report_id = r.id
     AND cim.link_status IN ('active', 'under_review', 'resolved');
  ` : `
    SELECT COUNT(*)::integer AS total_complaints,
           COUNT(*) FILTER (WHERE submitted_at >= now() - INTERVAL '30 days')::integer AS complaints_30_days,
           0::integer AS linked_complaints
    FROM public.community_issue_reports;
  `;
  const result = await pool.query(sql);
  const total = intValue(result.rows[0]?.total_complaints);
  const linked = intValue(result.rows[0]?.linked_complaints);
  return {
    total_complaints: total,
    complaints_30_days: intValue(result.rows[0]?.complaints_30_days),
    linked_complaints: linked,
    escalation_percent: pct(linked, total),
  };
}

async function interventionPerformance() {
  if (!await tableExists('intervention_registry')) return { total_interventions: 0, ongoing_interventions: 0, completed_interventions: 0, completion_percent: 0 };
  const result = await pool.query(`
    SELECT COUNT(*)::integer AS total_interventions,
           COUNT(*) FILTER (
             WHERE LOWER(COALESCE(status, '')) IN ('planned', 'ongoing', 'in_progress', 'in progress', 'active', 'under_implementation', 'under implementation')
                OR (progress_percent IS NOT NULL AND progress_percent > 0 AND progress_percent < 100)
           )::integer AS ongoing_interventions,
           COUNT(*) FILTER (
             WHERE LOWER(COALESCE(status, '')) IN ('completed', 'complete', 'closed', 'done')
                OR progress_percent >= 100
           )::integer AS completed_interventions
    FROM public.intervention_registry;
  `);
  const total = intValue(result.rows[0]?.total_interventions);
  const completed = intValue(result.rows[0]?.completed_interventions);
  return {
    total_interventions: total,
    ongoing_interventions: intValue(result.rows[0]?.ongoing_interventions),
    completed_interventions: completed,
    completion_percent: pct(completed, total),
  };
}

async function pollutionMonitoringPerformance() {
  if (!await tableExists('pollution_sources')) return { active_sources: 0, monitored_sources_30_days: 0, monitoring_coverage_percent: 0 };
  const activeResult = await pool.query(`
    SELECT COUNT(*)::integer AS active_sources
    FROM public.pollution_sources
    WHERE COALESCE(status, 'active') <> 'closed';
  `);
  const active = intValue(activeResult.rows[0]?.active_sources);
  if (!await tableExists('pollution_source_monitoring')) return { active_sources: active, monitored_sources_30_days: 0, monitoring_coverage_percent: 0 };

  await pool.query(`ALTER TABLE public.pollution_source_monitoring ADD COLUMN IF NOT EXISTS reported_at timestamptz DEFAULT now();`);
  const result = await pool.query(`
    SELECT COUNT(DISTINCT pollution_source_id)::integer AS monitored_sources_30_days
    FROM public.pollution_source_monitoring
    WHERE COALESCE(reported_at, inspection_date::timestamptz, created_at) >= now() - INTERVAL '30 days';
  `);
  const monitored = intValue(result.rows[0]?.monitored_sources_30_days);
  return { active_sources: active, monitored_sources_30_days: monitored, monitoring_coverage_percent: pct(monitored, active) };
}

async function performanceKpis() {
  const [water_quality, complaints, interventions, pollution_monitoring] = await Promise.all([
    waterQualityPerformance(),
    complaintPerformance(),
    interventionPerformance(),
    pollutionMonitoringPerformance(),
  ]);
  return { water_quality, complaints, interventions, pollution_monitoring };
}

async function getCatchmentDashboard() {
  const [governance, operations, performance] = await Promise.all([
    governanceStrength(),
    operationalSignals(),
    performanceKpis(),
  ]);

  return {
    generated_at: new Date().toISOString(),
    window_days: 30,
    governance,
    operations,
    performance,
  };
}

module.exports = { getCatchmentDashboard, getCatchmentSummary: getCatchmentDashboard };
