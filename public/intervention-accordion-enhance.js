function enhanceInterventionAccordions() {
  const list = document.getElementById('registryList');
  if (!list) return;

  list.querySelectorAll('article.krwmp-card').forEach((card, index) => {
    if (card.dataset.accordionEnhanced === 'true') return;
    const first = card.children[0];
    const rest = Array.from(card.children).slice(1);
    if (!first || !rest.length) return;

    card.dataset.accordionEnhanced = 'true';
    card.classList.remove('space-y-4', 'p-4');
    card.classList.add('overflow-hidden');

    const header = document.createElement('div');
    header.className = 'w-full text-left p-4 hover:bg-slate-900/70 transition flex justify-between gap-4 cursor-pointer';
    header.innerHTML = `<div class="min-w-0 flex-1">${first.innerHTML}</div><span class="text-slate-500 text-lg accordion-icon">${index === 0 ? '−' : '+'}</span>`;

    const body = document.createElement('div');
    body.className = `border-t border-slate-800 p-4 space-y-4 ${index === 0 ? '' : 'hidden'}`;
    rest.forEach(el => body.appendChild(el));

    card.innerHTML = '';
    card.appendChild(header);
    card.appendChild(body);

    header.addEventListener('click', event => {
      if (event.target.closest('button[data-view], button[data-edit], button[data-action], button[data-delete]')) return;
      body.classList.toggle('hidden');
      header.querySelector('.accordion-icon').textContent = body.classList.contains('hidden') ? '+' : '−';
    });
  });
}

function applyInterventionRegistryFilters() {
  const searchInput = document.getElementById('interventionSearchInput');
  const statusFilter = document.getElementById('interventionStatusFilter');
  const list = document.getElementById('registryList');
  if (!searchInput || !statusFilter || !list) return;

  const query = String(searchInput.value || '').toLowerCase().trim();
  const status = String(statusFilter.value || '').toLowerCase().trim();
  let visibleCount = 0;

  list.querySelectorAll('article.krwmp-card').forEach(card => {
    const text = String(card.textContent || '').toLowerCase();
    const visible = (!query || text.includes(query)) && (!status || text.includes(status));
    card.classList.toggle('hidden', !visible);
    if (visible) visibleCount += 1;
  });

  let empty = list.querySelector('[data-filter-empty]');
  if (!empty) {
    empty = document.createElement('div');
    empty.dataset.filterEmpty = 'true';
    empty.className = 'krwmp-empty-state hidden';
    empty.textContent = 'No interventions match the current search/filter on this page.';
    list.prepend(empty);
  }
  empty.classList.toggle('hidden', visibleCount > 0 || (!query && !status));
}

const evidenceState = {
  pollutionSources: new Map(),
  complaints: new Map(),
  waterQualityRecords: new Map(),
};

function evEsc(value) {
  return window.KRWMP_UTILS?.escapeHtml ? window.KRWMP_UTILS.escapeHtml(value ?? '') : String(value ?? '');
}

function selectedPoint() {
  return {
    latitude: document.getElementById('latInput')?.value || '',
    longitude: document.getElementById('lngInput')?.value || '',
  };
}

function ensureEvidenceHiddenInputs() {
  const form = document.getElementById('registryForm');
  if (!form) return;
  [['linkedPollutionSourceIds', 'pollution_source_ids'], ['linkedComplaintIds', 'community_report_ids'], ['linkedWaterQualityRecordIds', 'water_quality_record_ids']].forEach(([id, name]) => {
    if (document.getElementById(id)) return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.id = id;
    form.appendChild(input);
  });
}

function syncEvidenceHiddenInputs() {
  ensureEvidenceHiddenInputs();
  document.getElementById('linkedPollutionSourceIds').value = Array.from(evidenceState.pollutionSources.keys()).join(',');
  document.getElementById('linkedComplaintIds').value = Array.from(evidenceState.complaints.keys()).join(',');
  document.getElementById('linkedWaterQualityRecordIds').value = Array.from(evidenceState.waterQualityRecords.keys()).join(',');
}

function evidenceTitle(type, row) {
  if (type === 'pollution') return `${row.source_code || '-'} - ${row.source_name || '-'}`;
  if (type === 'complaint') return `${row.report_code || '-'} - ${row.issue_title || row.description || 'Community complaint'}`;
  return `${row.sample_code || '-'} - ${row.sample_location_name || '-'}`;
}

function evidenceMeta(type, row) {
  if (type === 'pollution') return `${row.type_name || '-'} · ${row.risk_class || row.status || '-'}`;
  if (type === 'complaint') return `${row.category_name || row.issue_name || '-'} · ${row.status || row.report_status || '-'}`;
  return `${row.overall_status || '-'} · ${row.dsd_name || '-'} / ${row.gnd_name || '-'}`;
}

function selectedEvidenceHtml(type) {
  const map = type === 'pollution' ? evidenceState.pollutionSources : type === 'complaint' ? evidenceState.complaints : evidenceState.waterQualityRecords;
  if (!map.size) return '<div class="krwmp-empty-state">None selected.</div>';
  return Array.from(map.values()).map(row => `<div class="krwmp-card p-2 text-sm flex justify-between gap-3"><span><strong>${evEsc(evidenceTitle(type, row))}</strong><span class="block form-helper">${evEsc(evidenceMeta(type, row))}</span></span><button type="button" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm" data-evidence-remove="${type}" data-evidence-id="${evEsc(row.id)}">Remove</button></div>`).join('');
}

function renderSelectedEvidence() {
  const ps = document.getElementById('selectedPollutionSources');
  const cr = document.getElementById('selectedCommunityComplaints');
  const wq = document.getElementById('selectedWaterQualityRecords');
  if (ps) ps.innerHTML = selectedEvidenceHtml('pollution');
  if (cr) cr.innerHTML = selectedEvidenceHtml('complaint');
  if (wq) wq.innerHTML = selectedEvidenceHtml('water');
  syncEvidenceHiddenInputs();
}

function installEvidenceUi() {
  const form = document.getElementById('registryForm');
  const nearbySection = document.getElementById('nearbyComplaintList')?.closest('section');
  if (!form || !nearbySection || document.getElementById('linkedEvidencePanel')) return;
  ensureEvidenceHiddenInputs();
  const section = document.createElement('section');
  section.id = 'linkedEvidencePanel';
  section.className = 'md:col-span-4 krwmp-card-muted p-4 krwmp-stack-sm';
  section.innerHTML = `<div class="krwmp-cluster-between gap-3"><div><h3 class="form-section-heading">Linked Evidence / Target Areas</h3><p class="form-helper">Search and link pollution sources, community complaints and water quality monitoring records.</p></div><select id="evidenceRadiusSelect" class="form-select w-36"><option value="500">500 m</option><option value="1000" selected>1 km</option><option value="2000">2 km</option><option value="5000">5 km</option><option value="0">All / Manual</option></select></div><div class="grid grid-cols-1 xl:grid-cols-3 gap-4"><div class="krwmp-card p-3 krwmp-stack-sm"><div class="krwmp-cluster-between gap-3"><h4 class="text-sm font-semibold">Pollution Sources</h4><button type="button" id="searchPollutionSourcesBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Search</button></div><input id="pollutionSourceSearchInput" type="search" class="form-input" placeholder="Search source code, name, type, DSD or GND"><div id="pollutionSourceSearchResults" class="krwmp-stack-sm"><div class="krwmp-empty-state">Select location or enter text, then search.</div></div><div><div class="form-helper mb-2">Selected pollution sources</div><div id="selectedPollutionSources" class="krwmp-stack-sm"><div class="krwmp-empty-state">None selected.</div></div></div></div><div class="krwmp-card p-3 krwmp-stack-sm"><div class="krwmp-cluster-between gap-3"><h4 class="text-sm font-semibold">Community Complaints</h4><button type="button" id="searchComplaintsBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Search</button></div><input id="complaintSearchInput" type="search" class="form-input" placeholder="Search report code, title, category or location"><div id="complaintSearchResults" class="krwmp-stack-sm"><div class="krwmp-empty-state">Use radius or manual text search.</div></div><div><div class="form-helper mb-2">Selected complaints</div><div id="selectedCommunityComplaints" class="krwmp-stack-sm"><div class="krwmp-empty-state">None selected.</div></div></div></div><div class="krwmp-card p-3 krwmp-stack-sm"><div class="krwmp-cluster-between gap-3"><h4 class="text-sm font-semibold">Water Quality Records</h4><button type="button" id="searchWaterQualityBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Search</button></div><input id="waterQualitySearchInput" type="search" class="form-input" placeholder="Search sample code, location, collector, DSD or GND"><div id="waterQualitySearchResults" class="krwmp-stack-sm"><div class="krwmp-empty-state">Select location or enter text, then search.</div></div><div><div class="form-helper mb-2">Selected water quality records</div><div id="selectedWaterQualityRecords" class="krwmp-stack-sm"><div class="krwmp-empty-state">None selected.</div></div></div></div></div>`;
  form.insertBefore(section, nearbySection);
  nearbySection.classList.add('hidden');
}

async function evidenceSearch(kind) {
  const api = window.KRWMP_UTILS.apiRequest;
  const point = selectedPoint();
  const radius = document.getElementById('evidenceRadiusSelect')?.value || '1000';
  const config = { pollution: { input: 'pollutionSourceSearchInput', target: 'pollutionSourceSearchResults', state: evidenceState.pollutionSources, url: p => `/api/interventions/lookups/pollution-sources?${p}`, responseKey: 'sources' }, complaint: { input: 'complaintSearchInput', target: 'complaintSearchResults', state: evidenceState.complaints, responseKey: 'reports' }, water: { input: 'waterQualitySearchInput', target: 'waterQualitySearchResults', state: evidenceState.waterQualityRecords, url: p => `/api/interventions/lookups/water-quality-records?${p}`, responseKey: 'records' } }[kind];
  const q = document.getElementById(config.input)?.value || '';
  const target = document.getElementById(config.target);
  if (!target) return;
  target.innerHTML = '<div class="krwmp-loading-state">Searching...</div>';
  const params = new URLSearchParams({ q, limit: 25 });
  if (kind === 'complaint') {
    let url;
    if (radius !== '0' && point.latitude && point.longitude && !q.trim()) {
      params.set('latitude', point.latitude); params.set('longitude', point.longitude); params.set('radius_meters', radius); params.set('limit', '50');
      url = `/api/community-issue-interventions/nearby-unlinked?${params}`;
    } else url = `/api/community-issue-interventions/search/reports?${params}`;
    try { const data = await api(url); renderEvidenceResults(kind, target, data[config.responseKey] || [], config.state); } catch (error) { target.innerHTML = `<div class="krwmp-empty-state">Search failed: ${evEsc(error.message)}</div>`; }
    return;
  }
  params.set('radius_m', radius);
  if (point.latitude && point.longitude) { params.set('near_latitude', point.latitude); params.set('near_longitude', point.longitude); }
  try { const data = await api(config.url(params)); renderEvidenceResults(kind, target, data[config.responseKey] || [], config.state); } catch (error) { target.innerHTML = `<div class="krwmp-empty-state">Search failed: ${evEsc(error.message)}</div>`; }
}

function renderEvidenceResults(kind, target, rows, stateMap) {
  if (!rows.length) { target.innerHTML = '<div class="krwmp-empty-state">No matching records found.</div>'; return; }
  target.innerHTML = rows.map(row => { const distance = row.distance_m == null ? (row.distance_meters == null ? '' : ` · ${Number(row.distance_meters).toFixed(0)} m`) : ` · ${Number(row.distance_m).toFixed(0)} m`; return `<div class="krwmp-card p-2 text-sm flex justify-between gap-3"><span><strong>${evEsc(evidenceTitle(kind, row))}</strong><span class="block form-helper">${evEsc(evidenceMeta(kind, row))}${evEsc(distance)}</span></span><button type="button" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm" data-evidence-add="${kind}" data-evidence-id="${evEsc(row.id)}">Add</button></div>`; }).join('');
  target.querySelectorAll('[data-evidence-add]').forEach(button => button.addEventListener('click', () => { const row = rows.find(item => String(item.id) === String(button.dataset.evidenceId)); if (!row) return; stateMap.set(String(row.id), row); renderSelectedEvidence(); }));
}

function bindEvidenceUi() {
  const form = document.getElementById('registryForm');
  if (form?.dataset.evidenceBound === 'true') return;
  document.getElementById('searchPollutionSourcesBtn')?.addEventListener('click', () => evidenceSearch('pollution'));
  document.getElementById('searchComplaintsBtn')?.addEventListener('click', () => evidenceSearch('complaint'));
  document.getElementById('searchWaterQualityBtn')?.addEventListener('click', () => evidenceSearch('water'));
  document.getElementById('linkedEvidencePanel')?.addEventListener('click', event => { const button = event.target.closest('[data-evidence-remove]'); if (!button) return; const map = button.dataset.evidenceRemove === 'pollution' ? evidenceState.pollutionSources : button.dataset.evidenceRemove === 'complaint' ? evidenceState.complaints : evidenceState.waterQualityRecords; map.delete(String(button.dataset.evidenceId)); renderSelectedEvidence(); });
  form?.addEventListener('submit', syncEvidenceHiddenInputs, true);
  if (form) form.dataset.evidenceBound = 'true';
}

const interventionObserver = new MutationObserver(() => { enhanceInterventionAccordions(); applyInterventionRegistryFilters(); });
window.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('registryList');
  if (list) interventionObserver.observe(list, { childList: true, subtree: false });
  document.getElementById('interventionSearchInput')?.addEventListener('input', applyInterventionRegistryFilters);
  document.getElementById('interventionStatusFilter')?.addEventListener('change', applyInterventionRegistryFilters);
  installEvidenceUi(); bindEvidenceUi();
  setTimeout(() => { installEvidenceUi(); bindEvidenceUi(); enhanceInterventionAccordions(); applyInterventionRegistryFilters(); }, 500);
});
