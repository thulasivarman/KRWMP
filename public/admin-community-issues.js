const currentUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const reportsList = document.getElementById('reportsList');
const statusBox = document.getElementById('statusBox');
let solutions = [];
let reports = [];
let currentPage = 1;
const pageSize = 6;

function headers(extra = {}) { return { ...extra, 'X-KRWMP-User': currentUser?.identifier || currentUser?.username || 'admin', 'X-KRWMP-Role': currentUser?.role_name || currentUser?.role || 'admin' }; }
function showStatus(message, error = false) { statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`; statusBox.textContent = message; statusBox.classList.remove('hidden'); }
async function json(url, options = {}) { options.headers = headers(options.headers || {}); const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed'); return data; }
async function initSidebar() { if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar'); document.querySelector('.krwmp-panel-section')?.classList.add('hidden'); document.getElementById('section-data-layers')?.classList.add('hidden'); document.getElementById('section-raster-layers')?.classList.add('hidden'); }
async function loadSolutions() { const data = await json('/api/solutions'); solutions = data.solutions || []; }
function fillSolutions(select, selected) { solutions.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.solution_title} (${s.category_name || 'General'})`; if (String(selected || '') === String(s.id)) o.selected = true; select.appendChild(o); }); }

function totalPages() { return Math.max(1, Math.ceil(reports.length / pageSize)); }
function visibleReports() { const start = (currentPage - 1) * pageSize; return reports.slice(start, start + pageSize); }

async function loadReports() {
  reportsList.innerHTML = '<p class="text-sm text-slate-400">Loading reports...</p>';
  const data = await json('/api/community-reports');
  reports = data.reports || [];
  if (currentPage > totalPages()) currentPage = totalPages();
  renderReports();
}

function renderReports() {
  reportsList.innerHTML = '';
  if (!reports.length) { reportsList.innerHTML = '<p class="text-sm text-slate-400">No community issue reports found.</p>'; return; }
  visibleReports().forEach(renderReportCard);
  renderPagination();
}

function renderReportCard(report) {
  const article = document.createElement('article');
  article.className = 'bg-slate-950/60 border border-slate-800 rounded-lg overflow-hidden';
  const hasPhoto = Boolean(report.photo_url && String(report.photo_url).trim());
  article.innerHTML = `
    <button type="button" class="accordion-toggle w-full text-left p-4 flex justify-between gap-4 hover:bg-slate-900/70 transition">
      <div class="min-w-0">
        <h3 class="font-bold text-slate-100 truncate">${escapeHtml(report.report_code)} - ${escapeHtml(report.issue_title || 'Untitled issue')}</h3>
        <p class="text-xs text-slate-500 mt-1">${escapeHtml(report.category_name || 'Uncategorized')} | ${escapeHtml(report.status || '-')} | ${escapeHtml(report.severity_level || '-')} | ${escapeHtml(report.latitude || '-')}, ${escapeHtml(report.longitude || '-')}</p>
      </div>
      <span class="text-slate-500 text-lg accordion-icon">+</span>
    </button>
    <div class="accordion-body hidden border-t border-slate-800 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 space-y-2">
        <p class="text-sm text-slate-300">${escapeHtml(report.description || 'No description provided.')}</p>
        ${hasPhoto ? `<a href="${escapeHtml(report.photo_url)}" class="text-xs text-emerald-400" target="_blank">View photo evidence</a>` : ''}
      </div>
      <form class="review-form space-y-2"><input type="hidden" name="id" value="${report.id}"><select name="status" class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"><option value="submitted">Submitted</option><option value="under_review">Under Review</option><option value="verified">Verified</option><option value="action_required">Action Required</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select><select name="assigned_solution_id" class="solution-select w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"><option value="">No solution assigned</option></select><textarea name="admin_notes" rows="3" class="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm" placeholder="Admin notes">${escapeHtml(report.admin_notes || '')}</textarea><button class="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded text-sm font-bold">Save Review</button></form>
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
  pager.innerHTML = `<div>Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, reports.length)} of ${reports.length} reports</div><div class="flex items-center gap-2"><button id="prevCommunityPage" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${total}</span><button id="nextCommunityPage" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === total ? 'disabled' : ''}>Next</button></div>`;
  reportsList.appendChild(pager);
  pager.querySelector('#prevCommunityPage')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderReports(); });
  pager.querySelector('#nextCommunityPage')?.addEventListener('click', () => { currentPage = Math.min(total, currentPage + 1); renderReports(); });
}

function escapeHtml(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
document.getElementById('refreshBtn').addEventListener('click', loadReports);
(async () => { await initSidebar(); await loadSolutions(); await loadReports(); })().catch(e => showStatus(e.message, true));