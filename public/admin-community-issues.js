const currentUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const reportsList = document.getElementById('reportsList');
const statusBox = document.getElementById('statusBox');
let solutions = [];

function headers(extra = {}) { return { ...extra, 'X-KRWMP-User': currentUser?.identifier || currentUser?.username || 'admin', 'X-KRWMP-Role': currentUser?.role_name || currentUser?.role || 'admin' }; }
function showStatus(message, error = false) { statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`; statusBox.textContent = message; statusBox.classList.remove('hidden'); }
async function json(url, options = {}) { options.headers = headers(options.headers || {}); const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed'); return data; }
async function initSidebar() { if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar'); document.querySelector('.krwmp-panel-section')?.classList.add('hidden'); document.getElementById('section-data-layers')?.classList.add('hidden'); document.getElementById('section-raster-layers')?.classList.add('hidden'); }
async function loadSolutions() { const data = await json('/api/solutions'); solutions = data.solutions || []; }
function fillSolutions(select, selected) { solutions.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = `${s.solution_title} (${s.category_name || 'General'})`; if (String(selected || '') === String(s.id)) o.selected = true; select.appendChild(o); }); }
async function loadReports() {
  reportsList.innerHTML = '<p class="text-sm text-slate-400">Loading reports...</p>';
  const data = await json('/api/community-reports');
  reportsList.innerHTML = '';
  if (!data.reports?.length) { reportsList.innerHTML = '<p class="text-sm text-slate-400">No community issue reports found.</p>'; return; }
  data.reports.forEach(report => {
    const node = document.getElementById('reportTemplate').content.cloneNode(true);
    node.querySelector('[data-field="title"]').textContent = `${report.report_code} - ${report.issue_title}`;
    node.querySelector('[data-field="meta"]').textContent = `${report.category_name || 'Uncategorized'} | ${report.status} | ${report.severity_level} | ${report.latitude || '-'}, ${report.longitude || '-'}`;
    node.querySelector('[data-field="description"]').textContent = report.description || 'No description provided.';
    const photo = node.querySelector('[data-field="photo"]'); if (report.photo_url) { photo.href = report.photo_url; photo.classList.remove('hidden'); }
    const form = node.querySelector('.review-form'); form.id.value = report.id; form.status.value = report.status; form.admin_notes.value = report.admin_notes || ''; fillSolutions(form.assigned_solution_id, report.assigned_solution_id);
    form.addEventListener('submit', async e => { e.preventDefault(); await json(`/api/community-reports/${form.id.value}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status: form.status.value, assigned_solution_id: form.assigned_solution_id.value || null, admin_notes: form.admin_notes.value }) }); showStatus('Report review updated.'); await loadReports(); });
    reportsList.appendChild(node);
  });
}
document.getElementById('refreshBtn').addEventListener('click', loadReports);
(async () => { await initSidebar(); await loadSolutions(); await loadReports(); })().catch(e => showStatus(e.message, true));
