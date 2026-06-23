const reportType = document.getElementById('reportType');
const statusFilter = document.getElementById('statusFilter');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const statusBox = document.getElementById('statusBox');
const api = window.KRWMP_UTILS.apiRequest;
const esc = window.KRWMP_UTILS.escapeHtml;

const STATUS_OPTIONS = {
  'community-complaints': ['submitted', 'under_review', 'verified', 'action_required', 'resolved', 'rejected'],
  interventions: ['planned', 'ongoing', 'delayed', 'completed', 'cancelled'],
  'catchment-programmes': ['Planned', 'Ongoing', 'Completed', 'Delayed', 'Cancelled'],
  institutions: ['true', 'false'],
  'volunteer-organisations': ['true', 'false'],
  'pollution-sources': ['active', 'under_investigation', 'controlled', 'closed'],
  vwmc: ['active', 'inactive'],
  'water-quality': ['compliant', 'caution', 'non_compliant', 'not_assessed'],
  persons: ['active', 'inactive']
};

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

function title(value) {
  if (value === 'true') return 'Active';
  if (value === 'false') return 'Inactive';
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function activeUserName() {
  try {
    const user = (window.KRWMP_ENGINE && window.KRWMP_ENGINE.Session && window.KRWMP_ENGINE.Session.user) || JSON.parse(localStorage.getItem('krwmp_user') || 'null') || {};
    return user.name || user.identifier || 'KRWMP user';
  } catch (_) {
    return 'KRWMP user';
  }
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString();
  return value;
}

function summaryCard(label, value) {
  return '<div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">' + esc(label) + '</div><div class="text-xl font-bold text-slate-900 mt-1">' + esc(value) + '</div></div>';
}

async function loadCatalogue() {
  const response = await api('/api/reports/catalogue');
  const reports = response.reports || [];
  reportType.innerHTML = reports.map(item => '<option value="' + esc(item.key) + '">' + esc(item.title) + '</option>').join('');
}

function fillStatus() {
  statusFilter.innerHTML = '<option value="">All Status</option>';
  (STATUS_OPTIONS[reportType.value] || []).forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = title(value);
    statusFilter.appendChild(option);
  });
}

function reportUrl() {
  const query = new URLSearchParams();
  if (statusFilter.value) query.set('status', statusFilter.value);
  if (dateFrom.value) query.set('date_from', dateFrom.value);
  if (dateTo.value) query.set('date_to', dateTo.value);
  return '/api/reports/' + encodeURIComponent(reportType.value) + (query.toString() ? '?' + query.toString() : '');
}

async function loadReport() {
  try {
    show('Loading report...');
    const response = await api(reportUrl());
    renderReport(response.report || {});
    statusBox.classList.add('hidden');
  } catch (error) {
    show(error.message || 'Unable to load report.', true);
  }
}

function renderStatusSummary(rows) {
  if (!rows || !rows.length) return '<p class="text-slate-500 text-sm">No summary available.</p>';
  return rows.map(row => '<div class="flex justify-between border-b border-slate-100 pb-1"><span>' + esc(title(row.status || 'Not specified')) + '</span><strong>' + esc(row.count) + '</strong></div>').join('');
}

function renderReport(report) {
  const columns = report.columns || [];
  const records = report.records || [];
  document.getElementById('reportTitle').textContent = report.title || 'Report';
  document.getElementById('reportMeta').textContent = 'Generated on ' + new Date().toLocaleString() + ' by ' + activeUserName();
  const totalRecords = report.summary && report.summary.total !== undefined ? report.summary.total : records.length;
  document.getElementById('summaryGrid').innerHTML = [
    summaryCard('Total Records', totalRecords),
    summaryCard('Visible Columns', columns.length),
    summaryCard('Report Type', title(report.type || reportType.value))
  ].join('');
  document.getElementById('statusSummary').innerHTML = renderStatusSummary(report.byStatus || []);
  document.getElementById('secondarySummary').innerHTML = '<p class="text-slate-500">Professional reporting labels are used instead of raw database column names.</p>';
  document.getElementById('reportTableHead').innerHTML = '<tr>' + columns.map(col => '<th class="border p-2 text-left whitespace-nowrap">' + esc(col.label) + '</th>').join('') + '</tr>';
  document.getElementById('reportTableBody').innerHTML = records.length ? records.map(row => '<tr>' + columns.map(col => '<td class="border p-2 align-top">' + esc(formatValue(row[col.key])) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + Math.max(columns.length, 1) + '" class="border p-3 text-center text-slate-500">No records found.</td></tr>';
}

async function init() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('reports_export', 'view');
  await loadCatalogue();
  fillStatus();
  await loadReport();
}

reportType.addEventListener('change', () => { fillStatus(); loadReport(); });
document.getElementById('loadReportBtn').addEventListener('click', loadReport);
document.getElementById('resetBtn').addEventListener('click', () => { statusFilter.value = ''; dateFrom.value = ''; dateTo.value = ''; loadReport(); });
init().catch(error => show(error.message || 'Unable to initialize reports.', true));