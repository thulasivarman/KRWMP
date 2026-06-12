const currentUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const reportsList = document.getElementById('reportsList');
const statusBox = document.getElementById('statusBox');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const categoryFilter = document.getElementById('categoryFilter');
const severityFilter = document.getElementById('severityFilter');
const clearFiltersBtn = document.getElementById('clearFiltersBtn');
const filterSummary = document.getElementById('filterSummary');
let solutions = [];
let reports = [];
let filteredReports = [];
let currentPage = 1;
const pageSize = 6;

const STATUS_LABELS = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  verified: 'Verified',
  action_required: 'Action Required',
  assigned_to_intervention: 'Assigned To Intervention',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

function headers(extra = {}) { return { ...extra, 'X-KRWMP-User': currentUser?.identifier || currentUser?.username || 'admin', 'X-KRWMP-Role': currentUser?.role_name || currentUser?.role || 'admin' }; }
function showStatus(message, error = false) { statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`; statusBox.textContent = message; statusBox.classList.remove('hidden'); }
async function json(url, options = {}) { options.headers = headers(options.headers || {}); const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed'); return data; }
async function initSidebar() { if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar'); document.querySelector('.krwmp-panel-section')?.classList.add('hidden'); document.getElementById('section-data-layers')?.classList.add('hidden'); document.getElementById('section-raster-layers')?.classList.add('hidden'); }
async function loadSolutions() { const data = await json('/api/solutions'); solutions = data.solutions || []; }
function fillSolutions(select, selected) { solutions.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.solution_title} (${s.category_name || 'General'})`; if (String(selected || '') === String(s.id)) o.selected = true; select.appendChild(o); }); }

function normalize(value) { return String(value ?? '').trim().toLowerCase(); }
function categoryName(report) { return report.category_name || report.other_category_name || 'Other'; }
function issueName(report) { return report.issue_name || report.other_issue_name || report.issue_title || 'Untitled issue'; }
function statusLabel(status) { return STATUS_LABELS[status] || titleCase(status || 'submitted'); }
function titleCase(value) { return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function uniqueSorted(values) { return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b)); }
function totalPages() { return Math.max(1, Math.ceil(filteredReports.length / pageSize)); }
function visibleReports() { const start = (currentPage - 1) * pageSize; return filteredReports.slice(start, start + pageSize); }

async function loadReports() {
  reportsList.innerHTML = '<p class="text-sm text-slate-400">Loading reports...</p>';
  const data = await json('/api/community-reports');
  reports = data.reports || [];
  populateFilters();
  applyFilters(false);
}

function populateFilters() {
  populateSelect(statusFilter, 'All Statuses', uniqueSorted(reports.map(r => r.status || 'submitted')), statusLabel);
  populateSelect(categoryFilter, 'All Categories', uniqueSorted(reports.map(categoryName)));
  populateSelect(severityFilter, 'All Severities', uniqueSorted(reports.map(r => r.severity_level || 'medium')), titleCase);
}

function populateSelect(select, placeholder, values, labelFn = v => v) {
  const selected = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labelFn(value);
    if (selected === value) option.selected = true;
    select.appendChild(option);
  });
}

function applyFilters(resetPage = true) {
  const query = normalize(searchInput.value);
  const selectedStatus = statusFilter.value;
  const selectedCategory = categoryFilter.value;
  const selectedSeverity = severityFilter.value;

  filteredReports = reports.filter(report => {
    const reportStatus = report.status || 'submitted';
    const reportCategory = categoryName(report);
    const reportSeverity = report.severity_level || 'medium';
    const searchable = normalize([
      report.report_code,
      report.issue_title,
      issueName(report),
      report.description,
      report.location_description,
      report.dsd_name,
      report.gnd_name,
      report.sub_watershed_name,
      report.reporter_name,
      report.reporter_contact,
    ].join(' '));

    return (!query || searchable.includes(query)) &&
      (!selectedStatus || reportStatus === selectedStatus) &&
      (!selectedCategory || reportCategory === selectedCategory) &&
      (!selectedSeverity || reportSeverity === selectedSeverity);
  });

  if (resetPage) currentPage = 1;
  if (currentPage > totalPages()) currentPage = totalPages();
  renderReports();
}

function renderReports() {
  reportsList.innerHTML = '';
  filterSummary.textContent = `Showing ${filteredReports.length} of ${reports.length} reports`;
  if (!filteredReports.length) { reportsList.innerHTML = '<p class="text-sm text-slate-400">No community issue reports match the selected filters.</p>'; return; }
  visibleReports().forEach(renderReportCard);
  renderPagination();
}

function statusClasses(status) {
  const s = status || 'submitted';
  if (s === 'submitted') return 'bg-sky-500/10 border-sky-500/40 hover:bg-sky-500/15';
  if (s === 'under_review') return 'bg-amber-500/10 border-amber-500/40 hover:bg-amber-500/15';
  if (s === 'verified') return 'bg-cyan-500/10 border-cyan-500/40 hover:bg-cyan-500/15';
  if (s === 'action_required' || s === 'assigned_to_intervention') return 'bg-orange-500/10 border-orange-500/40 hover:bg-orange-500/15';
  if (s === 'resolved') return 'bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/15';
  if (s === 'rejected') return 'bg-rose-500/10 border-rose-500/40 hover:bg-rose-500/15';
  return 'bg-slate-900/60 border-slate-700 hover:bg-slate-900/80';
}

function statusBadgeClasses(status) {
  const s = status || 'submitted';
  if (s === 'submitted') return 'bg-sky-500/20 text-sky-200 border-sky-500/40';
  if (s === 'under_review') return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
  if (s === 'verified') return 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40';
  if (s === 'action_required' || s === 'assigned_to_intervention') return 'bg-orange-500/20 text-orange-200 border-orange-500/40';
  if (s === 'resolved') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40';
  if (s === 'rejected') return 'bg-rose-500/20 text-rose-200 border-rose-500/40';
  return 'bg-slate-700 text-slate-200 border-slate-600';
}

function renderReportCard(report) {
  const article = document.createElement('article');
  article.className = 'bg-slate-950/60 border border-slate-800 rounded-lg overflow-hidden';
  const hasPhoto = Boolean(report.photo_url && String(report.photo_url).trim());
  const reportStatus = report.status || 'submitted';
  article.innerHTML = `
    <button type="button" class="accordion-toggle w-full text-left p-4 flex justify-between gap-4 transition border-l-4 ${statusClasses(reportStatus)}">
      <div class="min-w-0 space-y-1">
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="font-bold text-slate-100 truncate">${escapeHtml(report.report_code)} - ${escapeHtml(report.issue_title || issueName(report))}</h3>
          <span class="text-[11px] px-2 py-0.5 rounded-full border font-bold ${statusBadgeClasses(reportStatus)}">${escapeHtml(statusLabel(reportStatus))}</span>
        </div>
        <p class="text-xs text-slate-400">${escapeHtml(categoryName(report))} | ${escapeHtml(issueName(report))} | ${escapeHtml(titleCase(report.severity_level || '-'))} | ${escapeHtml(report.latitude || '-')}, ${escapeHtml(report.longitude || '-')}</p>
      </div>
      <span class="text-slate-400 text-lg accordion-icon">+</span>
    </button>
    <div class="accordion-body hidden border-t border-slate-800 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-2">
        <p class="text-sm text-slate-300">${escapeHtml(report.description || 'No description provided.')}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-400">
          <div><span class="text-slate-500">Location:</span> ${escapeHtml(report.location_description || '-')}</div>
          <div><span class="text-slate-500">DSD/GND:</span> ${escapeHtml(report.dsd_name || '-')} / ${escapeHtml(report.gnd_name || '-')}</div>
          <div><span class="text-slate-500">Reporter:</span> ${escapeHtml(report.reporter_name || '-')}</div>
          <div><span class="text-slate-500">Contact:</span> ${escapeHtml(report.reporter_contact || '-')}</div>
        </div>
        ${hasPhoto ? `<a href="${escapeHtml(report.photo_url)}" class="text-xs text-emerald-400" target="_blank">View photo evidence</a>` : ''}
      </div>
      <form class="review-form space-y-2"><input type="hidden" name="id" value="${report.id}"><select name="status" class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"><option value="submitted">Submitted</option><option value="under_review">Under Review</option><option value="verified">Verified</option><option value="assigned_to_intervention">Assigned To Intervention</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select><select name="assigned_solution_id" class="solution-select w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"><option value="">No solution assigned</option></select><textarea name="admin_notes" rows="3" class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm" placeholder="Admin notes">${escapeHtml(report.admin_notes || '')}</textarea><button class="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-sm font-bold">Save Review</button></form>
    </div>`;
  reportsList.appendChild(article);
  const body = article.querySelector('.accordion-body');
  const icon = article.querySelector('.accordion-icon');
  article.querySelector('.accordion-toggle').addEventListener('click', () => { body.classList.toggle('hidden'); icon.textContent = body.classList.contains('hidden') ? '+' : '−'; });
  const form = article.querySelector('.review-form');
  form.status.value = report.status || 'submitted';
  fillSolutions(form.assigned_solution_id, report.assigned_solution_id);
  form.addEventListener('submit', async e => { e.preventDefault(); await json(`/api/community-reports/${form.id.value}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status: form.status.value, assigned_solution_id: form.assigned_solution_id.value || null, admin_notes: form.admin_notes.value }) }); showStatus('Report review updated.'); await loadReports(); });
}

function renderPagination() {
  const total = totalPages();
  const pager = document.createElement('div');
  pager.className = 'flex items-center justify-between border-t border-slate-800 pt-4 mt-4 text-xs text-slate-400';
  pager.innerHTML = `<div>Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredReports.length)} of ${filteredReports.length} reports</div><div class="flex items-center gap-2"><button id="prevCommunityPage" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${total}</span><button id="nextCommunityPage" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === total ? 'disabled' : ''}>Next</button></div>`;
  reportsList.appendChild(pager);
  pager.querySelector('#prevCommunityPage')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderReports(); });
  pager.querySelector('#nextCommunityPage')?.addEventListener('click', () => { currentPage = Math.min(total, currentPage + 1); renderReports(); });
}

function escapeHtml(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

document.getElementById('refreshBtn').addEventListener('click', loadReports);
searchInput.addEventListener('input', () => applyFilters(true));
statusFilter.addEventListener('change', () => applyFilters(true));
categoryFilter.addEventListener('change', () => applyFilters(true));
severityFilter.addEventListener('change', () => applyFilters(true));
clearFiltersBtn.addEventListener('click', () => { searchInput.value = ''; statusFilter.value = ''; categoryFilter.value = ''; severityFilter.value = ''; applyFilters(true); });

(async () => { await initSidebar(); await loadSolutions(); await loadReports(); })().catch(e => showStatus(e.message, true));
