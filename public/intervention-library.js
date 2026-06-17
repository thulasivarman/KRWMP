let canCreateLibrary = false;
let canUpdateLibrary = false;

const statusBox = document.getElementById('statusBox');
const form = document.getElementById('libraryForm');
const list = document.getElementById('libraryList');

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;
function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('intervention_library_manage', 'view');
  canCreateLibrary = window.KRWMP_PRIVILEGES.can('intervention_library_manage', 'create');
  canUpdateLibrary = window.KRWMP_PRIVILEGES.can('intervention_library_manage', 'update');
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}
function applyPermissions() { document.getElementById('writePanel').classList.toggle('hidden', !(canCreateLibrary || canUpdateLibrary)); }
async function loadLibrary() {
  list.innerHTML = '<p class="text-sm text-slate-400">Loading intervention library...</p>';
  const data = await json('/api/interventions/library');
  list.innerHTML = '';
  (data.library || []).forEach(item => {
    const card = document.createElement('article');
    card.className = 'bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-2';
    card.innerHTML = `<div class="flex justify-between gap-3"><div><h3 class="font-bold text-slate-100">${escapeHtml(item.intervention_name)}</h3><p class="text-xs text-slate-500">${escapeHtml(item.intervention_category || '-')} | ${escapeHtml(item.default_priority || '-')}</p></div>${canUpdateLibrary ? `<button data-edit="${item.id}"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit</button>` : ''}</div><p class="text-sm text-slate-300">${escapeHtml(item.description || '')}</p><p class="text-xs text-slate-500">${escapeHtml(item.standard_actions || '')}</p><p class="text-[10px] text-slate-600">Updated by ${escapeHtml(item.updated_by || '-')} on ${formatDate(item.updated_at)}</p>`;
    list.appendChild(card);
    card.querySelector('[data-edit]')?.addEventListener('click', () => fillForm(item));
  });
  if (!list.children.length) list.innerHTML = '<p class="text-sm text-slate-400">No intervention library records found.</p>';
}
function fillForm(item) { if (!canUpdateLibrary) return show('You do not have update access for Intervention Library.', true); form.id.value = item.id; form.intervention_name.value = item.intervention_name || ''; form.intervention_category.value = item.intervention_category || ''; form.default_priority.value = item.default_priority || 'medium'; form.description.value = item.description || ''; form.standard_actions.value = item.standard_actions || ''; form.expected_outputs.value = item.expected_outputs || ''; form.responsible_institution.value = item.responsible_institution || ''; form.active.checked = item.active !== false; window.scrollTo({ top: 0, behavior: 'smooth' }); }
form.addEventListener('submit', async e => { e.preventDefault(); const body = Object.fromEntries(new FormData(form)); body.active = form.active.checked; const id = body.id; delete body.id; if (id && !canUpdateLibrary) return show('You do not have update access for Intervention Library.', true); if (!id && !canCreateLibrary) return show('You do not have create access for Intervention Library.', true); try { if (id) await json(`/api/interventions/library/${id}`, { method: 'PUT', body }); else await json('/api/interventions/library', { method: 'POST', body }); form.reset(); form.active.checked = true; show('Intervention library saved.'); await loadLibrary(); } catch (err) { show(err.message, true); } });
document.getElementById('resetBtn').addEventListener('click', () => { form.reset(); form.active.checked = true; });
document.getElementById('refreshBtn').addEventListener('click', loadLibrary);
function formatDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(); }
(async () => { await initSidebar(); applyPermissions(); await loadLibrary(); })().catch(e => show(e.message, true));
