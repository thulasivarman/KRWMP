let canCreateLibrary = false;
let canUpdateLibrary = false;
let canDeleteLibrary = false;
let libraryRecords = [];

const statusBox = document.getElementById('statusBox');
const list = document.getElementById('libraryList');
const searchInput = document.getElementById('searchInput');
const addLibraryBtn = document.getElementById('addLibraryBtn');
const viewModal = document.getElementById('viewModal');
const viewModalContent = document.getElementById('viewModalContent');

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;
function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
function formatDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(); }
function openModal(dialog) { if (dialog) (typeof dialog.showModal === 'function' ? dialog.showModal() : dialog.setAttribute('open', 'open')); }
function closeModal(dialog) { if (dialog) (typeof dialog.close === 'function' ? dialog.close() : dialog.removeAttribute('open')); }

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('intervention_library_manage', 'view');
  canCreateLibrary = window.KRWMP_PRIVILEGES.can('intervention_library_manage', 'create');
  canUpdateLibrary = window.KRWMP_PRIVILEGES.can('intervention_library_manage', 'update');
  canDeleteLibrary = window.KRWMP_PRIVILEGES.can('intervention_library_manage', 'delete');
  addLibraryBtn.classList.toggle('hidden', !canCreateLibrary);
}

function badge(value) {
  return `<span class="krwmp-badge krwmp-badge-info">${escapeHtml(value || '-')}</span>`;
}

function filteredRecords() {
  const q = String(searchInput.value || '').trim().toLowerCase();
  if (!q) return libraryRecords;
  return libraryRecords.filter(item => [item.intervention_name, item.intervention_category, item.description, item.responsible_institution].some(value => String(value || '').toLowerCase().includes(q)));
}

function detailRows(item) {
  return `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
      <div><span class="text-slate-500">Category:</span> ${escapeHtml(item.intervention_category || '-')}</div>
      <div><span class="text-slate-500">Priority:</span> ${escapeHtml(item.default_priority || '-')}</div>
      <div><span class="text-slate-500">Responsible Institution:</span> ${escapeHtml(item.responsible_institution || '-')}</div>
      <div><span class="text-slate-500">Status:</span> ${item.active === false ? 'Inactive' : 'Active'}</div>
    </div>
    <div><h4 class="text-xs uppercase tracking-wide text-slate-500">Description</h4><p class="mt-1 text-sm text-slate-300 whitespace-pre-line">${escapeHtml(item.description || '-')}</p></div>
    <div><h4 class="text-xs uppercase tracking-wide text-slate-500">Standard Actions</h4><p class="mt-1 text-sm text-slate-300 whitespace-pre-line">${escapeHtml(item.standard_actions || '-')}</p></div>
    <div><h4 class="text-xs uppercase tracking-wide text-slate-500">Expected Outputs</h4><p class="mt-1 text-sm text-slate-300 whitespace-pre-line">${escapeHtml(item.expected_outputs || '-')}</p></div>
    <p class="text-[11px] text-slate-600">Updated by ${escapeHtml(item.updated_by || '-')} on ${formatDate(item.updated_at)}</p>
  `;
}

function renderLibrary() {
  const rows = filteredRecords();
  if (!rows.length) {
    list.innerHTML = '<div class="krwmp-empty-state">No intervention library records found.</div>';
    return;
  }
  list.innerHTML = rows.map((item, index) => `
    <article class="krwmp-card overflow-hidden" data-record-id="${escapeHtml(item.id)}">
      <button type="button" data-accordion-toggle="${escapeHtml(item.id)}" class="w-full text-left p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap gap-2 items-center">
            <h3 class="font-semibold text-slate-100">${escapeHtml(item.intervention_name || '-')}</h3>
            ${badge(item.default_priority)}
            <span class="krwmp-badge ${item.active === false ? 'krwmp-badge-warning' : 'krwmp-badge-info'}">${item.active === false ? 'Inactive' : 'Active'}</span>
          </div>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(item.intervention_category || '-')} · ${escapeHtml(item.responsible_institution || '-')}</p>
        </div>
        <span class="text-xs text-slate-500">${index === 0 ? 'Expanded' : 'Click to expand'}</span>
      </button>
      <div data-accordion-panel="${escapeHtml(item.id)}" class="${index === 0 ? '' : 'hidden'} border-t border-slate-800 p-4 krwmp-stack-sm">
        ${detailRows(item)}
        <div class="krwmp-table-actions pt-2">
          <button type="button" data-view="${escapeHtml(item.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button>
          <a href="/intervention-library-form.html?id=${encodeURIComponent(item.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${canUpdateLibrary ? '' : 'hidden'}">Edit</a>
          <button type="button" data-delete="${escapeHtml(item.id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDeleteLibrary ? '' : 'hidden'}">Delete</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function loadLibrary() {
  list.innerHTML = '<div class="krwmp-loading-state">Loading intervention library...</div>';
  const data = await json('/api/interventions/library');
  libraryRecords = data.library || [];
  renderLibrary();
}

function showDetails(item) {
  viewModalContent.innerHTML = `
    <section class="krwmp-card-muted p-4 krwmp-stack-sm">
      <div class="flex flex-wrap gap-2 items-center">
        <h3 class="font-semibold text-slate-100">${escapeHtml(item.intervention_name || '-')}</h3>
        ${badge(item.default_priority)}
      </div>
      ${detailRows(item)}
    </section>
  `;
  openModal(viewModal);
}

async function deleteItem(id) {
  if (!canDeleteLibrary) return show('You do not have delete access for Intervention Library.', true);
  if (!confirm('Delete this intervention library item? This will mark the record as inactive.')) return;
  await json(`/api/interventions/library/${id}`, { method: 'DELETE' });
  show('Intervention library item deleted.');
  await loadLibrary();
}

function bindEvents() {
  document.getElementById('refreshBtn').addEventListener('click', loadLibrary);
  searchInput.addEventListener('input', renderLibrary);
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(document.getElementById(button.dataset.closeModal))));
  list.addEventListener('click', event => {
    const toggle = event.target.closest('[data-accordion-toggle]');
    const view = event.target.closest('[data-view]');
    const del = event.target.closest('[data-delete]');
    if (view) {
      event.stopPropagation();
      const item = libraryRecords.find(row => String(row.id) === String(view.dataset.view));
      if (item) showDetails(item);
      return;
    }
    if (del) {
      event.stopPropagation();
      deleteItem(del.dataset.delete).catch(error => show(error.message, true));
      return;
    }
    if (toggle) {
      const id = toggle.dataset.accordionToggle;
      const panel = list.querySelector(`[data-accordion-panel="${CSS.escape(id)}"]`);
      panel?.classList.toggle('hidden');
    }
  });
}

(async () => { await initSidebar(); bindEvents(); await loadLibrary(); })().catch(e => show(e.message, true));
