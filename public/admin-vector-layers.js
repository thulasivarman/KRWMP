const API_BASE = '/api';
let canCreateVectorLayer = false;
let canUpdateVectorLayer = false;
let canDeleteVectorLayer = false;

async function initializeVectorLayerSidebar() {
  if (window.KRWMP_ENGINE) {
    await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  }
  await window.KRWMP_PRIVILEGES.protectPage('vector_layers', 'view');
  canCreateVectorLayer = window.KRWMP_PRIVILEGES.can('vector_layers', 'create');
  canUpdateVectorLayer = window.KRWMP_PRIVILEGES.can('vector_layers', 'update');
  canDeleteVectorLayer = window.KRWMP_PRIVILEGES.can('vector_layers', 'delete');

  const basemapSection = document.querySelector('.krwmp-panel-section');
  if (basemapSection) basemapSection.classList.add('hidden');

  const uploadSection = uploadForm?.closest('section');
  if (uploadSection) uploadSection.classList.toggle('hidden', !canCreateVectorLayer);
}

const uploadForm = document.getElementById('uploadForm');
const layersList = document.getElementById('layersList');
const refreshBtn = document.getElementById('refreshBtn');
const statusBox = document.getElementById('statusBox');
const layerTemplate = document.getElementById('layerTemplate');

const { apiRequest: requestJson } = window.KRWMP_UTILS;

function showStatus(message, isError = false) {
  statusBox.hidden = false;
  statusBox.textContent = message;
  statusBox.className = `status-box ${isError ? 'error' : 'success'}`;
}

function normalizeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

async function loadLayers() {
  layersList.innerHTML = '<p>Loading layers...</p>';

  try {
    const payload = await requestJson(`${API_BASE}/vector-layers`);
    layersList.innerHTML = '';

    if (!payload.layers || payload.layers.length === 0) {
      layersList.innerHTML = '<p>No vector layers found.</p>';
      return;
    }

    payload.layers.forEach(renderLayer);
  } catch (error) {
    layersList.innerHTML = '';
    showStatus(error.message, true);
  }
}

function renderLayer(layer) {
  const node = layerTemplate.content.cloneNode(true);
  const card = node.querySelector('.layer-card');
  const form = node.querySelector('.style-form');
  const style = layer.style || {};

  node.querySelector('[data-field="name"]').textContent = layer.name || layer.id;
  node.querySelector('[data-field="meta"]').textContent = `${layer.id} | ${layer.geometryType || 'Unknown geometry'} | ${layer.url}`;

  form.id.value = layer.id;
  form.color.value = normalizeHex(style.color, '#3388ff');
  form.fillColor.value = normalizeHex(style.fillColor, style.color || '#3388ff');
  form.weight.value = style.weight || 2;
  form.fillOpacity.value = style.fillOpacity ?? 0.2;
  form.radius.value = style.radius || 6;
  form.visible.checked = Boolean(layer.visible);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    await saveStyle(form);
  });

  card.querySelector('[data-action="delete"]').addEventListener('click', async () => deleteLayer(layer.id));
  form.querySelector('button[type="submit"]')?.classList.toggle('hidden', !canUpdateVectorLayer);
  card.querySelector('[data-action="delete"]')?.classList.toggle('hidden', !canDeleteVectorLayer);
  layersList.appendChild(node);
}

async function saveStyle(form) {
  if (!canUpdateVectorLayer) return showStatus('You do not have update access for vector layers.', true);
  const id = form.id.value;
  const body = {
    color: normalizeHex(form.color.value, '#3388ff'),
    fillColor: normalizeHex(form.fillColor.value, form.color.value),
    weight: Number(form.weight.value || 2),
    fillOpacity: Number(form.fillOpacity.value || 0.2),
    radius: Number(form.radius.value || 6),
    visible: form.visible.checked
  };
  try {
    await requestJson(`${API_BASE}/vector-layers/${encodeURIComponent(id)}/style`, { method: 'PUT', body });
    showStatus('Layer symbol updated successfully.');
    await loadLayers();
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function deleteLayer(id) {
  if (!canDeleteVectorLayer) return showStatus('You do not have delete access for vector layers.', true);
  if (!confirm(`Delete vector layer ${id}?`)) return;
  try {
    await requestJson(`${API_BASE}/vector-layers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showStatus('Layer deleted successfully.');
    await loadLayers();
  } catch (error) {
    showStatus(error.message, true);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initializeVectorLayerSidebar();

  uploadForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!canCreateVectorLayer) return showStatus('You do not have create access for vector layers.', true);
    const formData = new FormData(uploadForm);
    formData.set('visible', uploadForm.visible.checked ? 'true' : 'false');
    try {
      await fetch(`${API_BASE}/vector-layers/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'same-origin'
      }).then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.success === false) throw new Error(payload.message || 'Upload failed');
        return payload;
      });
      uploadForm.reset();
      uploadForm.color.value = '#10b981';
      uploadForm.fillColor.value = '#10b981';
      uploadForm.weight.value = 2;
      uploadForm.fillOpacity.value = 0.2;
      uploadForm.visible.checked = true;
      showStatus('Vector layer uploaded successfully.');
      await loadLayers();
    } catch (error) {
      showStatus(error.message, true);
    }
  });

  refreshBtn.addEventListener('click', loadLayers);
  await loadLayers();
});
