const pool = require('../../config/database');

function toInteger(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

async function tableExists(tableName) {
  const result = await pool.query('SELECT to_regclass($1) AS table_name;', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

async function waterQualitySummary() {
  if (!await tableExists('water_quality_tests')) {
    return { total_samples: 0, failed_samples: 0, failed_percent: 0 };
  }

  const result = await pool.query(`
    SELECT
      COUNT(*)::integer AS total_samples,
      COUNT(*) FILTER (WHERE overall_status IN ('non_compliant', 'caution'))::integer AS failed_samples
    FROM public.water_quality_tests;
  `);

  const row = result.rows[0] || {};
  const totalSamples = toInteger(row.total_samples);
  const failedSamples = toInteger(row.failed_samples);
  const failedPercent = totalSamples > 0 ? Math.round((failedSamples / totalSamples) * 100) : 0;

  return { total_samples: totalSamples, failed_samples: failedSamples, failed_percent: failedPercent };
}

async function communityComplaintSummary() {
  if (!await tableExists('community_issue_reports')) {
    return { complaints_30_days: 0, linked_complaints: 0 };
  }

  const mappingExists = await tableExists('complaint_intervention_mapping');
  const result = await pool.query(mappingExists ? `
    SELECT
      COUNT(*) FILTER (WHERE r.submitted_at >= now() - INTERVAL '30 days')::integer AS complaints_30_days,
      COUNT(DISTINCT cim.report_id)::integer AS linked_complaints
    FROM public.community_issue_reports r
    LEFT JOIN public.complaint_intervention_mapping cim
      ON cim.report_id = r.id
     AND cim.link_status IN ('active', 'under_review', 'resolved');
  ` : `
    SELECT
      COUNT(*) FILTER (WHERE submitted_at >= now() - INTERVAL '30 days')::integer AS complaints_30_days,
      0::integer AS linked_complaints
    FROM public.community_issue_reports;
  `);

  return {
    complaints_30_days: toInteger(result.rows[0]?.complaints_30_days),
    linked_complaints: toInteger(result.rows[0]?.linked_complaints),
  };
}

async function interventionSummary() {
  if (!await tableExists('intervention_registry')) {
    return { ongoing_interventions: 0 };
  }

  const result = await pool.query(`
    SELECT COUNT(*)::integer AS ongoing_interventions
    FROM public.intervention_registry
    WHERE lower(COALESCE(status, '')) IN ('planned', 'ongoing', 'in_progress', 'in progress', 'active', 'under_implementation', 'under implementation')
       OR (progress_percent IS NOT NULL AND progress_percent > 0 AND progress_percent < 100);
  `);

  return { ongoing_interventions: toInteger(result.rows[0]?.ongoing_interventions) };
}

async function ensurePollutionMonitoringColumns() {
  await pool.query(`
    ALTER TABLE public.pollution_source_monitoring
      ADD COLUMN IF NOT EXISTS reported_at timestamptz DEFAULT now();
  `);
}

async function pollutionMonitoringSummary() {
  const monitoringExists = await tableExists('pollution_source_monitoring');
  if (!monitoringExists) return { monitored_sources_30_days: 0 };

  await ensurePollutionMonitoringColumns();

  const result = await pool.query(`
    SELECT COUNT(DISTINCT pollution_source_id)::integer AS monitored_sources_30_days
    FROM public.pollution_source_monitoring
    WHERE COALESCE(reported_at, inspection_date::timestamptz, created_at) >= now() - INTERVAL '30 days';
  `);

  return { monitored_sources_30_days: toInteger(result.rows[0]?.monitored_sources_30_days) };
}

async function getCatchmentSummary() {
  const [water_quality, community, interventions, pollution] = await Promise.all([
    waterQualitySummary(),
    communityComplaintSummary(),
    interventionSummary(),
    pollutionMonitoringSummary(),
  ]);

  return {
    generated_at: new Date().toISOString(),
    window_days: 30,
    water_quality,
    community,
    interventions,
    pollution,
  };
}

module.exports = { getCatchmentSummary };
