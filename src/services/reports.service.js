const pool = require('../../config/database');

function parseFilters(query = {}, dateColumn = 'updated_at') {
  const filters = [];
  const values = [];
  if (query.status) {
    values.push(query.status);
    filters.push(`r.status = $${values.length}`);
  }
  if (query.date_from) {
    values.push(query.date_from);
    filters.push(`r.${dateColumn}::date >= $${values.length}`);
  }
  if (query.date_to) {
    values.push(query.date_to);
    filters.push(`r.${dateColumn}::date <= $${values.length}`);
  }
  return { where: filters.length ? `WHERE ${filters.join(' AND ')}` : '', values };
}

async function communityComplaints(query = {}) {
  const { where, values } = parseFilters(query, 'submitted_at');
  const summarySql = `
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'submitted')::int AS submitted,
      COUNT(*) FILTER (WHERE status = 'under_review')::int AS under_review,
      COUNT(*) FILTER (WHERE status = 'verified')::int AS verified,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE severity_level = 'high')::int AS high_severity
    FROM public.community_issue_reports r ${where};
  `;
  const rowsSql = `
    SELECT r.report_code, r.issue_title, r.description, r.status, r.severity_level,
      r.latitude, r.longitude, r.submitted_at,
      c.category_name,
      NULL::text AS solution_title
    FROM public.community_issue_reports r
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
    ${where}
    ORDER BY r.submitted_at DESC NULLS LAST
    LIMIT 500;
  `;
  const statusSql = `SELECT status, COUNT(*)::int AS count FROM public.community_issue_reports r ${where} GROUP BY status ORDER BY status;`;
  const severitySql = `SELECT severity_level, COUNT(*)::int AS count FROM public.community_issue_reports r ${where} GROUP BY severity_level ORDER BY severity_level;`;
  const [summary, records, byStatus, bySeverity] = await Promise.all([
    pool.query(summarySql, values), pool.query(rowsSql, values), pool.query(statusSql, values), pool.query(severitySql, values)
  ]);
  return { summary: summary.rows[0], byStatus: byStatus.rows, bySeverity: bySeverity.rows, records: records.rows };
}

async function interventions(query = {}) {
  const { where, values } = parseFilters(query, 'updated_at');
  const summarySql = `
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'planned')::int AS planned,
      COUNT(*) FILTER (WHERE status = 'ongoing')::int AS ongoing,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE priority = 'high')::int AS high_priority,
      COALESCE(ROUND(AVG(progress_percent)::numeric, 1), 0) AS avg_progress
    FROM public.intervention_registry r ${where};
  `;
  const rowsSql = `
    SELECT r.intervention_code, r.intervention_title, r.location_name, r.village_name,
      r.dsd_name, r.gnd_name, r.priority, r.status, r.progress_percent,
      r.planned_start_date, r.planned_end_date, r.actual_start_date, r.actual_end_date,
      r.lead_officer_name, r.implementing_office, r.updated_by, r.updated_at,
      l.intervention_name AS library_name,
      COALESCE((SELECT COUNT(*) FROM public.intervention_action_timeline t WHERE t.intervention_id = r.id), 0)::int AS action_count,
      COALESCE((SELECT COUNT(*) FROM public.intervention_officers o WHERE o.intervention_id = r.id), 0)::int AS officer_count
    FROM public.intervention_registry r
    LEFT JOIN public.intervention_library l ON l.id = r.library_id
    ${where}
    ORDER BY r.updated_at DESC
    LIMIT 500;
  `;
  const statusSql = `SELECT status, COUNT(*)::int AS count FROM public.intervention_registry r ${where} GROUP BY status ORDER BY status;`;
  const prioritySql = `SELECT priority, COUNT(*)::int AS count FROM public.intervention_registry r ${where} GROUP BY priority ORDER BY priority;`;
  const [summary, records, byStatus, byPriority] = await Promise.all([
    pool.query(summarySql, values), pool.query(rowsSql, values), pool.query(statusSql, values), pool.query(prioritySql, values)
  ]);
  return { summary: summary.rows[0], byStatus: byStatus.rows, byPriority: byPriority.rows, records: records.rows };
}

module.exports = { communityComplaints, interventions };