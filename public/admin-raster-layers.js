const currentRasterUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const currentRasterRole = String(currentRasterUser?.role_name || currentRasterUser?.role || '').toLowerCase();

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

function renderRasterAdminLayer(layer) {
  const list = document.getElementById('rasterLayersList');
  const template = document.getElementById('rasterLayerTemplate');
  if (!list || !template) return;

  const node = template.content.cloneNode(true);
  const form = node.querySelector('.style-form');

  node.querySelector('[data-field="name"]').textContent = layer.layer_name || layer.layer_key;
  node.querySelector('[data-field="meta"]').textContent = `${layer.layer_key} | ${layer.file_name || ''} | ${layer.file_url || ''}`;

  form.id.value = layer.layer_key;
  form.opacity.value = layer.opacity ?? 0.7;
  form.minZoom.value = layer.min_zoom ?? 0;
  form.maxZoom.value = layer.max_zoom ?? 22;
  form.visible.checked = Boolean(layer.default_visible);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const payload = {
      opacity: Number(form.opacity.value),
      minZoom: Number(form.minZoom.value),
      maxZoom: Number(form.maxZoom.value),
      visible: form.visible.checked
    };
    try {
      await rasterAdminRequest(`/api/raster-layers/${encodeURIComponent(form.id.value)}`, {
        method: 'PUT',
        headers: rasterAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      showRasterAdminStatus('Raster settings updated successfully.');
      await loadRasterAdminLayers();
    } catch (error) {
      showRasterAdminStatus(error.message, true);
    }
  });

  node.querySelector('[data-action="delete"]').addEventListener('click', async () => {
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
        showRasterAdminStatus('Raster layer uploaded successfully.');
        await loadRasterAdminLayers();
      } catch (error) {
        showRasterAdminStatus(error.message, true);
      }
    });
  }

  document.getElementById('refreshRasterBtn')?.addEventListener('click', loadRasterAdminLayers);
  await loadRasterAdminLayers();
});
