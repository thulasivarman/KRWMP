(() => {
  const apiBase = '/api';
  const qs = id => document.getElementById(id);
  const { apiRequest, escapeHtml: esc } = window.KRWMP_UTILS;

  let categories = [];
  let resources = [];
  let canCreateKnowledge = false;
  let canUpdateKnowledge = false;

  function renderCategories() {
    const options = categories.map(c => `<option value="${c.id}">${esc(c.category_name)}</option>`).join('');
    qs('filter-category').innerHTML = `<option value="">All Categories</option>${options}`;
    qs('form-category').innerHTML = `<option value="">Uncategorised</option>${options}`;
  }

  function renderDashboard(dashboard) {
    const s = dashboard.summary || {};
    qs('knowledge-kpis').innerHTML = [
      ['Total Resources', s.total_resources],
      ['Published', s.published_resources],
      ['Pending Review', s.pending_resources],
      ['GIS Linked', s.gis_linked_resources]
    ].map(([label, value]) => `<div class="bg-slate-900 border border-slate-800 rounded-2xl p-4"><div class="text-2xl font-bold text-emerald-300">${esc(value || 0)}</div><div class="text-xs uppercase tracking-wider text-slate-400 mt-1">${esc(label)}</div></div>`).join('');

    qs('chart-type').innerHTML = (dashboard.by_type || []).map(r => `<div class="flex justify-between border-b border-slate-800 pb-1"><span>${esc(r.content_type)}</span><strong>${esc(r.count)}</strong></div>`).join('') || '<p class="text-slate-400">No data.</p>';
    qs('pending-review').innerHTML = (dashboard.pending_review || []).map(r => `<div class="border-b border-slate-800 pb-2"><div class="font-semibold">${esc(r.title)}</div><div class="text-xs text-slate-400">${esc(r.content_type)} - ${esc(r.status)}</div></div>`).join('') || '<p class="text-slate-400">No pending records.</p>';
  }

  function renderResources() {
    qs('resource-count').textContent = `${resources.length} records`;
    qs('knowledge-list').innerHTML = resources.map(item => {
      const openUrl = item.file_url || item.video_url || item.external_url || '';
      return `<article class="p-4 hover:bg-slate-800/40"><div class="flex justify-between gap-4"><div><h3 class="font-bold text-lg">${esc(item.title)}</h3><p class="text-sm text-slate-400 mt-1">${esc(item.summary || item.abstract || 'No summary provided.')}</p><div class="flex flex-wrap gap-2 mt-3 text-xs"><span class="px-2 py-1 rounded border border-slate-700">${esc(item.content_type)}</span><span class="px-2 py-1 rounded border border-slate-700">${esc(item.category_name || 'Uncategorised')}</span><span class="px-2 py-1 rounded border border-emerald-500/30 text-emerald-300">${esc(item.status)}</span></div></div><div class="flex flex-col gap-2 text-xs min-w-24">${openUrl ? `<a class="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-center" href="${esc(openUrl)}">Open</a>` : ''}${canUpdateKnowledge ? `<button class="btn-edit px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600" data-id="${item.id}">Edit</button>` : ''}</div></div></article>`;
    }).join('') || '<div class="p-6 text-slate-400 text-sm">No knowledge resources found.</div>';

    document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', () => openEdit(btn.dataset.id)));
  }

  async function loadAll() {
    const params = new URLSearchParams();
    if (qs('filter-q').value) params.set('q', qs('filter-q').value);
    if (qs('filter-category').value) params.set('category_id', qs('filter-category').value);
    if (qs('filter-type').value) params.set('content_type', qs('filter-type').value);
    if (qs('filter-status').value) params.set('status', qs('filter-status').value);
    const [catData, dashData, resourceData] = await Promise.all([
      apiRequest(`${apiBase}/knowledge/categories?include_inactive=true`),
      apiRequest(`${apiBase}/knowledge/dashboard`),
      apiRequest(`${apiBase}/knowledge?${params.toString()}`)
    ]);
    categories = catData.categories || [];
    resources = resourceData.resources || [];
    renderCategories();
    renderDashboard(dashData.dashboard || {});
    renderResources();
  }

  function openCreate() {
    if (!canCreateKnowledge) return;
    const form = qs('knowledge-form');
    form.reset();
    form.elements.language.value = 'English';
    qs('knowledge-modal').showModal();
  }

  function openEdit(id) {
    if (!canUpdateKnowledge) return;
    const item = resources.find(row => String(row.id) === String(id));
    if (!item) return;
    const form = qs('knowledge-form');
    form.reset();
    Object.keys(item).forEach(key => {
      if (!form.elements[key] || item[key] == null) return;
      if (form.elements[key].type === 'checkbox') form.elements[key].checked = !!item[key];
      else form.elements[key].value = item[key];
    });
    form.elements.id.value = item.id;
    qs('knowledge-modal').showModal();
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const id = body.id;
    delete body.id;
    if (id && !canUpdateKnowledge) throw new Error('You do not have update access for knowledge resources.');
    if (!id && !canCreateKnowledge) throw new Error('You do not have create access for knowledge resources.');
    body.is_featured = form.elements.is_featured.checked;
    body.tags = body.tags ? body.tags.split(',').map(v => v.trim()).filter(Boolean) : [];
    ['publication_year', 'latitude', 'longitude'].forEach(key => { if (body[key] === '') delete body[key]; });
    if (id) await apiRequest(`${apiBase}/knowledge/${id}`, { method: 'PUT', body });
    else await apiRequest(`${apiBase}/knowledge`, { method: 'POST', body });
    qs('knowledge-modal').close();
    await loadAll();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext();
      await window.KRWMP_PRIVILEGES.protectPage('knowledge_portal', 'view');
      canCreateKnowledge = window.KRWMP_PRIVILEGES.can('knowledge_portal', 'create');
      canUpdateKnowledge = window.KRWMP_PRIVILEGES.can('knowledge_portal', 'update');
      qs('btn-open-create')?.classList.toggle('hidden', !canCreateKnowledge);
      await loadAll();
      qs('btn-refresh-knowledge').addEventListener('click', loadAll);
      qs('btn-apply-filters').addEventListener('click', loadAll);
      qs('btn-open-create').addEventListener('click', openCreate);
      qs('btn-close-modal').addEventListener('click', () => qs('knowledge-modal').close());
      qs('btn-cancel-form').addEventListener('click', () => qs('knowledge-modal').close());
      qs('knowledge-form').addEventListener('submit', save);
    } catch (error) {
      qs('knowledge-list').innerHTML = `<div class="p-6 text-red-300 text-sm">${esc(error.message)}</div>`;
    }
  });
})();
