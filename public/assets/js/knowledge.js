(() => {
  const apiBase = '/api';
  const qs = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fileTypes = new Set(['pdf', 'document', 'image', 'file', 'research_paper', 'guideline', 'case_study']);
  const linkTypes = new Set(['external_link', 'url', 'video_link', 'video']);

  let categories = [];
  let resources = [];
  let locationMap;
  let locationMarker;
  let isAdmin = false;

  async function getJson(url) {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
    return data;
  }

  async function sendBody(url, method, body) {
    const options = { method, body };
    if (!(body instanceof FormData)) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.message || 'Request failed');
    return data;
  }

  function syncAdminUi() {
    const profile = window.KRWMP_ENGINE?.Session?.user || {};
    const identifier = String(profile.identifier || profile.username || '').trim().toLowerCase();
    const roleName = String(profile.role_name || profile.role || '').trim().toLowerCase();
    isAdmin = identifier === 'thulasi' || roleName === 'admin';
    document.querySelectorAll('.admin-only-field').forEach(el => el.classList.toggle('hidden', !isAdmin));
  }

  function renderCategories() {
    const options = categories.map(c => `<option value="${esc(c.id)}">${esc(c.category_name)}</option>`).join('');
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
      return `<article class="p-4 hover:bg-slate-800/40"><div class="flex justify-between gap-4"><div><h3 class="font-bold text-lg">${esc(item.title)}</h3><p class="text-sm text-slate-400 mt-1">${esc(item.summary || item.abstract || 'No summary provided.')}</p><div class="flex flex-wrap gap-2 mt-3 text-xs"><span class="px-2 py-1 rounded border border-slate-700">${esc(item.content_type)}</span><span class="px-2 py-1 rounded border border-slate-700">${esc(item.category_name || 'Uncategorised')}</span><span class="px-2 py-1 rounded border border-emerald-500/30 text-emerald-300">${esc(item.status)}</span>${item.latitude && item.longitude ? '<span class="px-2 py-1 rounded border border-sky-500/30 text-sky-300">GIS Linked</span>' : ''}</div></div><div class="flex flex-col gap-2 text-xs min-w-24">${openUrl ? `<a class="px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-center" href="${esc(openUrl)}" target="_blank" rel="noopener">Open</a>` : ''}<button class="btn-edit px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-600" data-id="${esc(item.id)}">Edit</button></div></div></article>`;
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
      getJson(`${apiBase}/knowledge/categories?include_inactive=true`),
      getJson(`${apiBase}/knowledge/dashboard`),
      getJson(`${apiBase}/knowledge?${params.toString()}`)
    ]);
    categories = catData.categories || [];
    resources = resourceData.resources || [];
    renderCategories();
    renderDashboard(dashData.dashboard || {});
    renderResources();
  }

  function syncContentSourceControls() {
    const type = qs('content-type').value;
    const fileSection = qs('fileUploadSection');
    const linkSection = qs('externalLinkSection');
    const form = qs('knowledge-form');

    fileSection.classList.toggle('hidden', !fileTypes.has(type));
    linkSection.classList.toggle('hidden', !linkTypes.has(type));

    if (fileTypes.has(type)) {
      form.elements.external_url.value = '';
    } else if (linkTypes.has(type)) {
      form.elements.file_url.value = '';
      form.elements.resource_file.value = '';
    } else {
      form.elements.external_url.value = '';
      form.elements.file_url.value = '';
      form.elements.resource_file.value = '';
    }
  }

  function setLocation(latitude, longitude) {
    const form = qs('knowledge-form');
    form.elements.latitude.value = latitude ? Number(latitude).toFixed(7) : '';
    form.elements.longitude.value = longitude ? Number(longitude).toFixed(7) : '';
    qs('selected-location-label').textContent = latitude && longitude ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}` : 'No location selected';

    if (!locationMap || !latitude || !longitude) return;
    const lngLat = [Number(longitude), Number(latitude)];
    if (!locationMarker) locationMarker = new maplibregl.Marker({ draggable: true }).setLngLat(lngLat).addTo(locationMap);
    else locationMarker.setLngLat(lngLat);
    locationMarker.off?.('dragend');
    locationMarker.on('dragend', () => {
      const pos = locationMarker.getLngLat();
      setLocation(pos.lat, pos.lng);
    });
    locationMap.flyTo({ center: lngLat, zoom: Math.max(locationMap.getZoom(), 12), speed: 0.8 });
  }

  function initLocationMap() {
    if (locationMap || !window.maplibregl) return;
    locationMap = new maplibregl.Map({
      container: 'knowledge-location-map',
      style: window.KRWMP_BASEMAPS?.light || 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [80.2280810, 7.2334995],
      zoom: 9
    });
    locationMap.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    locationMap.on('click', event => setLocation(event.lngLat.lat, event.lngLat.lng));
  }

  function openCreate() {
    const form = qs('knowledge-form');
    form.reset();
    form.elements.language.value = 'English';
    form.elements.status.value = 'pending';
    form.elements.id.value = '';
    qs('btn-delete-resource').classList.add('hidden');
    setLocation(null, null);
    syncContentSourceControls();
    qs('knowledge-modal').showModal();
    setTimeout(() => { initLocationMap(); locationMap?.resize(); }, 100);
  }

  function openEdit(id) {
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
    qs('btn-delete-resource').classList.toggle('hidden', !isAdmin);
    syncContentSourceControls();
    qs('knowledge-modal').showModal();
    setTimeout(() => {
      initLocationMap();
      locationMap?.resize();
      setLocation(item.latitude, item.longitude);
    }, 100);
  }

  function buildPayload(form) {
    const formData = new FormData(form);
    if (!isAdmin) {
      formData.delete('status');
      formData.delete('is_featured');
    }
    if (!formData.get('resource_file')?.name) formData.delete('resource_file');
    if (formData.get('tags')) formData.set('tags', JSON.stringify(formData.get('tags').split(',').map(v => v.trim()).filter(Boolean)));
    ['publication_year', 'latitude', 'longitude', 'category_id', 'external_url', 'file_url'].forEach(key => {
      if (formData.get(key) === '') formData.delete(key);
    });
    return formData;
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.elements.id.value;
    const payload = buildPayload(form);
    payload.delete('id');
    if (id) await sendBody(`${apiBase}/knowledge/${id}`, 'PUT', payload);
    else await sendBody(`${apiBase}/knowledge`, 'POST', payload);
    qs('knowledge-modal').close();
    await loadAll();
  }

  async function deleteCurrentResource() {
    const id = qs('knowledge-form').elements.id.value;
    if (!id || !confirm('Delete this Knowledge Resource? It will be hidden from public access.')) return;
    await sendBody(`${apiBase}/knowledge/${id}`, 'DELETE', {});
    qs('knowledge-modal').close();
    await loadAll();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext();
      syncAdminUi();
      await loadAll();
      qs('btn-refresh-knowledge').addEventListener('click', loadAll);
      qs('btn-apply-filters').addEventListener('click', loadAll);
      qs('btn-open-create').addEventListener('click', openCreate);
      qs('btn-close-modal').addEventListener('click', () => qs('knowledge-modal').close());
      qs('btn-cancel-form').addEventListener('click', () => qs('knowledge-modal').close());
      qs('btn-delete-resource').addEventListener('click', deleteCurrentResource);
      qs('content-type').addEventListener('change', syncContentSourceControls);
      qs('knowledge-form').addEventListener('submit', save);
    } catch (error) {
      qs('knowledge-list').innerHTML = `<div class="p-6 text-red-300 text-sm">${esc(error.message)}</div>`;
    }
  });
})();
