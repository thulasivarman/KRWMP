const { apiRequest: api, escapeHtml: esc } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const dashboardCards = document.getElementById('dashboardCards');
const sourcesList = document.getElementById('sourcesList');
const searchInput = document.getElementById('searchInput');
const riskFilter = document.getElementById('riskFilter');
const statusFilter = document.getElementById('statusFilter');
const sourceDetailModal = document.getElementById('sourceDetailModal');
const sourceDetailContent = document.getElementById('sourceDetailContent');
const monitoringModal = document.getElementById('monitoringModal');
const monitoringForm = document.getElementById('monitoringForm');
const monitoringSourceId = document.getElementById('monitoringSourceId');
const monitoringModalTitle = document.getElementById('monitoringModalTitle');
const recommendationSelect = document.getElementById('recommendationSelect');
const otherRecommendationLabel = document.getElementById('otherRecommendationLabel');
const monitoringEvidenceInput = document.getElementById('monitoringEvidenceInput');
const monitoringEvidenceStatus = document.getElementById('monitoringEvidenceStatus');
let sourceRecords = [];
let treatmentMethods = [];
let canCreate = false;
let canDelete = false;

function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
function fmtDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value).slice(0, 10) : d.toLocaleString(); }
function compactNumber(value) { const n = Number(value || 0); return Number.isFinite(n) ? n.toLocaleString() : '0'; }
function riskBadge(value) { const risk = value || 'Unclassified'; const badge = risk === 'Critical' || risk === 'High' ? 'krwmp-badge-danger' : risk === 'Moderate' ? 'krwmp-badge-warning' : 'krwmp-badge-info'; return `<span class="krwmp-badge ${badge}">${esc(risk)}</span>`; }
function openModal(dialog) { if (dialog) (typeof dialog.showModal === 'function' ? dialog.showModal() : dialog.setAttribute('open', 'open')); }
function closeModal(dialog) { if (dialog) (typeof dialog.close === 'function' ? dialog.close() : dialog.removeAttribute('open')); }

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('pollution_sources_management', 'view');
  canCreate = window.KRWMP_PRIVILEGES.can('pollution_sources_management', 'create');
  canDelete = window.KRWMP_PRIVILEGES.can('pollution_sources_management', 'delete');
}

async function loadLookups() {
  const data = await api('/api/pollution-sources/lookups/treatment-methods');
  treatmentMethods = data.treatment_methods || [];
  recommendationSelect.innerHTML = '<option value="">Select recommendation from library</option>' +
    treatmentMethods.map(row => `<option value="${esc(row.id)}">${esc(row.method_name || row.name || 'Recommendation')}</option>`).join('') +
    '<option value="__other__">Other - Enter own recommendation</option>';
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
  } catch (_) { dashboardCards.innerHTML = ''; }
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
          <p class="text-xs text-slate-400 mt-1">Overseeing Institution: ${esc(row.overseeing_institution || '-')} · Contact: ${esc(row.source_contact_person_name || '-')}</p>
          <p class="text-xs text-slate-400 mt-1">Risk Score: ${esc(row.risk_score ?? '-')} · Last Monitoring: ${esc(fmtDate(row.last_inspection_date))} · River Distance: ${esc(row.nearest_river_distance_m ?? '-')} m</p>
          <p class="text-sm text-slate-300 mt-2">${esc(row.description || row.location_description || 'No description recorded.')}</p>
        </div>
        <div class="krwmp-table-actions">
          <button type="button" data-view="${esc(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button>
          <button type="button" data-monitor="${esc(row.id)}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm ${canCreate ? '' : 'hidden'}">Add Monitoring</button>
          <button type="button" data-delete="${esc(row.id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDelete ? '' : 'hidden'}">Close</button>
        </div>
      </div>
    </article>`).join('');
}

function monitoringHtml(records = []) {
  if (!records.length) return '<div class="krwmp-empty-state">No monitoring records available.</div>';
  return records.map(row => `
    <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div class="flex flex-wrap gap-2 items-center">
        <strong class="text-sm text-slate-100">${esc(row.current_status || row.follow_up_status || 'Monitoring')}</strong>
        <span class="krwmp-badge krwmp-badge-info">${esc(fmtDate(row.reported_at || row.inspection_date || row.created_at))}</span>
      </div>
      <p class="text-xs text-slate-500 mt-1">Reported by: ${esc(row.reporting_userid || row.created_by || '-')}</p>
      <p class="text-sm text-slate-300 mt-2">${esc(row.observation_summary || '-')}</p>
      <p class="text-sm text-slate-400 mt-2">Recommendation: ${esc(row.action_recommendation || row.action_recommendation_other || row.recommendation || '-')}</p>
    </div>`).join('');
}

async function viewSource(id) {
  try {
    const data = await api(`/api/pollution-sources/${id}`);
    const s = data.source;
    sourceDetailContent.innerHTML = `
      <section class="krwmp-card-muted p-4">
        <h3 class="font-semibold text-slate-100">${esc(s.source_name || '-')}</h3>
        <p class="form-helper mt-1">${esc(s.source_code || '-')} · ${esc(s.type_name || '-')}</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 text-sm">
          <div><span class="text-slate-500">Status:</span> ${esc(s.status || '-')}</div>
          <div><span class="text-slate-500">Risk:</span> ${esc(s.risk_class || '-')} (${esc(s.risk_score ?? '-')})</div>
          <div><span class="text-slate-500">Overseeing Institution:</span> ${esc(s.overseeing_institution || '-')}</div>
          <div><span class="text-slate-500">Contact Person:</span> ${esc(s.source_contact_person_name || '-')} ${s.source_contact_person_phone ? '(' + esc(s.source_contact_person_phone) + ')' : ''}</div>
          <div><span class="text-slate-500">Location:</span> ${esc(s.location_description || '-')}</div>
          <div><span class="text-slate-500">Reported:</span> ${esc(fmtDate(s.reported_date))}</div>
        </div>
        <p class="text-sm text-slate-300 mt-4">${esc(s.description || 'No description recorded.')}</p>
      </section>
      <section>
        <h3 class="form-section-heading mb-3">Monitoring Records</h3>
        <div class="space-y-2">${monitoringHtml(s.monitoring || [])}</div>
      </section>`;
    openModal(sourceDetailModal);
  } catch (error) { show(error.message, true); }
}

function openMonitoring(id) {
  const source = sourceRecords.find(row => String(row.id) === String(id));
  monitoringForm.reset();
  monitoringSourceId.value = id;
  monitoringModalTitle.textContent = `Add Monitoring - ${source?.source_name || 'Pollution Source'}`;
  monitoringEvidenceStatus.textContent = 'Optional. Files will be attached to this monitoring record.';
  otherRecommendationLabel.classList.add('hidden');
  openModal(monitoringModal);
}

async function uploadMonitoringFiles(monitoringId, sourceId) {
  const files = Array.from(monitoringEvidenceInput.files || []);
  if (!files.length || !window.KRWMP_FILE_ATTACHMENTS?.uploadAttachment) return;
  for (let i = 0; i < files.length; i += 1) {
    monitoringEvidenceStatus.textContent = `Uploading file ${i + 1} of ${files.length}...`;
    await window.KRWMP_FILE_ATTACHMENTS.uploadAttachment(files[i], {
      moduleKey: 'pollution_sources',
      recordId: monitoringId,
      recordKind: 'pollution_source_monitoring',
      attachmentRole: 'monitoring_evidence',
      visibility: 'private',
      metadata: { pollution_source_id: sourceId },
    });
  }
  monitoringEvidenceStatus.textContent = 'Monitoring evidence uploaded.';
}

async function saveMonitoring(event) {
  event.preventDefault();
  const sourceId = monitoringSourceId.value;
  const body = Object.fromEntries(new FormData(monitoringForm));
  if (body.treatment_method_ids === '__other__') body.treatment_method_ids = '';
  try {
    const response = await api(`/api/pollution-sources/${sourceId}/monitoring`, { method: 'POST', body });
    if (response.monitoring?.id) await uploadMonitoringFiles(response.monitoring.id, sourceId);
    closeModal(monitoringModal);
    show('Monitoring record saved.');
    await loadSources();
  } catch (error) { show(error.message, true); }
}

async function closeSource(id) {
  if (!canDelete) return show('You do not have delete access for pollution sources.', true);
  if (!confirm('Close this pollution source record?')) return;
  await api(`/api/pollution-sources/${id}`, { method: 'DELETE' });
  show('Pollution source closed.');
  await loadSources();
}

function bindEvents() {
  document.getElementById('reloadBtn')?.addEventListener('click', loadSources);
  searchInput.addEventListener('input', loadSources);
  riskFilter.addEventListener('change', loadSources);
  statusFilter.addEventListener('change', loadSources);
  recommendationSelect.addEventListener('change', () => {
    otherRecommendationLabel.classList.toggle('hidden', recommendationSelect.value !== '__other__');
  });
  monitoringForm.addEventListener('submit', saveMonitoring);
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(document.getElementById(button.dataset.closeModal))));
  sourcesList.addEventListener('click', event => {
    const view = event.target.closest('[data-view]');
    const monitor = event.target.closest('[data-monitor]');
    const del = event.target.closest('[data-delete]');
    if (view) return viewSource(view.dataset.view);
    if (monitor) return openMonitoring(monitor.dataset.monitor);
    if (del) return closeSource(del.dataset.delete);
  });
}

(async () => {
  await initSidebar();
  await loadLookups();
  bindEvents();
  await loadSources();
})().catch(error => show(error.message, true));
