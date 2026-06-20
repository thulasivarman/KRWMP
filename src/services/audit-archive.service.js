const { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../../config/database');
const { getBucket, getS3Client } = require('./file-attachment.service');

const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_R2_RETENTION_DAYS = 90;
const DEFAULT_BATCH_LIMIT = 10000;

function datePart(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function cutoffDate(days = DEFAULT_RETENTION_DAYS) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function objectBasePath(archiveDate) {
  const [yyyy, mm, dd] = archiveDate.split('-');
  return `audit-logs/${yyyy}/${mm}/${dd}/audit-log-${archiveDate}`;
}

function objectKeys(archiveDate) {
  const base = objectBasePath(archiveDate);
  return {
    jsonl: `${base}.jsonl`,
    csv: `${base}.csv`,
  };
}

function archiveDateFromObjectKey(key = '') {
  const match = String(key).match(/^audit-logs\/(\d{4})\/(\d{2})\/(\d{2})\/audit-log-\d{4}-\d{2}-\d{2}\.(jsonl|csv)$/);
  if (!match) return null;
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function auditRowForExport(row = {}) {
  return {
    id: row.id,
    user_id: row.user_id,
    username: row.username,
    action_type: row.action_type,
    module_name: row.module_name,
    record_id: row.record_id,
    request_method: row.request_method,
    request_url: row.request_url,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    summary: row.summary,
    details: row.details,
    severity: row.severity,
    archive_status: row.archive_status,
    created_at: normalizeValue(row.created_at),
  };
}

function toJsonl(rows = []) {
  return rows.map(row => JSON.stringify(auditRowForExport(row))).join('\n') + '\n';
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows = []) {
  const columns = [
    'id',
    'user_id',
    'username',
    'action_type',
    'module_name',
    'record_id',
    'request_method',
    'request_url',
    'ip_address',
    'user_agent',
    'summary',
    'details',
    'severity',
    'archive_status',
    'created_at',
  ];
  const header = columns.join(',');
  const body = rows.map(row => {
    const exportRow = auditRowForExport(row);
    return columns.map(column => csvEscape(exportRow[column])).join(',');
  });
  return [header, ...body].join('\n') + '\n';
}

async function uploadObject({ key, body, contentType, archiveDate, recordCount }) {
  await getS3Client().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: Buffer.from(body, 'utf8'),
    ContentType: contentType,
    Metadata: {
      archive_date: archiveDate,
      record_count: String(recordCount),
      source: 'krwmp_audit_logs',
    },
  }));
}

async function listAuditArchiveObjects() {
  const client = getS3Client();
  const bucket = getBucket();
  const objects = [];
  let ContinuationToken;

  do {
    const result = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'audit-logs/',
      ContinuationToken,
    }));
    objects.push(...(result.Contents || []));
    ContinuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return objects;
}

async function deleteAuditArchiveObject(key) {
  await getS3Client().send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  }));
}

async function findPendingAuditLogs({ olderThan = cutoffDate(), limit = DEFAULT_BATCH_LIMIT } = {}) {
  const result = await pool.query(`
    SELECT *
    FROM public.audit_logs
    WHERE archive_status = 'pending'
      AND created_at < $1
    ORDER BY created_at ASC
    LIMIT $2;
  `, [olderThan, limit]);
  return result.rows;
}

function groupByArchiveDate(rows = []) {
  return rows.reduce((groups, row) => {
    const key = datePart(row.created_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    return groups;
  }, new Map());
}

async function createArchiveRun({ archiveDate, r2Path }) {
  const result = await pool.query(`
    INSERT INTO public.audit_archive_runs (archive_date, r2_path, records_archived, status, started_at)
    VALUES ($1, $2, 0, 'running', now())
    RETURNING *;
  `, [archiveDate, r2Path]);
  return result.rows[0];
}

async function completeArchiveRun(runId, recordCount) {
  const result = await pool.query(`
    UPDATE public.audit_archive_runs
    SET records_archived = $2,
        status = 'completed',
        completed_at = now(),
        error_message = NULL
    WHERE id = $1
    RETURNING *;
  `, [runId, recordCount]);
  return result.rows[0];
}

async function failArchiveRun(runId, error) {
  if (!runId) return null;
  const result = await pool.query(`
    UPDATE public.audit_archive_runs
    SET status = 'failed',
        completed_at = now(),
        error_message = $2
    WHERE id = $1
    RETURNING *;
  `, [runId, String(error?.message || error || 'Archive failed').slice(0, 2000)]);
  return result.rows[0];
}

async function markAndDeleteArchivedRows({ rows, r2Path, olderThan }) {
  const ids = rows.map(row => row.id);
  await pool.query(`
    UPDATE public.audit_logs
    SET archive_status = 'archived',
        r2_archive_path = $2
    WHERE id = ANY($1::uuid[]);
  `, [ids, r2Path]);

  const deleted = await pool.query(`
    DELETE FROM public.audit_logs
    WHERE id = ANY($1::uuid[])
      AND archive_status = 'archived'
      AND created_at < $2;
  `, [ids, olderThan]);
  return deleted.rowCount || 0;
}

async function archiveAuditDate({ archiveDate, rows, olderThan, includeCsv = true }) {
  if (!rows.length) return null;
  const keys = objectKeys(archiveDate);
  const run = await createArchiveRun({ archiveDate, r2Path: keys.jsonl });

  try {
    await uploadObject({
      key: keys.jsonl,
      body: toJsonl(rows),
      contentType: 'application/x-ndjson; charset=utf-8',
      archiveDate,
      recordCount: rows.length,
    });

    if (includeCsv) {
      await uploadObject({
        key: keys.csv,
        body: toCsv(rows),
        contentType: 'text/csv; charset=utf-8',
        archiveDate,
        recordCount: rows.length,
      });
    }

    const deletedRows = await markAndDeleteArchivedRows({ rows, r2Path: keys.jsonl, olderThan });
    const completedRun = await completeArchiveRun(run.id, rows.length);
    return {
      ...completedRun,
      jsonl_path: keys.jsonl,
      csv_path: includeCsv ? keys.csv : null,
      deleted_rows: deletedRows,
    };
  } catch (error) {
    await failArchiveRun(run.id, error);
    throw error;
  }
}

async function archivePendingAuditLogs(options = {}) {
  const olderThan = options.olderThan ? new Date(options.olderThan) : cutoffDate(options.retentionDays || DEFAULT_RETENTION_DAYS);
  const includeCsv = options.includeCsv !== false;
  const rows = await findPendingAuditLogs({ olderThan, limit: options.limit || DEFAULT_BATCH_LIMIT });
  const grouped = groupByArchiveDate(rows);
  const runs = [];

  for (const [archiveDate, groupRows] of grouped.entries()) {
    const run = await archiveAuditDate({ archiveDate, rows: groupRows, olderThan, includeCsv });
    if (run) runs.push(run);
  }

  return {
    cutoff: olderThan.toISOString(),
    records_found: rows.length,
    archive_runs: runs,
  };
}

async function cleanupOldR2AuditArchives(options = {}) {
  const retentionDays = Number(options.retentionDays || DEFAULT_R2_RETENTION_DAYS);
  const olderThan = options.olderThan ? new Date(options.olderThan) : cutoffDate(retentionDays);
  const objects = await listAuditArchiveObjects();
  const expired = objects
    .map(object => ({ ...object, archiveDate: archiveDateFromObjectKey(object.Key) }))
    .filter(object => object.archiveDate && object.archiveDate < olderThan)
    .sort((a, b) => a.archiveDate - b.archiveDate || String(a.Key).localeCompare(String(b.Key)));

  const deleted = [];
  for (const object of expired) {
    await deleteAuditArchiveObject(object.Key);
    deleted.push({
      key: object.Key,
      archive_date: object.archiveDate.toISOString().slice(0, 10),
      size: object.Size || 0,
    });
  }

  return {
    cutoff: olderThan.toISOString(),
    records_found: expired.length,
    deleted_objects: deleted,
  };
}

async function runDailyAuditArchiveJob(options = {}) {
  const archive = await archivePendingAuditLogs({
    retentionDays: Number(options.dbRetentionDays || process.env.AUDIT_RETENTION_DB_DAYS || process.env.AUDIT_DB_RETENTION_DAYS || DEFAULT_RETENTION_DAYS),
    includeCsv: options.includeCsv !== false,
    limit: Number(options.limit || process.env.AUDIT_ARCHIVE_BATCH_LIMIT || DEFAULT_BATCH_LIMIT),
  });
  const cleanup = await cleanupOldR2AuditArchives({
    retentionDays: Number(options.r2RetentionDays || process.env.AUDIT_RETENTION_R2_DAYS || DEFAULT_R2_RETENTION_DAYS),
  });
  return { archive, cleanup };
}

module.exports = {
  archiveAuditDate,
  archivePendingAuditLogs,
  cleanupOldR2AuditArchives,
  findPendingAuditLogs,
  runDailyAuditArchiveJob,
  toCsv,
  toJsonl,
};
