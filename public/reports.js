const reportType = document.getElementById('reportType');
const statusFilter = document.getElementById('statusFilter');
const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');
const statusBox = document.getElementById('statusBox');

const options = {
  'community-complaints': ['submitted', 'under_review', 'verified', 'action_required', 'resolved', 'rejected'],
  interventions: ['planned', 'ongoing', 'delayed', 'completed', 'cancelled']
};

function activeUser() {
  return window.KRWMP_ENGINE?.Session?.user || JSON.parse(localStorage.getItem('krwmp_user') || 'null') || {};
}

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

const { apiRequest, escapeHtml: esc } = window.KRWMP_UTILS;

async function init() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('reports_export', 'view');
  fillStatus();
  await loadReport();
}

function fillStatus() {
  statusFilter.innerHTML = '<option value="">All Status</option>';
  (options[reportType.value] || []).forEach(v => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = title(v);
    statusFilter.appendChild(o);
  });
}

function buildUrl() {
  const q = new URLSearchParams();
  if (statusFilter.value) q.set('status', statusFilter.value);
  if (dateFrom.value) q.set('date_from', dateFrom.value);
  if (dateTo.value) q.set('date_to', dateTo.value);
  return `/api/reports/${reportType.value}${q.toString() ? '?' + q.toString() : ''}`;
}

async function loadReport() {
  try {
    show('Loading report...');
    const data = await apiRequest(buildUrl());
    render(data.report || {});
    statusBox.classList.add('hidden');
  } catch (e) {
    show(e.message, true);
  }
}

function card(label, value) {
  return `<div class="border border-slate-200 rounded-lg p-3 bg-slate-50"><div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">${esc(label)}</div><div class="text-xl font-bold text-slate-900 mt-1">${esc(value ?? 0)}</div></div>`;
}

function renderList(id, rows, key) {
  document.getElementById(id).innerHTML = rows?.length ? rows.map(r => `<div class="flex justify-between border-b border-slate-100 pb-1"><span>${esc(title(r[key] || 'Not specified'))}</span><strong>${esc(r.count)}</strong></div>`).join('') : '<p class="text-slate-500 text-sm">No data available.</p>';
}

function render(report) {
  const user = activeUser();
  document.getElementById('reportMeta').textContent = `Generated on ${new Date().toLocaleString()} by ${user.name || user.identifier || 'KRWMP user'}`;
  if (reportType.value === 'community-complaints') return renderCommunity(report);
  return renderInterventions(report);
}

function renderCommunity(report) {
  document.getElementById('reportTitle').textContent = 'Community Complaints Report';
  document.getElementById('secondarySummaryTitle').textContent = 'Severity Summary';
  const s = report.summary || {};
  document.getElementById('summaryGrid').innerHTML = [card('Total', s.total), card('Submitted', s.submitted), card('Under Review', s.under_review), card('Verified', s.verified), card('Resolved', s.resolved), card('High Severity', s.high_severity)].join('');
  renderList('statusSummary', report.byStatus || [], 'status');
  renderList('secondarySummary', report.bySeverity || [], 'severity_level');
  document.getElementById('reportTableHead').innerHTML = '<tr><th class="border p-2 text-left">Code</th><th class="border p-2 text-left">Title</th><th class="border p-2 text-left">Category</th><th class="border p-2 text-left">Status</th><th class="border p-2 text-left">Severity</th><th class="border p-2 text-left">Location</th><th class="border p-2 text-left">Solution</th></tr>';
  document.getElementById('reportTableBody').innerHTML = (report.records || []).map(r => `<tr><td class="border p-2">${esc(r.report_code)}</td><td class="border p-2">${esc(r.issue_title)}</td><td class="border p-2">${esc(r.category_name || '-')}</td><td class="border p-2">${esc(r.status || '-')}</td><td class="border p-2">${esc(r.severity_level || '-')}</td><td class="border p-2">${esc(r.latitude || '-')}, ${esc(r.longitude || '-')}</td><td class="border p-2">${esc(r.solution_title || '-')}</td></tr>`).join('') || '<tr><td colspan="7" class="border p-3 text-center text-slate-500">No records found.</td></tr>';
}

function renderInterventions(report) {
  document.getElementById('reportTitle').textContent = 'Intervention Registry Report';
  document.getElementById('secondarySummaryTitle').textContent = 'Priority Summary';
  const s = report.summary || {};
  document.getElementById('summaryGrid').innerHTML = [card('Total', s.total), card('Planned', s.planned), card('Ongoing', s.ongoing), card('Completed', s.completed), card('High Priority', s.high_priority), card('Avg Progress %', s.avg_progress)].join('');
  renderList('statusSummary', report.byStatus || [], 'status');
  renderList('secondarySummary', report.byPriority || [], 'priority');
  document.getElementById('reportTableHead').innerHTML = '<tr><th class="border p-2 text-left">Code</th><th class="border p-2 text-left">Title</th><th class="border p-2 text-left">Type</th><th class="border p-2 text-left">DSD/GND</th><th class="border p-2 text-left">Status</th><th class="border p-2 text-left">Priority</th><th class="border p-2 text-left">Progress</th><th class="border p-2 text-left">Lead Officer</th></tr>';
  document.getElementById('reportTableBody').innerHTML = (report.records || []).map(r => `<tr><td class="border p-2">${esc(r.intervention_code)}</td><td class="border p-2">${esc(r.intervention_title)}</td><td class="border p-2">${esc(r.library_name || '-')}</td><td class="border p-2">${esc(r.dsd_name || '-')} / ${esc(r.gnd_name || '-')}</td><td class="border p-2">${esc(r.status || '-')}</td><td class="border p-2">${esc(r.priority || '-')}</td><td class="border p-2">${esc(r.progress_percent || 0)}%</td><td class="border p-2">${esc(r.lead_officer_name || '-')}</td></tr>`).join('') || '<tr><td colspan="8" class="border p-3 text-center text-slate-500">No records found.</td></tr>';
}

function exportPdf() {
  window.print();
}

function title(v) { return String(v).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()); }

reportType.addEventListener('change', () => { fillStatus(); loadReport(); });
document.getElementById('loadReportBtn').addEventListener('click', loadReport);
document.getElementById('resetBtn').addEventListener('click', () => { statusFilter.value = ''; dateFrom.value = ''; dateTo.value = ''; loadReport(); });
document.getElementById('exportPdfBtn').addEventListener('click', exportPdf);
init().catch(e => show(e.message, true));
