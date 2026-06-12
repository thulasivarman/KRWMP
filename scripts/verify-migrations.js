require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const requiredChecks = [
  { table: 'community_issue_reports', column: 'dsd_name' },
  { table: 'community_issue_reports', column: 'gnd_name' },
  { table: 'community_issue_reports', column: 'sub_watershed_id' },
  { table: 'community_issue_reports', column: 'sub_watershed_name' },
  { table: 'community_issue_reports', column: 'other_category_name' },
  { table: 'community_issue_reports', column: 'other_issue_name' },
];

async function main() {
  const migrationDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.existsSync(migrationDir) ? fs.readdirSync(migrationDir).filter(name => name.endsWith('.sql')) : [];
  if (!files.length) throw new Error('No migration files found in database/migrations.');

  const tableResult = await pool.query(`SELECT to_regclass('public.complaint_intervention_mapping') AS table_name;`);
  if (!tableResult.rows[0].table_name) throw new Error('Missing table: public.complaint_intervention_mapping');

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

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
