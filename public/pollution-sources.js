const { apiRequest: api, escapeHtml: esc } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const form = document.getElementById('pollutionSourceForm');
const dashboardCards = document.getElementById('dashboardCards');
const sourceTypeSelect = document.getElementById('sourceTypeSelect');
const sourcesList = document.getElementById('sourcesList');
const searchInput = document.getElementById('searchInput');
const riskFilter = document.getElementById('riskFilter');
const statusFilter = document.getElementById('statusFilter');
const locationInfo = document.getElementById('locationInfo');
const saveBtn = document.getElementById('saveBtn');
let picker = null;
let sourceTypes = [];
let sourceRecords = [];
let canCreate = false;
let canUpdate = false;
let canDelete = false;

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('pollution_sources_management', 'view');
  canCreate = window.KRWMP_PRIVILEGES.can('pollution_sources_management', 'create');
  canUpdate = window.KRWMP_PRIVILEGES.can('pollution_sources_management', 'update');
  canDelete = window.KRWMP_PRIVILEGES.can('pollution_sources_management', 'delete');
  form.classList.toggle('hidden', !canCreate && !canUpdate);
}

function riskBadge(value) {
  const risk = value || 'Unclassified';
  const badge = risk === 'Critical' || risk === 'High' ? 'krwmp-badge-danger' : risk === 'Moderate' ? 'krwmp-badge-warning' : 'krwmp-badge-info';
  return `<span class="krwmp-badge ${badge}">${esc(risk)}</span>`;
}

function fmtDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString();
}

function compactNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toLocaleString() : '0';
}

async function loadDashboard() {
  try {
    const data = await api('/api/pollution-sources/dashboard');
    const summary = data.dashboard?.summary || {};
    const actionCount = data.dashboard?.immediate_action_required?.length || 0;
    dashboardCards.innerHTML = [
      ['Total Sources', summary.total_sources || summary.source_count || sourceRecords.length || 0],
      ['Critical / High', summary.critical_high_sources || summary.high_priority_count || actionCount || 0],
      ['Active Sources', summary.active_sources || 0],
      ['Action Required', actionCount],
    ].map(([label, value]) => `<article class="krwmp-card"><div class="krwmp-stat-label">${esc(label)}</div><div class="krwmp-stat-value mt-1">${compactNumber(value)}</div></article>`).join('');
  } catch (_) {
    dashboardCards.innerHTML = '';
  }
}

async function loadSourceTypes() {
  const data = await api('/api/pollution-sources/lookups/source-types');
  sourceTypes = data.source_types || [];
  sourceTypeSelect.innerHTML = '<option value="">Select source type</option>' + sourceTypes.map(row => `<option value="${esc(row.id)}">${esc(row.type_name || row.source_type_name || row.name || 'Unnamed Type')}</option>`).join('');
}

function queryString() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
  if (riskFilter.value) params.set('risk_class', riskFilter.value);
  if (statusFilter.value) params.set('status', statusFilter.value);
  params.set('limit', '200');
  return params.toString();
}

async function loadSources() {
  sourcesList.innerHTML = '<div class="krwmp-loading-state">Loading pollution sources...</div>';
  const data = await api(`/api/pollution-sources?${queryString()}`);
  sourceRecords = data.sources || [];
  renderSources();
  loadDashboard();
}

function renderSources() {
  if (!sourceRecords.length) {
    sourcesList.innerHTML = '<div class="krwmp-empty-state">No pollution sources found.</div>';
    return;
  }
  sourcesList.innerHTML = sourceRecords.map(row => `
    <article class="krwmp-card krwmp-stack-sm">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap gap-2 items-center">
            <h3 class="font-semibold text-slate-100">${esc(row.source_name || '-')}</h3>
            ${riskBadge(row.risk_class)}
            <span class="krwmp-badge krwmp-badge-info">${esc(row.status || '-')}</span>
          </div>
          <p class="text-xs text-slate-500 mt-1">${esc(row.source_code || '-')} · ${esc(row.type_name || '-')} · ${esc(row.dsd_name || '-')} / ${esc(row.gnd_name || '-')}</p>
          <p class="text-xs text-slate-400 mt-1">Risk Score: ${esc(row.risk_score ?? '-')} · Last Inspection: ${esc(fmtDate(row.last_inspection_date))} · River Distance: ${esc(row.nearest_river_distance_m ?? '-')} m</p>
          <p class="text-sm text-slate-300 mt-2">${esc(row.description || row.location_description || 'No description recorded.')}</p>
        </div>
        <div class="krwmp-table-actions">
          <button type="button" data-view="${esc(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button>
          <button type="button" data-edit="${esc(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${canUpdate ? '' : 'hidden'}">Edit</button>
          <button type="button" data-delete="${esc(row.id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDelete ? '' : 'hidden'}">Close</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function identifyLocation({ latitude, longitude, cleared = false } = {}) {
  if (cleared) {
    locationInfo.textContent = 'No location selected.';
    return;
  }
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;
  locationInfo.textContent = `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
  try {
    const data = await api(`/api/spatial/identify?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
    locationInfo.textContent = `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)} | ${data.dsd?.dsd_name || '-'} / ${data.gnd?.gnd_name || '-'} | ${data.sub_watershed?.watershed_name || '-'}`;
  } catch (error) {
    show(`Location selected, but spatial identify failed: ${error.message}`, true);
  }
}

function initLocationPicker() {
  if (!window.KRWMPLocationPicker) return;
  picker = new window.KRWMPLocationPicker({
    containerId: 'pollutionLocationPicker',
    latitudeInput: '#latitudeInput',
    longitudeInput: '#longitudeInput',
    initialCenter: [80.3919668, 7.0020943],
    initialZoom: 10,
    onChange: identifyLocation,
  });
}

function fillForm(row = {}) {
  if (!canUpdate) return show('You do not have update access for pollution sources.', true);
  form.elements.id.value = row.id || '';
  form.elements.source_name.value = row.source_name || '';
  form.elements.source_type_id.value = row.source_type_id || '';
  form.elements.status.value = row.status || 'active';
  form.elements.reported_date.value = row.reported_date ? String(row.reported_date).slice(0, 10) : '';
  form.elements.description.value = row.description || '';
  form.elements.location_description.value = row.location_description || '';
  form.elements.latitude.value = row.latitude || '';
  form.elements.longitude.value = row.longitude || '';
  saveBtn.textContent = 'Update Source';
  if (row.latitude && row.longitude) picker?.setLocation(Number(row.latitude), Number(row.longitude), true);
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  form.reset();
  form.elements.id.value = '';
  saveBtn.textContent = 'Save Source';
  picker?.clear();
  locationInfo.textContent = 'No location selected.';
}

async function viewSource(id) {
  try {
    const data = await api(`/api/pollution-sources/${id}`);
    const source = data.source;
    alert([
      `${source.source_name || '-'}`,
      `Code: ${source.source_code || '-'}`,
      `Type: ${source.type_name || '-'}`,
      `Status: ${source.status || '-'}`,
      `Risk: ${source.risk_class || '-'} (${source.risk_score ?? '-'})`,
      `Location: ${source.location_description || '-'}`,
      `Monitoring records: ${(source.monitoring || []).length}`,
      `Enforcement notices: ${(source.enforcement || []).length}`,
    ].join('\n'));
  } catch (error) {
    show(error.message, true);
  }
}

async function closeSource(id) {
  if (!canDelete) return show('You do not have delete access for pollution sources.', true);
  if (!confirm('Close this pollution source record?')) return;
  await api(`/api/pollution-sources/${id}`, { method: 'DELETE' });
  show('Pollution source closed.');
  await loadSources();
}

async function saveSource(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  const id = body.id;
  delete body.id;
  if (!body.latitude || !body.longitude) return show('Please select the pollution source location.', true);
  if (id && !canUpdate) return show('You do not have update access for pollution sources.', true);
  if (!id && !canCreate) return show('You do not have create access for pollution sources.', true);
  try {
    const response = id
      ? await api(`/api/pollution-sources/${id}`, { method: 'PUT', body })
      : await api('/api/pollution-sources', { method: 'POST', body });
    resetForm();
    show(response.message || 'Pollution source saved.');
    await loadSources();
  } catch (error) {
    show(error.message, true);
  }
}

function bindEvents() {
  form.addEventListener('submit', saveSource);
  document.getElementById('resetBtn')?.addEventListener('click', resetForm);
  document.getElementById('reloadBtn')?.addEventListener('click', loadSources);
  searchInput.addEventListener('input', loadSources);
  riskFilter.addEventListener('change', loadSources);
  statusFilter.addEventListener('change', loadSources);
  sourcesList.addEventListener('click', event => {
    const view = event.target.closest('[data-view]');
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');
    if (view) return viewSource(view.dataset.view);
    if (edit) return fillForm(sourceRecords.find(row => String(row.id) === String(edit.dataset.edit)) || {});
    if (del) return closeSource(del.dataset.delete);
  });
}

(async () => {
  await initSidebar();
  await loadSourceTypes();
  initLocationPicker();
  bindEvents();
  await loadSources();
})().catch(error => show(error.message, true));
