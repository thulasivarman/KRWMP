(() => {
  const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS || {};
  const list = document.getElementById('registryList');
  const searchInput = document.getElementById('interventionSearchInput');
  const statusFilter = document.getElementById('interventionStatusFilter');
  if (!json || !list || !searchInput || !statusFilter) return;

  const pageSize = 10;
  let page = 1;
  let total = 0;
  let totalPages = 1;
  let records = [];
  let requestSeq = 0;

  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
  }

  function progress(item = {}) {
    if (Number.isFinite(Number(item.progress_percent))) return Math.round(Number(item.progress_percent));
    const actions = item.timeline || [];
    if (!actions.length) return 0;
    return Math.round(actions.reduce((sum, action) => sum + Number(action.progress_percent || 0), 0) / actions.length);
  }

  function renderCard(item) {
    const value = progress(item);
    return `<article class="krwmp-card krwmp-stack-md" id="intervention-${escapeHtml(item.id)}">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div class="min-w-0">
          <h3 class="font-bold text-slate-100">${escapeHtml(item.intervention_title)} (${escapeHtml(item.intervention_code)})</h3>
          <p class="text-xs text-slate-500">${escapeHtml(item.library_name || '-')} · ${escapeHtml(item.status || '-')} · ${escapeHtml(item.priority || '-')} · ${escapeHtml(item.dsd_name || '-')} / ${escapeHtml(item.gnd_name || '-')}</p>
          <p class="text-[10px] text-slate-600">Updated by ${escapeHtml(item.updated_by || '-')} on ${formatDate(item.updated_at)}</p>
        </div>
        <div class="krwmp-table-actions">
          <button data-perf-view="${escapeHtml(item.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button>
          <button data-perf-edit="${escapeHtml(item.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit</button>
          <button data-perf-action="${escapeHtml(item.id)}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm">Action</button>
          <button data-perf-delete="${escapeHtml(item.id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm">Delete</button>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-xs text-slate-400 mb-1"><span>Calculated Progress</span><span class="krwmp-badge krwmp-badge-success">${value}%</span></div>
        <div class="h-2 rounded bg-slate-800 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${Math.max(0, Math.min(100, value))}%"></div></div>
      </div>
      <div class="text-xs text-slate-400">${escapeHtml((item.timeline || []).length)} action(s) · ${escapeHtml(item.implementing_office || 'No responsible institution')}</div>
    </article>`;
  }

  function render() {
    if (!records.length) {
      list.innerHTML = '<div class="krwmp-empty-state">No interventions found.</div>';
    } else {
      list.innerHTML = records.map(renderCard).join('');
    }
    const start = total ? ((page - 1) * pageSize + 1) : 0;
    const end = Math.min(page * pageSize, total);
    const pager = document.createElement('div');
    pager.className = 'krwmp-pagination';
    pager.innerHTML = `<span class="krwmp-pagination-meta">Showing ${start}-${end} of ${total} interventions</span><div class="krwmp-pagination-controls"><button id="perfPrevPageBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${page === 1 ? 'disabled' : ''}>Previous</button><span>Page ${page} of ${totalPages}</span><button id="perfNextPageBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${page === totalPages ? 'disabled' : ''}>Next</button></div>`;
    list.appendChild(pager);
    pager.querySelector('#perfPrevPageBtn')?.addEventListener('click', () => load(Math.max(1, page - 1)));
    pager.querySelector('#perfNextPageBtn')?.addEventListener('click', () => load(Math.min(totalPages, page + 1)));
  }

  async function load(nextPage = page) {
    const seq = ++requestSeq;
    page = Math.max(1, Number(nextPage || 1));
    list.innerHTML = '<div class="krwmp-loading-state">Loading interventions...</div>';
    const params = new URLSearchParams({ page, limit: pageSize });
    const q = searchInput.value.trim();
    const status = statusFilter.value;
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    const data = await json(`/api/interventions/registry?${params.toString()}`);
    if (seq !== requestSeq) return;
    records = data.interventions || [];
    total = data.pagination?.total ?? records.length;
    totalPages = data.pagination?.total_pages ?? Math.max(1, Math.ceil(total / pageSize));
    render();
  }

  function byId(id) { return records.find(item => String(item.id) === String(id)); }

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-perf-view],[data-perf-edit],[data-perf-action],[data-perf-delete]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const id = button.dataset.perfView || button.dataset.perfEdit || button.dataset.perfAction || button.dataset.perfDelete;
    const item = byId(id);
    if (button.dataset.perfView && typeof window.openViewModal === 'function') return window.openViewModal(id);
    if (!item) return;
    if (button.dataset.perfEdit && typeof window.openFormModal === 'function') return window.openFormModal(item);
    if (button.dataset.perfAction && typeof window.openActionModal === 'function') return window.openActionModal(item);
    if (button.dataset.perfDelete && typeof window.deleteIntervention === 'function') return window.deleteIntervention(id);
  }, true);

  searchInput.addEventListener('input', debounce(() => load(1), 300));
  statusFilter.addEventListener('change', () => load(1));
  document.getElementById('refreshBtn')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    load(page);
  }, true);

  setTimeout(() => load(1).catch(error => console.error(error)), 0);
})();
