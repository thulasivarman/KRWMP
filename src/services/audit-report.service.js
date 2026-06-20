const { GetObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../../config/database');
const { getBucket, getS3Client } = require('./file-attachment.service');

const DEFAULT_DB_RETENTION_DAYS = 14;
const DEFAULT_R2_RETENTION_DAYS = 90;
const ACTION_TYPES = new Set([
  'page_view',
  'create',
  'update',
  'delete',
  'soft_delete',
  'upload',
  'download',
  'login',
  'logout',
  'approve',
  'reject',
  'status_change',
  'solution_assignment',
  'intervention_assignment',
]);

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toDate(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function startOfDay(date) {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date) {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function clampDateRange(filters = {}) {
  const maxFrom = startOfDay(daysAgo(Number(process.env.AUDIT_RETENTION_R2_DAYS || DEFAULT_R2_RETENTION_DAYS)));
  const defaultFrom = startOfDay(daysAgo(Number(process.env.AUDIT_RETENTION_DB_DAYS || DEFAULT_DB_RETENTION_DAYS)));
  const defaultTo = endOfDay(new Date());
  let from = toDate(filters.from, defaultFrom);
  let to = toDate(filters.to, defaultTo);

  if (from < maxFrom) from = maxFrom;
  if (to > defaultTo) to = defaultTo;
  if (from > to) [from, to] = [to, from];

  return { from, to, maxFrom };
}

function normalizeFilters(filters = {}) {
  const { from, to, maxFrom } = clampDateRange(filters);
  const actionType = cleanText(filters.action_type);
  return {
    from,
    to,
    maxFrom,
    username: cleanText(filters.username || filters.user),
    action_type: actionType && ACTION_TYPES.has(actionType) ? actionType : null,
    module_name: cleanText(filters.module_name),
  };
}

function archiveObjectKey(date) {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `audit-logs/${yyyy}/${mm}/${dd}/audit-log-${yyyy}-${mm}-${dd}.jsonl`;
}

function archiveCsvObjectKey(date) {
  return archiveObjectKey(date).replace(/\.jsonl$/, '.csv');
}

function nextDay(date) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + 1);
  return value;
}

function rowCreatedAt(row) {
  const date = new Date(row.created_at);
  return Number.isNaN(date.getTime()) ? null : date;
}

function matchesFilters(row, filters) {
  const createdAt = rowCreatedAt(row);
  if (!createdAt || createdAt < filters.from || createdAt > filters.to) return false;
  if (filters.username && !String(row.username || '').toLowerCase().includes(filters.username.toLowerCase())) return false;
  if (filters.action_type && row.action_type !== filters.action_type) return false;
  if (filters.module_name && !String(row.module_name || '').toLowerCase().includes(filters.module_name.toLowerCase())) return false;
  return true;
}

function reportRow(row = {}) {
  return {
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    username: row.username || '',
    action_type: row.action_type || '',
    module_name: row.module_name || '',
    record_id: row.record_id || '',
    request_method: row.request_method || '',
    request_url: row.request_url || '',
    summary: row.summary || '',
    severity: row.severity || 'info',
  };
}

async function streamToString(stream) {
  if (!stream) return '';
  if (typeof stream.transformToString === 'function') return stream.transformToString();
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function getArchivedJsonl(key) {
  try {
    const result = await getS3Client().send(new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }));
    return await streamToString(result.Body);
  } catch (error) {
    const code = error?.name || error?.Code || error?.$metadata?.httpStatusCode;
    if (code === 'NoSuchKey' || code === 'NotFound' || code === 404) return '';
    throw error;
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (quoted && char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseArchivedCsv(body) {
  const lines = String(body || '').split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) return [];
  const columns = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return columns.reduce((row, column, index) => {
      row[column] = values[index] || '';
      return row;
    }, {});
  });
}

async function readArchivedRows(filters) {
  const dbCutoff = daysAgo(Number(process.env.AUDIT_RETENTION_DB_DAYS || DEFAULT_DB_RETENTION_DAYS));
  const archiveEnd = filters.to < dbCutoff ? filters.to : dbCutoff;
  if (filters.from >= archiveEnd) return [];

  const rows = [];
  for (let day = startOfDay(filters.from); day <= archiveEnd; day = nextDay(day)) {
    const body = await getArchivedJsonl(archiveObjectKey(day));
    if (body) {
      for (const line of body.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          if (matchesFilters(row, filters)) rows.push(reportRow(row));
        } catch (_) {
          // Ignore malformed archive lines so one bad row does not block report generation.
        }
      }
      continue;
    }

    const csvBody = await getArchivedJsonl(archiveCsvObjectKey(day));
    for (const row of parseArchivedCsv(csvBody)) {
      if (matchesFilters(row, filters)) rows.push(reportRow(row));
    }
  }
  return rows;
}

async function readPostgresRows(filters) {
  const dbCutoff = daysAgo(Number(process.env.AUDIT_RETENTION_DB_DAYS || DEFAULT_DB_RETENTION_DAYS));
  const from = filters.from > dbCutoff ? filters.from : dbCutoff;
  if (from > filters.to) return [];

  const values = [from, filters.to];
  const clauses = ['created_at >= $1', 'created_at <= $2'];

  if (filters.username) {
    values.push(filters.username);
    clauses.push(`username ILIKE '%' || $${values.length} || '%'`);
  }

  if (filters.action_type) {
    values.push(filters.action_type);
    clauses.push(`action_type = $${values.length}`);
  }

  if (filters.module_name) {
    values.push(filters.module_name);
    clauses.push(`module_name ILIKE '%' || $${values.length} || '%'`);
  }

  const result = await pool.query(`
    SELECT created_at, username, action_type, module_name, record_id,
           request_method, request_url, summary, severity
    FROM public.audit_logs
    WHERE ${clauses.join(' AND ')}
    ORDER BY created_at ASC;
  `, values);

  return result.rows.map(reportRow);
}

async function collectReportRows(rawFilters = {}) {
  const filters = normalizeFilters(rawFilters);
  const [archivedRows, activeRows] = await Promise.all([
    readArchivedRows(filters),
    readPostgresRows(filters),
  ]);
  const rows = [...archivedRows, ...activeRows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return { filters, rows };
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows = []) {
  const columns = ['created_at', 'username', 'action_type', 'module_name', 'record_id', 'request_method', 'request_url', 'summary', 'severity'];
  const header = columns.join(',');
  const body = rows.map(row => columns.map(column => csvEscape(row[column])).join(','));
  return [header, ...body].join('\n') + '\n';
}

function truncate(value, length) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, Math.max(0, length - 3))}...` : text;
}

function reportPeriod(filters) {
  return `${filters.from.toISOString()} to ${filters.to.toISOString()}`;
}

function filterSummary(filters) {
  return [
    `User: ${filters.username || 'All'}`,
    `Action: ${filters.action_type || 'All'}`,
    `Module: ${filters.module_name || 'All'}`,
  ].join(' | ');
}

function pdfEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapText(text, maxLength = 95) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function buildPdfLines({ filters, rows, generatedBy, generatedAt }) {
  const lines = [
    { text: 'KRWMP User Activity Report', size: 16 },
    { text: `Report period: ${reportPeriod(filters)}`, size: 10 },
    { text: `Generated by: ${generatedBy || 'Administrator'}`, size: 10 },
    { text: `Generated at: ${generatedAt.toISOString()}`, size: 10 },
    { text: `Filters: ${filterSummary(filters)}`, size: 10 },
    { text: `Total activities: ${rows.length}`, size: 10 },
    { text: '', size: 10 },
    { text: 'Date/Time | User | Action | Module | URL | Summary | Severity', size: 9 },
  ];

  for (const row of rows) {
    const line = [
      truncate(row.created_at, 19),
      truncate(row.username || '-', 14),
      truncate(row.action_type || '-', 18),
      truncate(row.module_name || '-', 18),
      truncate(row.request_url || '-', 28),
      truncate(row.summary || '-', 42),
      truncate(row.severity || '-', 8),
    ].join(' | ');
    for (const wrapped of wrapText(line, 110)) lines.push({ text: wrapped, size: 8 });
  }

  return lines;
}

function buildPdf({ filters, rows, generatedBy }) {
  const generatedAt = new Date();
  const lines = buildPdfLines({ filters, rows, generatedBy, generatedAt });
  const pageLineLimit = 45;
  const pages = [];
  for (let i = 0; i < lines.length; i += pageLineLimit) pages.push(lines.slice(i, i + pageLineLimit));

  const objects = [];
  const addObject = content => {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject('<< /Type /Catalog /Pages 2 0 R >>');
  const pagesId = addObject('');
  const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds = [];

  for (const pageLines of pages) {
    let y = 790;
    const commands = [];
    for (const line of pageLines) {
      commands.push(`BT /F1 ${line.size || 9} Tf 42 ${y} Td (${pdfEscape(line.text)}) Tj ET`);
      y -= line.size > 12 ? 22 : 14;
    }
    const stream = commands.join('\n');
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[catalogId - 1] = '<< /Type /Catalog /Pages 2 0 R >>';

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

async function buildCsvReport(filters = {}) {
  const report = await collectReportRows(filters);
  return { ...report, body: toCsv(report.rows) };
}

async function buildPdfReport(filters = {}, generatedBy = 'Administrator') {
  const report = await collectReportRows(filters);
  return { ...report, body: buildPdf({ ...report, generatedBy }) };
}

module.exports = {
  buildCsvReport,
  buildPdfReport,
  collectReportRows,
  filterSummary,
  reportPeriod,
  toCsv,
};
