function enhanceInterventionAccordions() {
  const list = document.getElementById('registryList');
  if (!list) return;

  list.querySelectorAll('article').forEach((card, index) => {
    if (card.dataset.accordionEnhanced === 'true') return;
    const first = card.children[0];
    const rest = Array.from(card.children).slice(1);
    if (!first || !rest.length) return;

    card.dataset.accordionEnhanced = 'true';
    card.classList.remove('space-y-4', 'p-4');
    card.classList.add('overflow-hidden');

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'w-full text-left p-4 hover:bg-slate-900/70 transition flex justify-between gap-4';
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
  if (!document.getElementById('linkedPollutionSourceIds')) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'pollution_source_ids';
    input.id = 'linkedPollutionSourceIds';
    form.appendChild(input);
  }
  if (!document.getElementById('linkedWaterQualityRecordIds')) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'water_quality_record_ids';
    input.id = 'linkedWaterQualityRecordIds';
    form.appendChild(input);
  }
}

function syncEvidenceHiddenInputs() {
  ensureEvidenceHiddenInputs();
  const pollutionInput = document.getElementById('linkedPollutionSourceIds');
  const waterInput = document.getElementById('linkedWaterQualityRecordIds');
  if (pollutionInput) pollutionInput.value = Array.from(evidenceState.pollutionSources.keys()).join(',');
  if (waterInput) waterInput.value = Array.from(evidenceState.waterQualityRecords.keys()).join(',');
}

function selectedEvidenceHtml(type) {
  const map = type === 'pollution' ? evidenceState.pollutionSources : evidenceState.waterQualityRecords;
  if (!map.size) return '<div class="krwmp-empty-state">None selected.</div>';
  return Array.from(map.values()).map(row => {
    const id = type === 'pollution' ? row.id : row.id;
    const title = type === 'pollution' ? `${row.source_code || '-'} - ${row.source_name || '-'}` : `${row.sample_code || '-'} - ${row.sample_location_name || '-'}`;
    const meta = type === 'pollution' ? `${row.type_name || '-'} · ${row.risk_class || row.status || '-'}` : `${row.overall_status || '-'} · ${row.dsd_name || '-'} / ${row.gnd_name || '-'}`;
    return `<div class="krwmp-card p-2 text-sm flex justify-between gap-3"><span><strong>${evEsc(title)}</strong><span class="block form-helper">${evEsc(meta)}</span></span><button type="button" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm" data-evidence-remove="${type}" data-evidence-id="${evEsc(id)}">Remove</button></div>`;
  }).join('');
}

function renderSelectedEvidence() {
  const ps = document.getElementById('selectedPollutionSources');
  const wq = document.getElementById('selectedWaterQualityRecords');
  if (ps) ps.innerHTML = selectedEvidenceHtml('pollution');
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
  section.innerHTML = `
    <div class="krwmp-cluster-between gap-3">
      <div><h3 class="form-section-heading">Linked Evidence / Target Areas</h3><p class="form-helper">Search and link pollution sources and water quality monitoring records that justify or target this intervention.</p></div>
      <select id="evidenceRadiusSelect" class="form-select w-36"><option value="1000">1 km</option><option value="2000">2 km</option><option value="5000">5 km</option><option value="0">All</option></select>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="krwmp-card p-3 krwmp-stack-sm"><div class="krwmp-cluster-between gap-3"><h4 class="text-sm font-semibold">Pollution Sources</h4><button type="button" id="searchPollutionSourcesBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Search</button></div><input id="pollutionSourceSearchInput" type="search" class="form-input" placeholder="Search source code, name, type, DSD or GND"><div id="pollutionSourceSearchResults" class="krwmp-stack-sm"><div class="krwmp-empty-state">Select location or enter text, then search.</div></div><div><div class="form-helper mb-2">Selected pollution sources</div><div id="selectedPollutionSources" class="krwmp-stack-sm"><div class="krwmp-empty-state">None selected.</div></div></div></div>
      <div class="krwmp-card p-3 krwmp-stack-sm"><div class="krwmp-cluster-between gap-3"><h4 class="text-sm font-semibold">Water Quality Records</h4><button type="button" id="searchWaterQualityBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Search</button></div><input id="waterQualitySearchInput" type="search" class="form-input" placeholder="Search sample code, location, collector, DSD or GND"><div id="waterQualitySearchResults" class="krwmp-stack-sm"><div class="krwmp-empty-state">Select location or enter text, then search.</div></div><div><div class="form-helper mb-2">Selected water quality records</div><div id="selectedWaterQualityRecords" class="krwmp-stack-sm"><div class="krwmp-empty-state">None selected.</div></div></div></div>
    </div>`;
  form.insertBefore(section, nearbySection);
}

async function evidenceSearch(kind) {
  const api = window.KRWMP_UTILS.apiRequest;
  const point = selectedPoint();
  const radius = document.getElementById('evidenceRadiusSelect')?.value || '1000';
  const q = kind === 'pollution' ? document.getElementById('pollutionSourceSearchInput')?.value || '' : document.getElementById('waterQualitySearchInput')?.value || '';
  const target = kind === 'pollution' ? document.getElementById('pollutionSourceSearchResults') : document.getElementById('waterQualitySearchResults');
  if (!target) return;
  target.innerHTML = '<div class="krwmp-loading-state">Searching...</div>';
  const params = new URLSearchParams({ q, radius_m: radius, limit: 25 });
  if (point.latitude && point.longitude) {
    params.set('near_latitude', point.latitude);
    params.set('near_longitude', point.longitude);
  }
  const url = kind === 'pollution' ? `/api/interventions/lookups/pollution-sources?${params}` : `/api/interventions/lookups/water-quality-records?${params}`;
  try {
    const data = await api(url);
    const rows = kind === 'pollution' ? data.sources || [] : data.records || [];
    if (!rows.length) {
      target.innerHTML = '<div class="krwmp-empty-state">No matching records found.</div>';
      return;
    }
    target.innerHTML = rows.map(row => {
      const id = row.id;
      const title = kind === 'pollution' ? `${row.source_code || '-'} - ${row.source_name || '-'}` : `${row.sample_code || '-'} - ${row.sample_location_name || '-'}`;
      const meta = kind === 'pollution' ? `${row.type_name || '-'} · ${row.risk_class || row.status || '-'}` : `${row.overall_status || '-'} · ${row.dsd_name || '-'} / ${row.gnd_name || '-'}`;
      const distance = row.distance_m === null || row.distance_m === undefined ? '' : ` · ${Number(row.distance_m).toFixed(0)} m`;
      return `<div class="krwmp-card p-2 text-sm flex justify-between gap-3"><span><strong>${evEsc(title)}</strong><span class="block form-helper">${evEsc(meta)}${evEsc(distance)}</span></span><button type="button" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm" data-evidence-add="${kind}" data-evidence-id="${evEsc(id)}">Add</button></div>`;
    }).join('');
    target.querySelectorAll('[data-evidence-add]').forEach(button => button.addEventListener('click', () => {
      const row = rows.find(item => String(item.id) === String(button.dataset.evidenceId));
      if (!row) return;
      (kind === 'pollution' ? evidenceState.pollutionSources : evidenceState.waterQualityRecords).set(String(row.id), row);
      renderSelectedEvidence();
    }));
  } catch (error) {
    target.innerHTML = `<div class="krwmp-empty-state">Search failed: ${evEsc(error.message)}</div>`;
  }
}

function bindEvidenceUi() {
  const form = document.getElementById('registryForm');
  document.getElementById('searchPollutionSourcesBtn')?.addEventListener('click', () => evidenceSearch('pollution'));
  document.getElementById('searchWaterQualityBtn')?.addEventListener('click', () => evidenceSearch('water'));
  document.getElementById('linkedEvidencePanel')?.addEventListener('click', event => {
    const button = event.target.closest('[data-evidence-remove]');
    if (!button) return;
    const map = button.dataset.evidenceRemove === 'pollution' ? evidenceState.pollutionSources : evidenceState.waterQualityRecords;
    map.delete(String(button.dataset.evidenceId));
    renderSelectedEvidence();
  });
  form?.addEventListener('submit', syncEvidenceHiddenInputs, true);
}

const interventionObserver = new MutationObserver(() => {
  enhanceInterventionAccordions();
  applyInterventionRegistryFilters();
});
window.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('registryList');
  if (list) interventionObserver.observe(list, { childList: true, subtree: false });
  document.getElementById('interventionSearchInput')?.addEventListener('input', applyInterventionRegistryFilters);
  document.getElementById('interventionStatusFilter')?.addEventListener('change', applyInterventionRegistryFilters);
  installEvidenceUi();
  bindEvidenceUi();
  setTimeout(() => {
    installEvidenceUi();
    bindEvidenceUi();
    enhanceInterventionAccordions();
    applyInterventionRegistryFilters();
  }, 500);
});
