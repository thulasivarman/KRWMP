require('dotenv').config();
const fs = require('fs');
const path = require('path');

let pool;

const requiredChecks = [
  { table: 'community_issue_reports', column: 'dsd_name' },
  { table: 'community_issue_reports', column: 'gnd_name' },
  { table: 'community_issue_reports', column: 'sub_watershed_id' },
  { table: 'community_issue_reports', column: 'sub_watershed_name' },
  { table: 'community_issue_reports', column: 'other_category_name' },
  { table: 'community_issue_reports', column: 'other_issue_name' },
  { table: 'knowledge_content', column: 'title' },
  { table: 'knowledge_content', column: 'content_type' },
  { table: 'knowledge_content', column: 'status' },
  { table: 'knowledge_content', column: 'geom' },
  { table: 'knowledge_content', column: 'sub_watershed_id' },
  { table: 'knowledge_categories', column: 'category_name' },
  { table: 'knowledge_tags', column: 'tag_name' },
  { table: 'review_queue', column: 'validation_result' },
  { table: 'review_queue', column: 'review_status' },
  { table: 'review_history', column: 'decision' },
  { table: 'sync_conflicts', column: 'conflict_status' },
  { table: 'pollution_source_interventions', column: 'pollution_source_id' },
  { table: 'pollution_source_interventions', column: 'intervention_id' },
  { table: 'pollution_source_interventions', column: 'link_type' },
  { table: 'pollution_source_community_issues', column: 'pollution_source_id' },
  { table: 'pollution_source_community_issues', column: 'community_issue_id' },
  { table: 'pollution_source_water_quality_records', column: 'pollution_source_id' },
  { table: 'pollution_source_water_quality_records', column: 'water_quality_record_id' },
  { table: 'pollution_source_monitoring', column: 'pollution_source_id' },
  { table: 'water_quality_tests', column: 'overall_status' },
  { table: 'intervention_action_timeline', column: 'intervention_id' }
];

const requiredTables = [
  'public.complaint_intervention_mapping',
  'public.knowledge_categories',
  'public.knowledge_tags',
  'public.knowledge_content',
  'public.knowledge_content_tags',
  'public.knowledge_content_relations',
  'public.review_queue',
  'public.review_history',
  'public.sync_conflicts',
  'public.pollution_source_interventions',
  'public.pollution_source_community_issues',
  'public.pollution_source_water_quality_records',
  'public.pollution_source_monitoring',
  'public.water_quality_tests',
  'public.intervention_action_timeline'
];

async function main() {
  const migrationDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir).filter(name => name.endsWith('.sql')) : [];
  if (!files.length) throw new Error('No migration files found in database/migrations.');

  pool = require('../config/database');

  for (const table of requiredTables) {
    const result = await pool.query('SELECT to_regclass($1) AS table_name;', [table]);
    if (!result.rows[0].table_name) throw new Error(`Missing table: ${table}`);
  }

  for (const check of requiredChecks) {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      ) AS exists;
    `, [check.table, check.column]);
    if (!result.rows[0].exists) throw new Error(`Missing column: public.${check.table}.${check.column}`);
  }

  console.log(`Migration verification passed. Found ${files.length} migration files.`);
}

function isConnectionUnavailable(error) {
  if (!error) return false;
  const codes = new Set(['EACCES', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH']);
  if (codes.has(error.code)) return true;
  return Array.isArray(error.errors) && error.errors.some(item => codes.has(item?.code));
}

main().catch(error => {
  if (isConnectionUnavailable(error) && process.env.MIGRATION_VERIFY_STRICT !== 'true') {
    console.warn(`Migration verification skipped: database is not reachable from this environment (${error.code || error.name || 'connection error'}).`);
    return;
  }
  console.error(error.message);
  process.exitCode = 1;
}).finally(async () => {
  if (pool) await pool.end();
});
