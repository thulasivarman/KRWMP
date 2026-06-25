(function () {
  const state = { districts: [], dsds: [], gnds: [], selected: { reg: new Map(), edit: new Map() } };

  function esc(value) {
    return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  }

  function selectedMap(prefix) {
    return state.selected[prefix] || state.selected.reg;
  }

  function selectedIds(prefix) {
    return Array.from(selectedMap(prefix).keys()).map(Number).filter(Number.isFinite);
  }

  function setStatus(prefix, message) {
    const box = document.getElementById(prefix + 'JurisdictionBuilderStatus');
    if (box) box.textContent = message;
  }

  function renderSelected(prefix) {
    const box = document.getElementById(prefix + 'SelectedGnds');
    const hidden = document.getElementById(prefix + 'JurisdictionSelectedGnds');
    const ids = selectedIds(prefix);
    if (hidden) hidden.value = ids.join(',');
    if (!box) return;
    if (!ids.length) {
      box.innerHTML = '<div class="form-helper">No GNDs selected yet.</div>';
      return;
    }
    const values = Array.from(selectedMap(prefix).values()).slice(0, 60);
    box.innerHTML = `<div class="form-helper mb-2">${ids.length} GND(s) selected.</div><div class="flex flex-wrap gap-1">${values.map(g => `<span class="px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200">${esc(g.gnd_name || g.idgnd)}</span>`).join('')}</div>${ids.length > 60 ? '<div class="form-helper mt-2">Showing first 60 selected GNDs only.</div>' : ''}`;
  }

  function addGnds(prefix, gnds = []) {
    const map = selectedMap(prefix);
    for (const g of gnds) if (g.idgnd) map.set(String(g.idgnd), g);
    renderSelected(prefix);
  }

  function clearGnds(prefix) {
    selectedMap(prefix).clear();
    renderSelected(prefix);
  }

  async function loadDistricts(prefix) {
    if (!state.districts.length) {
      const data = await window.KRWMP_ADMIN_API.getJurisdictionDistricts();
      state.districts = data.districts || [];
    }
    const select = document.getElementById(prefix + 'DistrictSelect');
    if (select) select.innerHTML = '<option value="">Select district</option>' + state.districts.map(d => `<option value="${d.iddistrict}">${esc(d.district_name)} (${d.dsd_count || 0} DSDs)</option>`).join('');
  }

  async function loadDsds(prefix, iddistrict = '') {
    const data = await window.KRWMP_ADMIN_API.getJurisdictionDsds(iddistrict);
    const dsds = data.dsds || [];
    const select = document.getElementById(prefix + 'DsdSelect');
    if (select) select.innerHTML = '<option value="">Select DSD</option>' + dsds.map(d => `<option value="${d.iddsd}">${esc(d.dsd_name)} (${d.gnd_count || 0} GNDs)</option>`).join('');
  }

  async function loadGnds(prefix, params = {}) {
    const data = await window.KRWMP_ADMIN_API.getJurisdictionGnds(params);
    const gnds = data.gnds || [];
    const select = document.getElementById(prefix + 'GndSelect');
    if (select) select.innerHTML = gnds.map(g => `<option value="${g.idgnd}">${esc(g.gnd_name)} - ${esc(g.dsd_name || '')}</option>`).join('');
    setStatus(prefix, `${gnds.length} GND(s) loaded for selection.`);
    return gnds;
  }

  async function autoAddDistrict(prefix) {
    const iddistrict = document.getElementById(prefix + 'DistrictSelect')?.value;
    if (!iddistrict) return;
    const gnds = await loadGnds(prefix, { iddistrict });
    addGnds(prefix, gnds);
    await loadDsds(prefix, iddistrict);
  }

  async function autoAddDsd(prefix) {
    const iddsd = document.getElementById(prefix + 'DsdSelect')?.value;
    if (!iddsd) return;
    const gnds = await loadGnds(prefix, { iddsd });
    addGnds(prefix, gnds);
  }

  function addManualGnds(prefix) {
    const select = document.getElementById(prefix + 'GndSelect');
    if (!select) return;
    const gnds = Array.from(select.selectedOptions || []).map(option => ({ idgnd: Number(option.value), gnd_name: option.textContent }));
    addGnds(prefix, gnds);
  }

  function builderHtml(prefix) {
    return `<div class="krwmp-stack-sm border border-slate-700 rounded-xl p-3 bg-slate-900/50" data-jurisdiction-builder="${prefix}">
      <div class="font-semibold text-slate-200">Jurisdiction Builder</div>
      <div class="form-helper">Use District, DSD, or individual GND selection. Each option resolves to GNDs internally.</div>
      <input type="hidden" id="${prefix}JurisdictionSelectedGnds">
      <label class="form-label">District
        <div class="flex gap-2"><select id="${prefix}DistrictSelect" class="form-select"></select><button type="button" id="${prefix}AddDistrictBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Add District</button></div>
      </label>
      <label class="form-label">DSD
        <div class="flex gap-2"><select id="${prefix}DsdSelect" class="form-select"></select><button type="button" id="${prefix}AddDsdBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Add DSD</button></div>
      </label>
      <label class="form-label">Individual GNDs
        <input id="${prefix}GndSearch" type="search" class="form-input mb-2" placeholder="Search GND name">
        <select id="${prefix}GndSelect" multiple size="6" class="form-select text-emerald-300 cursor-pointer"></select>
        <div class="flex gap-2 mt-2"><button type="button" id="${prefix}SearchGndBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Search / Load GNDs</button><button type="button" id="${prefix}AddGndBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Add Selected GNDs</button><button type="button" id="${prefix}ClearGndBtn" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm">Clear</button></div>
      </label>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 opacity-70">
        <button type="button" class="krwmp-btn krwmp-btn-ghost krwmp-btn-sm" disabled>Draw polygon - next phase</button>
        <button type="button" class="krwmp-btn krwmp-btn-ghost krwmp-btn-sm" disabled>Upload boundary - next phase</button>
      </div>
      <div id="${prefix}JurisdictionBuilderStatus" class="form-helper">Ready.</div>
      <div id="${prefix}SelectedGnds" class="max-h-36 overflow-auto rounded-lg border border-slate-800 p-2"></div>
    </div>`;
  }

  function attachBuilder(prefix) {
    const existing = document.querySelector(`[data-jurisdiction-builder="${prefix}"]`);
    if (existing) return;
    const select = document.getElementById(prefix + 'JurisdictionIds');
    if (!select) return;
    select.classList.add('hidden');
    select.insertAdjacentHTML('afterend', builderHtml(prefix));
    document.getElementById(prefix + 'DistrictSelect')?.addEventListener('change', e => loadDsds(prefix, e.target.value));
    document.getElementById(prefix + 'AddDistrictBtn')?.addEventListener('click', () => autoAddDistrict(prefix));
    document.getElementById(prefix + 'AddDsdBtn')?.addEventListener('click', () => autoAddDsd(prefix));
    document.getElementById(prefix + 'SearchGndBtn')?.addEventListener('click', () => loadGnds(prefix, { iddistrict: document.getElementById(prefix + 'DistrictSelect')?.value, iddsd: document.getElementById(prefix + 'DsdSelect')?.value, q: document.getElementById(prefix + 'GndSearch')?.value }));
    document.getElementById(prefix + 'AddGndBtn')?.addEventListener('click', () => addManualGnds(prefix));
    document.getElementById(prefix + 'ClearGndBtn')?.addEventListener('click', () => clearGnds(prefix));
    loadDistricts(prefix).then(() => loadDsds(prefix)).then(() => loadGnds(prefix)).catch(console.error);
    renderSelected(prefix);
  }

  async function ensureJurisdiction(prefix, payload = {}) {
    const ids = selectedIds(prefix);
    if (!ids.length) return payload;
    const username = payload.identifier || 'user';
    const result = await window.KRWMP_ADMIN_API.createJurisdictionFromGnds({ jurisdiction_name: `${username} Working Area`, idgnds: ids });
    const existing = Array.isArray(payload.jurisdiction_ids) ? payload.jurisdiction_ids.slice() : [];
    payload.jurisdiction_ids = [...new Set([...existing, result.jurisdiction.id])];
    return payload;
  }

  function patchApi() {
    if (!window.KRWMP_ADMIN_API || window.KRWMP_ADMIN_API.__jurisdictionBuilderPatched) return;
    const originalRegister = window.KRWMP_ADMIN_API.registerUser.bind(window.KRWMP_ADMIN_API);
    const originalUpdate = window.KRWMP_ADMIN_API.updateUser.bind(window.KRWMP_ADMIN_API);
    window.KRWMP_ADMIN_API.registerUser = async function (payload) { return originalRegister(await ensureJurisdiction('reg', payload)); };
    window.KRWMP_ADMIN_API.updateUser = async function (payload) { return originalUpdate(await ensureJurisdiction('edit', payload)); };
    window.KRWMP_ADMIN_API.__jurisdictionBuilderPatched = true;
  }

  function patchUsers() {
    const users = window.KRWMP_ADMIN_USERS;
    if (!users || users.__jurisdictionBuilderPatched) return;
    const originalPopulate = users.populateJurisdictionSelects?.bind(users);
    users.populateJurisdictionSelects = function () {
      if (originalPopulate) originalPopulate();
      attachBuilder('reg');
      attachBuilder('edit');
    };
    users.__jurisdictionBuilderPatched = true;
  }

  window.KRWMP_JURISDICTION_BUILDER = { patchApi, patchUsers, attachBuilder, selectedIds };
})();
