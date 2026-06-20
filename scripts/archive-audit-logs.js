require('dotenv').config();

const pool = require('../config/database');
const { runDailyAuditArchiveJob } = require('../src/services/audit-archive.service');

async function main() {
  const result = await runDailyAuditArchiveJob({
    includeCsv: process.env.AUDIT_ARCHIVE_INCLUDE_CSV !== 'false',
    dbRetentionDays: Number(process.env.AUDIT_RETENTION_DB_DAYS || process.env.AUDIT_DB_RETENTION_DAYS || 14),
    r2RetentionDays: Number(process.env.AUDIT_RETENTION_R2_DAYS || 90),
    limit: Number(process.env.AUDIT_ARCHIVE_BATCH_LIMIT || 10000),
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
