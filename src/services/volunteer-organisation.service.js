const pool = require('../../config/database');

async function dashboard() {
  const summary = await pool.query('SELECT * FROM public.vw_volunteer_dashboard_summary;');
  return { summary: summary.rows[0] || {} };
}

async function listOrganisations() {
  const result = await pool.query('SELECT * FROM public.vw_volunteer_organisation_performance ORDER BY active DESC, performance_score DESC NULLS LAST, institution_name LIMIT 500;');
  return result.rows;
}

async function getOrganisation(id) {
  const result = await pool.query('SELECT * FROM public.vw_volunteer_organisation_performance WHERE id = $1;', [id]);
  return result.rows[0] || null;
}

module.exports = { dashboard, listOrganisations, getOrganisation };
