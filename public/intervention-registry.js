let canManage = false;
let canUpdateProgress = false;
const statusBox = document.getElementById('statusBox');
const form = document.getElementById('registryForm');
const list = document.getElementById('registryList');
const librarySelect = document.getElementById('librarySelect');
const dsdSelect = document.getElementById('dsdSelect');
const gndSelect = document.getElementById('gndSelect');
const institutionSelect = document.getElementById('institutionSelect');
let interventionRecords = [];
let currentPage = 1;
const pageSize = 5;

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;
function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
async function initSidebar() { if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html','sidebar'); await window.KRWMP_PRIVILEGES.protectPage('intervention_registry_view','view'); canManage = window.KRWMP_PRIVILEGES.can('intervention_registry_manage','create') || window.KRWMP_PRIVILEGES.can('intervention_registry_manage','update') || window.KRWMP_PRIVILEGES.can('intervention_registry_manage','delete'); canUpdateProgress = window.KRWMP_PRIVILEGES.can('intervention_progress_update','create'); document.querySelector('.krwmp-panel-section')?.classList.add('hidden'); document.getElementById('section-data-layers')?.classList.add('hidden'); document.getElementById('section-raster-layers')?.classList.add('hidden'); }
function applyPermissions() { if (canManage) document.getElementById('writePanel').classList.remove('hidden'); document.querySelectorAll('.manage-actions').forEach(el => el.classList.toggle('hidden', !(canManage || canUpdateProgress))); }

function applyDateFieldIcons() {
  document.querySelectorAll('input[type="date"]').forEach(input => {
    if (input.dataset.calendarIconApplied === 'true') return;
    input.dataset.calendarIconApplied = 'true';
    input.classList.add('calendar-date-input');
    if (!input.parentElement.classList.contains('calendar-field')) {
      const wrapper = document.createElement('span');
      wrapper.className = 'calendar-field block relative mt-1';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }
  });
  if (!document.getElementById('calendarFieldStyle')) {
    const style = document.createElement('style');
    style.id = 'calendarFieldStyle';
    style.textContent = `.calendar-field::after{content:'📅';position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:13px;opacity:.8}.calendar-date-input{padding-right:2.4rem!important;color-scheme:dark}.calendar-date-input::-webkit-calendar-picker-indicator{opacity:0;position:absolute;right:0;width:2.4rem;height:100%;cursor:pointer}`;
    document.head.appendChild(style);
  }
}

async function loadLibrary() { const data = await json('/api/interventions/library'); librarySelect.innerHTML = '<option value="">Select intervention type</option>'; (data.library || []).filter(i => i.active !== false).forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = i.intervention_name; librarySelect.appendChild(o); }); }
async function loadDsds(selected = '') { const data = await json('/api/interventions/lookups/dsds'); dsdSelect.innerHTML = '<option value="">Select DSD</option>'; (data.dsds || []).forEach(row => { const o = document.createElement('option'); o.value = row.dsd_name; o.textContent = row.dsd_name; if (row.dsd_name === selected) o.selected = true; dsdSelect.appendChild(o); }); }
async function loadGnds(dsdName = '', selected = '') { gndSelect.innerHTML = '<option value="">Loading GNDs...</option>'; const url = dsdName ? `/api/interventions/lookups/gnds?dsd_name=${encodeURIComponent(dsdName)}` : '/api/interventions/lookups/gnds'; const data = await json(url); gndSelect.innerHTML = '<option value="">Select GND</option>'; (data.gnds || []).forEach(row => { const o = document.createElement('option'); o.value = row.gnd_name; o.textContent = row.gnd_name; if (row.gnd_name === selected) o.selected = true; gndSelect.appendChild(o); }); }
async function loadInstitutions(selected = '') { const data = await json('/api/interventions/lookups/institutions'); institutionSelect.innerHTML = '<option value="">Select institution</option>'; (data.institutions || []).forEach(row => { const o = document.createElement('option'); o.value = row.institution_name; o.textContent = row.institution_name; if (row.institution_name === selected) o.selected = true; institutionSelect.appendChild(o); }); }

async function loadRegistry() {
  list.innerHTML = '<p class="text-sm text-slate-400">Loading interventions...</p>';
  const data = await json('/api/interventions/registry');
  interventionRecords = data.interventions || [];
  if (currentPage > totalPages()) currentPage = totalPages();
  renderRegistryPage();
}

function totalPages() { return Math.max(1, Math.ceil(interventionRecords.length / pageSize)); }
function paginatedRecords() { const start = (currentPage - 1) * pageSize; return interventionRecords.slice(start, start + pageSize); }
function renderRegistryPage() {
  list.innerHTML = '';
  if (!interventionRecords.length) {
    list.innerHTML = '<p class="text-sm text-slate-400">No interventions registered.</p>';
    return;
  }
  paginatedRecords().forEach(renderIntervention);
  renderPagination();
  applyPermissions();
  applyDateFieldIcons();
}

function renderPagination() {
  const total = totalPages();
  const pager = document.createElement('div');
  pager.className = 'flex items-center justify-between border-t border-slate-800 pt-4 mt-4 text-xs text-slate-400';
  pager.innerHTML = `<div>Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, interventionRecords.length)} of ${interventionRecords.length} interventions</div><div class="flex items-center gap-2"><button id="prevPageBtn" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${total}</span><button id="nextPageBtn" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === total ? 'disabled' : ''}>Next</button></div>`;
  list.appendChild(pager);
  pager.querySelector('#prevPageBtn')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderRegistryPage(); });
  pager.querySelector('#nextPageBtn')?.addEventListener('click', () => { currentPage = Math.min(total, currentPage + 1); renderRegistryPage(); });
}

function renderIntervention(item) {
  const card = document.createElement('article');
  card.className = 'bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4';
  const progress = Number(item.progress_percent || 0);
  card.innerHTML = `<div class="flex justify-between gap-4"><div><h3 class="font-bold text-slate-100">${escapeHtml(item.intervention_title)} (${escapeHtml(item.intervention_code)})</h3><p class="text-xs text-slate-500">${escapeHtml(item.library_name || '-')} · ${escapeHtml(item.status || '-')} · ${escapeHtml(item.priority || '-')} · ${escapeHtml(item.dsd_name || '-')} / ${escapeHtml(item.gnd_name || '-')}</p><p class="text-[10px] text-slate-600">Updated by ${escapeHtml(item.updated_by || '-')} on ${formatDate(item.updated_at)}</p></div><div class="manage-actions hidden flex gap-2"><button data-edit="${item.id}" class="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-xs font-bold">Edit</button><button data-delete="${item.id}" class="bg-rose-700 hover:bg-rose-600 px-3 py-1.5 rounded text-xs font-bold">Delete</button></div></div><div><div class="flex justify-between text-xs text-slate-400 mb-1"><span>Progress</span><strong>${progress}%</strong></div><div class="h-2 rounded bg-slate-800 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${Math.max(0, Math.min(100, progress))}%"></div></div></div><div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div><h4 class="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-2">Action Timeline & Responsible Officers</h4><div class="space-y-3">${actionOfficerCardsHtml(item.timeline || [], item.officers || [])}</div></div><div class="manage-actions hidden"><form class="action-officer-form bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2"><h4 class="text-xs uppercase tracking-widest text-emerald-400 font-bold">Action & Responsible Officer</h4><input type="date" name="action_date" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="action_title" required placeholder="Action title" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><textarea name="action_description" placeholder="Action details" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"></textarea><input name="progress_percent" type="number" min="0" max="100" placeholder="Progress %" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="officer_name" required placeholder="Responsible officer name" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="designation" placeholder="Designation" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><select name="institution" class="officer-institution-select w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm">${institutionOptions()}</select><input name="officer_contact" placeholder="Officer contact number" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="responsibility" placeholder="Responsibility for this action" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><button class="w-full bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm font-bold">Save Action & Officer</button></form></div></div>`;
  list.appendChild(card);
  card.querySelector('[data-edit]')?.classList.toggle('hidden', !window.KRWMP_PRIVILEGES.can('intervention_registry_manage','update'));
  card.querySelector('[data-delete]')?.classList.toggle('hidden', !window.KRWMP_PRIVILEGES.can('intervention_registry_manage','delete'));
  card.querySelector('.action-officer-form')?.classList.toggle('hidden', !canUpdateProgress);
  card.querySelector('[data-edit]')?.addEventListener('click', () => fillForm(item));
  card.querySelector('[data-delete]')?.addEventListener('click', () => deleteIntervention(item.id));
  card.querySelector('.action-officer-form')?.addEventListener('submit', e => saveActionWithOfficer(e, item.id));
}

function institutionOptions() { return Array.from(institutionSelect.options).map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.textContent)}</option>`).join(''); }
function actionOfficerCardsHtml(timeline, officers) {
  if (!timeline.length && !officers.length) return '<p class="text-xs text-slate-500">No actions or responsible officers recorded.</p>';
  const officerLookup = new Map((officers || []).map(o => [String(o.officer_name || '').toLowerCase(), o]));
  const actionCards = (timeline || []).map(t => {
    const officer = officerLookup.get(String(t.officer_name || '').toLowerCase()) || {};
    return `<div class="bg-slate-900/70 border border-slate-800 rounded-lg p-3 text-xs space-y-2"><div class="flex items-start justify-between gap-3"><div><strong class="text-slate-100">${escapeHtml(t.action_title)}</strong><div class="text-slate-500">${formatDate(t.action_date)} · ${escapeHtml(t.action_status || 'completed')} · ${escapeHtml(t.progress_percent ?? '')}%</div></div><span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">${escapeHtml(t.progress_percent ?? 0)}%</span></div><p class="text-slate-300">${escapeHtml(t.action_description || '-')}</p><div class="border-t border-slate-800 pt-2"><div class="font-bold text-emerald-400">Responsible Officer</div><div class="text-slate-200">${escapeHtml(t.officer_name || officer.officer_name || '-')}</div><div class="text-slate-500">${escapeHtml(officer.designation || '-')} · ${escapeHtml(officer.institution || '-')}</div><div class="text-slate-500">${escapeHtml(t.officer_contact || officer.phone || '-')} · ${escapeHtml(officer.responsibility || '-')}</div></div></div>`;
  }).join('');
  const unmatchedOfficerCards = (officers || []).filter(o => !(timeline || []).some(t => String(t.officer_name || '').toLowerCase() === String(o.officer_name || '').toLowerCase())).map(o => `<div class="bg-slate-900/70 border border-slate-800 rounded-lg p-3 text-xs"><div class="font-bold text-emerald-400">Responsible Officer</div><div class="text-slate-200">${escapeHtml(o.officer_name || '-')}</div><div class="text-slate-500">${escapeHtml(o.designation || '-')} · ${escapeHtml(o.institution || '-')}</div><div class="text-slate-500">${escapeHtml(o.phone || '-')} · ${escapeHtml(o.responsibility || '-')}</div></div>`).join('');
  return actionCards + unmatchedOfficerCards;
}

async function fillForm(item) { form.id.value = item.id; form.library_id.value = item.library_id || ''; form.intervention_title.value = item.intervention_title || ''; form.location_name.value = item.location_name || ''; form.village_name.value = item.village_name || ''; await loadDsds(item.dsd_name || ''); await loadGnds(item.dsd_name || '', item.gnd_name || ''); form.latitude.value = item.latitude || ''; form.longitude.value = item.longitude || ''; form.priority.value = item.priority || 'medium'; form.status.value = item.status || 'planned'; form.progress_percent.value = item.progress_percent || 0; form.planned_start_date.value = item.planned_start_date || ''; form.planned_end_date.value = item.planned_end_date || ''; form.actual_start_date.value = item.actual_start_date || ''; form.actual_end_date.value = item.actual_end_date || ''; form.lead_officer_name.value = item.lead_officer_name || ''; form.lead_officer_contact.value = item.lead_officer_contact || ''; form.implementing_office.value = item.implementing_office || ''; form.remarks.value = item.remarks || ''; applyDateFieldIcons(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

form.addEventListener('submit', async e => { e.preventDefault(); const body = Object.fromEntries(new FormData(form)); const id = body.id; delete body.id; if (id && !window.KRWMP_PRIVILEGES.can('intervention_registry_manage','update')) return show('You do not have update access for interventions.', true); if (!id && !window.KRWMP_PRIVILEGES.can('intervention_registry_manage','create')) return show('You do not have create access for interventions.', true); try { if (id) await json(`/api/interventions/registry/${id}`, { method: 'PUT', body }); else await json('/api/interventions/registry', { method: 'POST', body }); form.reset(); await loadGnds(''); show('Intervention saved.'); await loadRegistry(); } catch (err) { show(err.message, true); } });

async function saveActionWithOfficer(e, id) {
  e.preventDefault();
  if (!canUpdateProgress) return show('You do not have progress update access for interventions.', true);
  const body = Object.fromEntries(new FormData(e.target));
  const officerName = body.officer_name || '';
  const officerContact = body.officer_contact || '';
  try {
    await json(`/api/interventions/registry/${id}/timeline`, { method: 'POST', body: { action_date: body.action_date, action_title: body.action_title, action_description: body.action_description, progress_percent: body.progress_percent, officer_name: officerName, officer_contact: officerContact, action_status: 'completed' } });
    await json(`/api/interventions/registry/${id}/officers`, { method: 'POST', body: { officer_name: officerName, designation: body.designation, institution: body.institution, phone: officerContact, responsibility: body.responsibility || body.action_title } });
    show('Action and responsible officer saved.');
    e.target.reset();
    await loadRegistry();
  } catch (err) { show(err.message, true); }
}

async function deleteIntervention(id) {
  if (!window.KRWMP_PRIVILEGES.can('intervention_registry_manage','delete')) return show('You do not have delete access for interventions.', true);
  if (!confirm('Delete this registered intervention, including its action timeline and officer records?')) return;
  try {
    await json(`/api/interventions/registry/${id}`, { method: 'DELETE' });
    show('Intervention deleted.');
    await loadRegistry();
  } catch (err) { show(err.message, true); }
}

dsdSelect.addEventListener('change', () => loadGnds(dsdSelect.value));
document.getElementById('useLocationBtn').addEventListener('click', () => { if (!navigator.geolocation) return show('Geolocation is not available.', true); navigator.geolocation.getCurrentPosition(pos => { document.getElementById('latInput').value = pos.coords.latitude.toFixed(7); document.getElementById('lngInput').value = pos.coords.longitude.toFixed(7); show('Current location captured.'); }, () => show('Unable to capture location.', true)); });
document.getElementById('resetBtn').addEventListener('click', () => { form.reset(); loadGnds(''); applyDateFieldIcons(); }); document.getElementById('refreshBtn').addEventListener('click', loadRegistry);
function formatDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString(); }
(async () => { await initSidebar(); await Promise.all([loadLibrary(), loadDsds(), loadInstitutions()]); await loadGnds(''); applyPermissions(); applyDateFieldIcons(); await loadRegistry(); })().catch(e => show(e.message, true));
