const { apiRequest, escapeHtml } = window.KRWMP_UTILS;

const qs = id => document.getElementById(id);
const pageSize = 50;
let currentOffset = 0;
let auditLogs = [];
let totalRecords = 0;

const ACTION_TYPES = [
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
];

function showStatus(message, error = false) {
  window.KRWMP_UTILS.showStatus(qs('statusBox'), message, error);
}

function dateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function setDefaultDates() {
  const to = new Date();
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  qs('filterFrom').value = dateInputValue(from);
  qs('filterTo').value = dateInputValue(to);
}

function titleCase(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function populateActions() {
  qs('filterAction').innerHTML = '<option value="">All actions</option>' + ACTION_TYPES
    .map(action => `<option value="${escapeHtml(action)}">${escapeHtml(titleCase(action))}</option>`)
    .join('');
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

function severityBadge(severity = 'info') {
  const value = String(severity || 'info').toLowerCase();
  const className = value === 'critical' || value === 'error'
    ? 'krwmp-badge-danger'
    : value === 'warning'
      ? 'krwmp-badge-warning'
      : 'krwmp-badge-info';
  return `<span class="krwmp-badge ${className}">${escapeHtml(value)}</span>`;
}

function queryParams() {
  const params = new URLSearchParams();
  if (qs('filterFrom').value) params.set('from', `${qs('filterFrom').value}T00:00:00.000Z`);
  if (qs('filterTo').value) params.set('to', `${qs('filterTo').value}T23:59:59.999Z`);
  if (qs('filterUser').value.trim()) params.set('user', qs('filterUser').value.trim());
  if (qs('filterAction').value) params.set('action_type', qs('filterAction').value);
  if (qs('filterModule').value.trim()) params.set('module_name', qs('filterModule').value.trim());
  if (qs('filterRecord').value.trim()) params.set('record_id', qs('filterRecord').value.trim());
  if (qs('filterQ').value.trim()) params.set('q', qs('filterQ').value.trim());
  params.set('limit', pageSize);
  params.set('offset', currentOffset);
  return params;
}

function exportQueryParams() {
  const params = queryParams();
  params.delete('limit');
  params.delete('offset');
  params.delete('record_id');
  params.delete('q');
  return params;
}

function downloadReport(format) {
  const params = exportQueryParams();
  window.location.href = `/api/admin/audit/export.${format}?${params.toString()}`;
}

async function loadAuditLogs(reset = false) {
  if (reset) currentOffset = 0;
  qs('auditLogTableBody').innerHTML = '<tr><td colspan="8" class="krwmp-table-empty">Loading audit records...</td></tr>';
  const data = await apiRequest(`/api/admin/audit/logs?${queryParams().toString()}`);
  auditLogs = data.logs || [];
  totalRecords = data.total || 0;
  renderTable();
  renderPagination();
}

function renderTable() {
  qs('auditResultMeta').textContent = `Showing ${auditLogs.length} of ${totalRecords} audit records`;
  if (!auditLogs.length) {
    qs('auditLogTableBody').innerHTML = '<tr><td colspan="8" class="krwmp-table-empty">No audit records found.</td></tr>';
    return;
  }

  qs('auditLogTableBody').innerHTML = auditLogs.map((row, index) => `
    <tr>
      <td>${escapeHtml(formatDateTime(row.created_at))}</td>
      <td>${escapeHtml(row.username || '-')}</td>
      <td>${escapeHtml(titleCase(row.action_type))}</td>
      <td>${escapeHtml(row.module_name || '-')}</td>
      <td class="max-w-xs truncate" title="${escapeHtml(row.request_url || '')}">${escapeHtml(row.request_url || '-')}</td>
      <td class="max-w-sm truncate" title="${escapeHtml(row.summary || '')}">${escapeHtml(row.summary || '-')}</td>
      <td>${severityBadge(row.severity)}</td>
      <td class="text-right"><button type="button" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm btn-details" data-index="${index}">View</button></td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-details').forEach(button => {
    button.addEventListener('click', () => openDetails(Number(button.dataset.index)));
  });
}

function renderPagination() {
  const start = totalRecords ? currentOffset + 1 : 0;
  const end = Math.min(currentOffset + auditLogs.length, totalRecords);
  qs('auditPagination').innerHTML = `
    <div class="krwmp-pagination">
      <span class="krwmp-pagination-meta">Showing ${start}-${end} of ${totalRecords}</span>
      <div class="krwmp-pagination-controls">
        <button id="prevPageBtn" type="button" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentOffset === 0 ? 'disabled' : ''}>Previous</button>
        <button id="nextPageBtn" type="button" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentOffset + pageSize >= totalRecords ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;
  qs('prevPageBtn')?.addEventListener('click', async () => {
    currentOffset = Math.max(0, currentOffset - pageSize);
    await loadAuditLogs(false);
  });
  qs('nextPageBtn')?.addEventListener('click', async () => {
    currentOffset += pageSize;
    await loadAuditLogs(false);
  });
}

function openDetails(index) {
  const row = auditLogs[index];
  if (!row) return;
  qs('auditDetailsContent').textContent = JSON.stringify({
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
    r2_archive_path: row.r2_archive_path,
    created_at: row.created_at,
  }, null, 2);
  qs('auditDetailsModal').showModal();
}

function bindEvents() {
  qs('auditFilterForm').addEventListener('submit', async event => {
    event.preventDefault();
    await loadAuditLogs(true);
  });
  qs('refreshAuditLogsBtn').addEventListener('click', () => loadAuditLogs(false));
  qs('exportCsvBtn').addEventListener('click', () => downloadReport('csv'));
  qs('exportPdfBtn').addEventListener('click', () => downloadReport('pdf'));
  qs('clearFiltersBtn').addEventListener('click', async () => {
    qs('filterUser').value = '';
    qs('filterAction').value = '';
    qs('filterModule').value = '';
    qs('filterRecord').value = '';
    qs('filterQ').value = '';
    setDefaultDates();
    await loadAuditLogs(true);
  });
  qs('closeDetailsBtn').addEventListener('click', () => qs('auditDetailsModal').close());
  qs('closeDetailsFooterBtn').addEventListener('click', () => qs('auditDetailsModal').close());
}

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
    await window.KRWMP_PRIVILEGES.protectPage('user_management_settings', 'view');
    populateActions();
    setDefaultDates();
    bindEvents();
    await loadAuditLogs(true);
  } catch (error) {
    showStatus(error.message, true);
    qs('auditLogTableBody').innerHTML = `<tr><td colspan="8" class="krwmp-table-empty text-rose-300">${escapeHtml(error.message)}</td></tr>`;
  }
});
