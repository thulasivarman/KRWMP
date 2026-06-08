const API_BASE = '/api';

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('krwmp_user') || 'null');
  } catch (error) {
    return null;
  }
}

function isAdminUser(user) {
  return String(user?.role_name || user?.role || '').toLowerCase() === 'admin';
}

const currentUser = getCurrentUser();

if (!isAdminUser(currentUser)) {
  const authNotice = document.getElementById('authNotice');
  if (authNotice) authNotice.hidden = false;
  window.setTimeout(() => {
    window.location.href = '/index.html';
  }, 800);
}

const uploadForm = document.getElementById('uploadForm');
const layersList = document.getElementById('layersList');
const refreshBtn = document.getElementById('refreshBtn');
const statusBox = document.getElementById('statusBox');
const layerTemplate = document.getElementById('layerTemplate');

function adminHeaders(extra = {}) {
  return {
    ...extra,
    'X-KRWMP-User': currentUser?.identifier || currentUser?.username || currentUser?.name || 'admin',
    'X-KRWMP-Role': currentUser?.role_name || currentUser?.role || 'admin',
  };
}

function showStatus(message, isError = false) {
  statusBox.hidden = false;
  statusBox.textContent = message;
  statusBox.className = `status-box ${isError ? 'error' : 'success'}`;
}

function normalizeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
}

async function requestJson(url, options = {}) {
  options.headers = adminHeaders(options.headers || {});
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
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

  card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
    await deleteLayer(layer.id, layer.name || layer.id);
  });

  layersList.appendChild(node);
}

async function saveStyle(form) {
  const id = form.id.value;
  const payload = {
    style: {
      color: form.color.value,
      fillColor: form.fillColor.value,
      weight: Number(form.weight.value),
      fillOpacity: Number(form.fillOpacity.value),
      radius: Number(form.radius.value),
    },
    visible: form.visible.checked,
  };

  try {
    await requestJson(`${API_BASE}/vector-layers/${encodeURIComponent(id)}/style`, {
      method: 'PUT',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });

    showStatus(`Symbol updated for ${id}.`);
    await loadLayers();
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function deleteLayer(id, name) {
  const confirmed = window.confirm(`Delete ${name}? This will remove the GeoJSON file and layer configuration.`);
  if (!confirmed) return;

  try {
    await requestJson(`${API_BASE}/vector-layers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    showStatus(`Layer deleted: ${id}.`);
    await loadLayers();
  } catch (error) {
    showStatus(error.message, true);
  }
}

uploadForm.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = new FormData(uploadForm);
  formData.set('visible', uploadForm.visible.checked ? 'true' : 'false');

  try {
    await requestJson(`${API_BASE}/vector-layers/upload`, {
      method: 'POST',
      body: formData,
    });

    uploadForm.reset();
    uploadForm.color.value = '#10b981';
    uploadForm.fillColor.value = '#10b981';
    uploadForm.weight.value = 2;
    uploadForm.fillOpacity.value = 0.2;
    uploadForm.visible.checked = true;

    showStatus('GeoJSON layer uploaded successfully.');
    await loadLayers();
  } catch (error) {
    showStatus(error.message, true);
  }
});

refreshBtn.addEventListener('click', loadLayers);

if (isAdminUser(currentUser)) {
  loadLayers();
}
