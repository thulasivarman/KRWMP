let canCreateRasterLayer = false;
let canUpdateRasterLayer = false;
let canDeleteRasterLayer = false;
const MAX_RASTER_CLASSES = 10;
const DEFAULT_CLASS_COLORS = ['#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#ffffbf', '#fee08b', '#fdae61', '#f46d43', '#d73027', '#7f0000'];

const { apiRequest: rasterAdminRequest } = window.KRWMP_UTILS;

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
  await window.KRWMP_PRIVILEGES.protectPage('raster_layers', 'view');
  canCreateRasterLayer = window.KRWMP_PRIVILEGES.can('raster_layers', 'create');
  canUpdateRasterLayer = window.KRWMP_PRIVILEGES.can('raster_layers', 'update');
  canDeleteRasterLayer = window.KRWMP_PRIVILEGES.can('raster_layers', 'delete');
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('uploadRasterForm')?.closest('section')?.classList.toggle('hidden', !canCreateRasterLayer);
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
    if (!canUpdateRasterLayer) return showRasterAdminStatus('You do not have update access for raster layers.', true);
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
        body: payload
      });
      showRasterAdminStatus('Raster settings and symbology updated successfully.');
      await loadRasterAdminLayers();
    } catch (error) {
      showRasterAdminStatus(error.message, true);
    }
  });

  node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    if (!canDeleteRasterLayer) return showRasterAdminStatus('You do not have delete access for raster layers.', true);
    if (!confirm(`Delete raster layer ${layer.layer_name || layer.layer_key}?`)) return;
    try {
      await rasterAdminRequest(`/api/raster-layers/${encodeURIComponent(layer.layer_key)}`, { method: 'DELETE' });
      showRasterAdminStatus('Raster layer deleted successfully.');
      await loadRasterAdminLayers();
    } catch (error) {
      showRasterAdminStatus(error.message, true);
    }
  });
  form.querySelector('button[type="submit"]')?.classList.toggle('hidden', !canUpdateRasterLayer);
  node.querySelector('[data-action="delete"]')?.classList.toggle('hidden', !canDeleteRasterLayer);

  list.appendChild(node);
}

function renderSymbologyEditor(symbology) {
  const rows = Array.from({ length: MAX_RASTER_CLASSES }).map((_, index) => {
    const cls = symbology.classes[index] || {};
    const enabled = cls.min !== undefined && cls.max !== undefined;
    return `<article class="raster-class-row rounded-xl border border-slate-800/80 bg-slate-950/55 p-4 shadow-sm" data-class-index="${index}">
      <div class="flex items-center justify-between gap-3 mb-3">
        <label  class="krwmp-label inline-flex items-center gap-2 text-[11px] uppercase tracking-wider">
          <input type="checkbox"  class="class-enabled h-4 w-4 accent-emerald-500" ${enabled ? 'checked' : ''}>
          Class ${index + 1}
        </label>
        <div class="flex items-center gap-2">
          <span class="h-5 w-8 rounded-md border border-white/20 shadow-inner" style="background:${escapeAttr(cls.color || DEFAULT_CLASS_COLORS[index])}"></span>
          <span class="text-[10px] text-slate-500">${escapeAttr(cls.color || DEFAULT_CLASS_COLORS[index])}</span>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <label class="md:col-span-2 space-y-1">
          <span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Min Value</span>
          <input type="number" step="any"  class="form-input class-min" placeholder="0" value="${escapeAttr(cls.min ?? '')}">
        </label>
        <label class="md:col-span-2 space-y-1">
          <span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Max Value</span>
          <input type="number" step="any"  class="form-input class-max" placeholder="10" value="${escapeAttr(cls.max ?? '')}">
        </label>
        <label class="md:col-span-2 space-y-1">
          <span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Color</span>
          <div class="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5">
            <input type="color"  class="class-color h-9 w-12 rounded border border-slate-600 bg-transparent cursor-pointer" value="${escapeAttr(cls.color || DEFAULT_CLASS_COLORS[index])}">
            <span class="class-color-text text-[10px] font-mono text-slate-400">${escapeAttr(cls.color || DEFAULT_CLASS_COLORS[index])}</span>
          </div>
        </label>
        <label class="md:col-span-6 space-y-1">
          <span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Legend Label</span>
          <input type="text"  class="form-input class-label" placeholder="Very Low / Low / Moderate / High" value="${escapeAttr(cls.label || '')}">
        </label>
      </div>
    </article>`;
  }).join('');

  return `<section class="raster-symbology-box mt-5 rounded-2xl border border-slate-800 bg-slate-950/35 p-5 space-y-5 text-xs">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-4">
      <div>
        <h4 class="font-bold uppercase tracking-wider text-emerald-400">Raster Symbology</h4>
        <p class="text-[11px] text-slate-500 mt-1 leading-relaxed">Define up to 10 clean heat-map value classes. Enabled classes will be used to regenerate the map preview.</p>
      </div>
      <label class="space-y-1 min-w-[220px]">
        <span class="block text-[10px] uppercase tracking-wider text-slate-500 font-bold">Render Mode</span>
        <select name="symbologyMode"  class="form-select">
          <option value="stretch" ${symbology.mode === 'stretch' ? 'selected' : ''}>Stretch / Original</option>
          <option value="classified" ${symbology.mode === 'classified' ? 'selected' : ''}>Classified Heat Map</option>
        </select>
      </label>
    </div>
    <div class="grid grid-cols-1 gap-3">${rows}</div>
  </section>`;
}

function bindSymbologyEditor(form) {
  const modeSelect = form.elements.symbologyMode;
  const rows = Array.from(form.querySelectorAll('.raster-class-row'));
  function sync() {
    const disabled = modeSelect.value !== 'classified';
    rows.forEach(row => {
      row.classList.toggle('opacity-50', disabled);
      row.querySelectorAll('input').forEach(input => {
        if (!input.classList.contains('class-enabled')) input.disabled = disabled;
      });
    });
  }
  form.querySelectorAll('.class-color').forEach(input => {
    input.addEventListener('input', () => {
      const row = input.closest('.raster-class-row');
      const swatch = row?.querySelector('span[style^="background"]');
      const text = row?.querySelector('.class-color-text');
      if (swatch) swatch.style.background = input.value;
      if (text) text.textContent = input.value;
    });
  });
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

  const uploadForm = document.getElementById('uploadRasterForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async event => {
      event.preventDefault();
      if (!canCreateRasterLayer) return showRasterAdminStatus('You do not have create access for raster layers.', true);
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
