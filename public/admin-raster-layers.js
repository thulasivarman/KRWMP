const currentRasterUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const currentRasterRole = String(currentRasterUser?.role_name || currentRasterUser?.role || '').toLowerCase();
const MAX_RASTER_CLASSES = 10;
const DEFAULT_CLASS_COLORS = ['#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d73027', '#7f0000'];

function rasterAdminHeaders(extra = {}) {
  return {
    ...extra,
    'X-KRWMP-User': currentRasterUser?.identifier || currentRasterUser?.username || 'admin',
    'X-KRWMP-Role': currentRasterUser?.role_name || currentRasterUser?.role || 'admin'
  };
}

async function rasterAdminRequest(url, options = {}) {
  options.headers = rasterAdminHeaders(options.headers || {});
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.message || 'Request failed');
  return payload;
}

function showRasterAdminStatus(message, isError = false) {
  const box = document.getElementById('statusBox');
  if (!box) return;
  box.hidden = false;
  box.textContent = message;
  box.className = `status-box ${isError ? 'error' : 'success'}`;
}

async function initializeRasterAdminSidebar() {
  if (window.KRWMP_ENGINE) {
    await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  }
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

async function loadRasterAdminLayers() {
  const list = document.getElementById('rasterLayersList');
  if (!list) return;
  list.innerHTML = '<p>Loading raster layers...</p>';

  try {
    const payload = await rasterAdminRequest('/api/raster-layers/admin');
    list.innerHTML = '';

    if (!payload.layers || payload.layers.length === 0) {
      list.innerHTML = '<p>No raster layers found.</p>';
      return;
    }

    payload.layers.forEach(layer => renderRasterAdminLayer(layer));
  } catch (error) {
    list.innerHTML = '';
    showRasterAdminStatus(error.message, true);
  }
}

function normalizeLayerSymbology(layer) {
  const raw = layer.symbology || {};
  const classes = Array.isArray(raw.classes) ? raw.classes.slice(0, MAX_RASTER_CLASSES) : [];
  return {
    mode: raw.mode === 'classified' || layer.symbology_mode === 'classified' ? 'classified' : 'stretch',
    classes
  };
}

function renderRasterAdminLayer(layer) {
  const list = document.getElementById('rasterLayersList');
  const template = document.getElementById('rasterLayerTemplate');
  if (!list || !template) return;

  const node = template.content.cloneNode(true);
  const form = node.querySelector('.style-form');
  const symbology = normalizeLayerSymbology(layer);

  node.querySelector('[data-field="name"]').textContent = layer.layer_name || layer.layer_key;
  node.querySelector('[data-field="meta"]').textContent = `${layer.layer_key} | ${layer.file_name || ''} | ${layer.file_url || ''}`;

  form.id.value = layer.layer_key;
  form.opacity.value = layer.opacity ?? 0.7;
  form.minZoom.value = layer.min_zoom ?? 0;
  form.maxZoom.value = layer.max_zoom ?? 22;
  form.visible.checked = Boolean(layer.default_visible);

  form.insertAdjacentHTML('beforeend', renderSymbologyEditor(symbology));
  bindSymbologyEditor(form);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      opacity: Number(form.opacity.value),
      minZoom: Number(form.minZoom.value),
      maxZoom: Number(form.maxZoom.value),
      visible: form.visible.checked,
      symbology: collectSymbology(form)
    };
    try {
      showRasterAdminStatus('Applying raster settings and regenerating preview...');
      await rasterAdminRequest(`/api/raster-layers/${encodeURIComponent(form.id.value)}`, {
        method: 'PUT',
        headers: rasterAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      showRasterAdminStatus('Raster settings and symbology updated successfully.');
      await loadRasterAdminLayers();
    } catch (error) {
      showRasterAdminStatus(error.message, true);
    }
  });

  node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!confirm(`Delete raster layer ${layer.layer_name || layer.layer_key}?`)) return;
    try {
      await rasterAdminRequest(`/api/raster-layers/${encodeURIComponent(layer.layer_key)}`, { method: 'DELETE' });
      showRasterAdminStatus('Raster layer deleted successfully.');
      await loadRasterAdminLayers();
    } catch (error) {
      showRasterAdminStatus(error.message, true);
    }
  });

  list.appendChild(node);
}

function renderSymbologyEditor(symbology) {
  const rows = Array.from({ length: MAX_RASTER_CLASSES }).map((_, index) => {
    const cls = symbology.classes[index] || {};
    return `<div class="raster-class-row grid grid-cols-12 gap-2 items-center" data-class-index="${index}">
      <input type="checkbox" class="class-enabled col-span-1" ${cls.min !== undefined && cls.max !== undefined ? 'checked' : ''} title="Enable class">
      <input type="number" step="any" class="class-min col-span-3 bg-slate-950 border border-slate-800 rounded px-2 py-1" placeholder="Min" value="${escapeAttr(cls.min ?? '')}">
      <input type="number" step="any" class="class-max col-span-3 bg-slate-950 border border-slate-800 rounded px-2 py-1" placeholder="Max" value="${escapeAttr(cls.max ?? '')}">
      <input type="color" class="class-color col-span-2 bg-slate-950 border border-slate-800 rounded" value="${escapeAttr(cls.color || DEFAULT_CLASS_COLORS[index])}">
      <input type="text" class="class-label col-span-3 bg-slate-950 border border-slate-800 rounded px-2 py-1" placeholder="Label" value="${escapeAttr(cls.label || '')}">
    </div>`;
  }).join('');

  return `<section class="raster-symbology-box mt-4 pt-4 border-t border-slate-800 space-y-3 text-xs">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h4 class="font-bold uppercase tracking-wider text-emerald-400">Raster Symbology</h4>
        <p class="text-[10px] text-slate-500 mt-1">Classified heat-map symbology supports up to 10 value classes.</p>
      </div>
      <select name="symbologyMode" class="bg-slate-950 border border-slate-800 rounded px-2 py-1">
        <option value="stretch" ${symbology.mode === 'stretch' ? 'selected' : ''}>Stretch / Original</option>
        <option value="classified" ${symbology.mode === 'classified' ? 'selected' : ''}>Classified Heat Map</option>
      </select>
    </div>
    <div class="grid grid-cols-12 gap-2 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
      <div class="col-span-1">Use</div><div class="col-span-3">Min</div><div class="col-span-3">Max</div><div class="col-span-2">Color</div><div class="col-span-3">Label</div>
    </div>
    <div class="space-y-2">${rows}</div>
  </section>`;
}

function bindSymbologyEditor(form) {
  const modeSelect = form.elements.symbologyMode;
  const rows = Array.from(form.querySelectorAll('.raster-class-row'));
  function sync() {
    const disabled = modeSelect.value !== 'classified';
    rows.forEach(row => row.classList.toggle('opacity-40', disabled));
  }
  modeSelect.addEventListener('change', sync);
  sync();
}

function collectSymbology(form) {
  const mode = form.elements.symbologyMode?.value === 'classified' ? 'classified' : 'stretch';
  const classes = Array.from(form.querySelectorAll('.raster-class-row')).map(row => {
    if (!row.querySelector('.class-enabled').checked) return null;
    const min = Number(row.querySelector('.class-min').value);
    const max = Number(row.querySelector('.class-max').value);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return {
      min: low,
      max: high,
      color: row.querySelector('.class-color').value,
      label: row.querySelector('.class-label').value || `${low} - ${high}`
    };
  }).filter(Boolean).slice(0, MAX_RASTER_CLASSES);
  return { mode, classes };
}

document.addEventListener('DOMContentLoaded', async () => {
  await initializeRasterAdminSidebar();

  if (currentRasterRole !== 'admin') {
    const authNotice = document.getElementById('authNotice');
    if (authNotice) authNotice.hidden = false;
    window.setTimeout(() => { window.location.href = '/index.html'; }, 800);
    return;
  }

  const uploadForm = document.getElementById('uploadRasterForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(uploadForm);
      formData.set('visible', uploadForm.visible.checked ? 'true' : 'false');
      try {
        await rasterAdminRequest('/api/raster-layers/upload', { method: 'POST', body: formData });
        uploadForm.reset();
        uploadForm.opacity.value = 0.7;
        uploadForm.minZoom.value = 0;
        uploadForm.maxZoom.value = 22;
        showRasterAdminStatus('Raster layer uploaded successfully. Open the layer card below to apply heat-map classes.');
        await loadRasterAdminLayers();
      } catch (error) {
        showRasterAdminStatus(error.message, true);
      }
    });
  }

  document.getElementById('refreshRasterBtn')?.addEventListener('click', loadRasterAdminLayers);
  await loadRasterAdminLayers();
});

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}