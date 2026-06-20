const pool = require('../../config/database');
const { getRequestUser } = require('../middleware/privilege.middleware');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
const SEVERITIES = new Set(['info', 'warning', 'error', 'critical']);
const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /(password|password_hash|token|jwt|secret|authorization|cookie|credential|api[_-]?key|access[_-]?key|private[_-]?key|signed[_-]?url|presigned[_-]?url|upload[_-]?url|download[_-]?url)/i;

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toUuid(value) {
  const text = cleanText(value);
  return text && UUID_PATTERN.test(text) ? text : null;
}

function toActionType(value) {
  const action = cleanText(value);
  return action && ACTION_TYPES.has(action) ? action : null;
}

function toSeverity(value) {
  const severity = cleanText(value) || 'info';
  return SEVERITIES.has(severity) ? severity : 'info';
}

function truncateText(value, maxLength = 2000) {
  if (typeof value !== 'string') return value;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeUrl(value) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(text, 'http://krwmp.local');
    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_KEY_PATTERN.test(key)) url.searchParams.set(key, REDACTED);
    }
    const path = `${url.pathname}${url.search}${url.hash}`;
    return text.startsWith('http://') || text.startsWith('https://') ? url.toString() : path;
  } catch (_) {
    return truncateText(text);
  }
}

function sanitizeDetails(value, seen = new WeakSet(), depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (/^Bearer\s+/i.test(value) || /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)) return REDACTED;
    return truncateText(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length} bytes]`;
  if (depth >= 8) return '[Max depth reached]';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitizeDetails(item, seen, depth + 1));

  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = REDACTED;
    } else {
      output[key] = sanitizeDetails(entry, seen, depth + 1);
    }
  }
  return output;
}

function requestInfo(request) {
  if (!request) return {};
  let username = '';
  try {
    username = getRequestUser(request);
  } catch (_) {
    username = '';
  }

  const forwardedFor = cleanText(request.headers?.['x-forwarded-for']);
  const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : cleanText(request.ip || request.socket?.remoteAddress);

  return {
    user_id: toUuid(request.auth?.user_id || request.auth?.id || request.user?.id),
    username: username || cleanText(request.auth?.identifier || request.auth?.sub || request.user?.identifier || request.user?.username),
    request_method: cleanText(request.method),
    request_url: sanitizeUrl(request.url || request.raw?.url),
    ip_address: ipAddress,
    user_agent: cleanText(request.headers?.['user-agent']),
  };
}

function normalizePayload(input = {}) {
  const request = input.request;
  const requestPayload = requestInfo(request);
  const actionType = toActionType(input.action_type || input.actionType || input.action);
  if (!actionType) throw new Error('Valid audit action_type is required.');

  const details = input.details === undefined && input.request?.body !== undefined
    ? { request_body: input.request.body }
    : input.details;

  return {
    user_id: toUuid(input.user_id || input.userId) || requestPayload.user_id,
    username: cleanText(input.username) || requestPayload.username,
    action_type: actionType,
    module_name: cleanText(input.module_name || input.moduleName || input.module),
    record_id: toUuid(input.record_id || input.recordId || input.entity_id || input.entityId),
    request_method: cleanText(input.request_method || input.requestMethod) || requestPayload.request_method,
    request_url: sanitizeUrl(input.request_url || input.requestUrl || input.page_url || input.pageUrl) || requestPayload.request_url,
    ip_address: cleanText(input.ip_address || input.ipAddress) || requestPayload.ip_address,
    user_agent: cleanText(input.user_agent || input.userAgent) || requestPayload.user_agent,
    summary: cleanText(input.summary),
    details: details === undefined ? null : sanitizeDetails(details),
    severity: toSeverity(input.severity),
  };
}

function toDate(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function defaultFromDate() {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
}

async function searchAuditLogs(filters = {}) {
  const values = [];
  const clauses = [];
  const from = toDate(filters.from, defaultFromDate());
  const to = toDate(filters.to, new Date());

  values.push(from);
  clauses.push(`created_at >= $${values.length}`);
  values.push(to);
  clauses.push(`created_at <= $${values.length}`);

  if (cleanText(filters.username || filters.user)) {
    values.push(cleanText(filters.username || filters.user));
    clauses.push(`username ILIKE '%' || $${values.length} || '%'`);
  }

  if (cleanText(filters.action_type)) {
    values.push(cleanText(filters.action_type));
    clauses.push(`action_type = $${values.length}`);
  }

  if (cleanText(filters.module_name)) {
    values.push(cleanText(filters.module_name));
    clauses.push(`module_name ILIKE '%' || $${values.length} || '%'`);
  }

  if (toUuid(filters.record_id)) {
    values.push(toUuid(filters.record_id));
    clauses.push(`record_id = $${values.length}`);
  }

  if (cleanText(filters.q)) {
    values.push(cleanText(filters.q));
    clauses.push(`(
      username ILIKE '%' || $${values.length} || '%'
      OR action_type ILIKE '%' || $${values.length} || '%'
      OR module_name ILIKE '%' || $${values.length} || '%'
      OR request_url ILIKE '%' || $${values.length} || '%'
      OR summary ILIKE '%' || $${values.length} || '%'
    )`);
  }

  const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 500);
  const offset = Math.max(Number(filters.offset || 0), 0);
  values.push(limit);
  const limitParam = values.length;
  values.push(offset);
  const offsetParam = values.length;

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await pool.query(`
    SELECT
      id, user_id, username, action_type, module_name, record_id,
      request_method, request_url, ip_address, user_agent, summary,
      details, severity, archive_status, r2_archive_path, created_at,
      COUNT(*) OVER()::integer AS total_count
    FROM public.audit_logs
    ${where}
    ORDER BY created_at DESC
    LIMIT $${limitParam}
    OFFSET $${offsetParam};
  `, values);

  return {
    logs: result.rows.map(({ total_count, ...row }) => row),
    total: result.rows[0]?.total_count || 0,
    limit,
    offset,
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

async function logActivity(input = {}) {
  try {
    const payload = normalizePayload(input);
    const result = await pool.query(`
      INSERT INTO public.audit_logs (
        user_id, username, action_type, module_name, record_id,
        request_method, request_url, ip_address, user_agent,
        summary, details, severity
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
      RETURNING *;
    `, [
      payload.user_id,
      payload.username,
      payload.action_type,
      payload.module_name,
      payload.record_id,
      payload.request_method,
      payload.request_url,
      payload.ip_address,
      payload.user_agent,
      payload.summary,
      payload.details === null ? null : JSON.stringify(payload.details),
      payload.severity,
    ]);
    return result.rows[0] || null;
  } catch (error) {
    console.warn('Audit logging failed:', error.message);
    return null;
  }
}

function withAction(actionType, defaults = {}) {
  return (input = {}) => logActivity({ ...defaults, ...input, action_type: actionType });
}

const logPageView = withAction('page_view');
const logCreate = withAction('create');
const logUpdate = withAction('update');
const logDelete = withAction('delete');
const logSoftDelete = withAction('soft_delete');
const logUpload = withAction('upload');
const logDownload = withAction('download');
const logLogin = withAction('login');
const logLogout = withAction('logout');
const logApprove = withAction('approve');
const logReject = withAction('reject');
const logStatusChange = withAction('status_change');
const logSolutionAssignment = withAction('solution_assignment', { module_name: 'community_issues' });
const logInterventionAssignment = withAction('intervention_assignment', { module_name: 'community_issues' });

module.exports = {
  logActivity,
  logPageView,
  logCreate,
  logUpdate,
  logDelete,
  logSoftDelete,
  logUpload,
  logDownload,
  logLogin,
  logLogout,
  logApprove,
  logReject,
  logStatusChange,
  logSolutionAssignment,
  logInterventionAssignment,
  searchAuditLogs,
  sanitizeDetails,
};
