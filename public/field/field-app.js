(() => {
  const MODULES = {
    community_issues: {
      title: 'Community Complaint',
      endpoint: '/api/community-reports',
      recordKind: 'community_issue_report',
      lookupLoaders: ['issueCategories'],
      permissionHints: ['community_issues.create', 'community_issues.update', 'community_reports.create'],
      fields: [
        ['category_id', 'Issue Category', 'lookup:issueCategories', true],
        ['issue_id', 'Specific Issue', 'lookup:specificIssues', true],
        ['assigned_solution_id', 'Applicable Solution', 'lookup:solutions', false],
        ['severity_level', 'Severity', 'select:low|medium|high', false],
        ['issue_title', 'Issue title', 'text', true],
        ['description', 'Description / field observation', 'textarea', true],
        ['reporter_person', 'Reporter from Master Person Registry', 'person', false],
        ['location_description', 'Location description', 'text', false],
      ],
    },
    pollution_sources: {
      title: 'Pollution Source',
      endpoint: '/api/pollution-sources',
      recordKind: 'pollution_source',
      lookupLoaders: ['sourceTypes'],
      permissionHints: ['pollution_sources_management.create', 'pollution_sources_management.update', 'pollution_sources.create', 'pollution_sources.update'],
      fields: [
        ['source_name', 'Source name / identification', 'text', true],
        ['source_type_id', 'Source type', 'lookup:sourceTypes', true],
        ['description', 'Description', 'textarea', true],
        ['status', 'Status', 'select:active|under_review|closed', false],
        ['location_description', 'Location description', 'text', false],
        ['overseeing_institution', 'Responsible / overseeing institution', 'text', false],
      ],
    },
    interventions: {
      title: 'Intervention Registry',
      endpoint: '/api/interventions/registry',
      recordKind: 'intervention_registry',
      permissionHints: ['intervention_registry_manage.create', 'intervention_registry_manage.update', 'interventions.create', 'interventions.update'],
      fields: [
        ['intervention_title', 'Intervention title', 'text', true],
        ['intervention_type', 'Intervention type', 'select:Structural|Non-structural|Awareness|Enforcement|Monitoring|Other', false],
        ['description', 'Description', 'textarea', true],
        ['status', 'Status', 'select:Proposed|Ongoing|Delayed|Completed|Cancelled', false],
        ['progress_percent', 'Progress %', 'number', false],
      ],
    },
    water_quality: {
      title: 'Water Quality Monitoring',
      endpoint: '/api/water-quality/tests',
      recordKind: 'water_quality_test',
      permissionHints: ['water_quality_records.create', 'water_quality_records.update', 'water_quality.create', 'water_quality.update'],
      fields: [
        ['sampling_point_name', 'Sampling point name', 'text', true],
        ['sample_date', 'Sample date', 'date', true],
        ['ph', 'pH', 'number', false],
        ['turbidity', 'Turbidity', 'number', false],
        ['remarks', 'Remarks', 'textarea', false],
      ],
    },
    vwmc: {
      title: 'VWMC / Field Visit Update',
      endpoint: '/api/vwmc/field-visits',
      recordKind: 'vwmc_field_visit',
      permissionHints: ['vwmc.create', 'vwmc.update'],
      fields: [
        ['vwmc_name', 'VWMC / institution name', 'text', true],
        ['visit_date', 'Visit date', 'date', true],
        ['meeting_held', 'Meeting held', 'select:Yes|No', false],
        ['attendance_count', 'Attendance count', 'number', false],
        ['remarks', 'Remarks / follow-up required', 'textarea', false],
      ],
    },
  };

  const OTHER_VALUE = '__other__';
  const KELANI_CENTER = [80.2280810, 7.2334995];
  const FIELD_BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  const state = {
    user: null,
    profile: null,
    moduleKey: 'community_issues',
    position: null,
    selectedFiles: [],
    selectedPerson: null,
    lookups: { sourceTypes: [], issueCategories: [], specificIssues: [], solutions: [] },
    map: null,
    marker: null,
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

  function toast(message, error = false) {
    const box = $('#fieldStatus');
    if (!box) return;
    box.textContent = message;
    box.className = `rounded-2xl border p-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`;
    box.classList.remove('hidden');
  }

  async function apiRequest(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const init = { ...options, headers, credentials: 'same-origin' };
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const response = await fetch(url, init);
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { message: text }; }
    if (!response.ok || data.success === false) throw new Error(data.message || `Request failed: ${response.status}`);
    return data;
  }

  window.KRWMP_UTILS = window.KRWMP_UTILS || { apiRequest, escapeHtml, escapeAttribute: escapeHtml };

  function getStoredUser() { try { return JSON.parse(localStorage.getItem('krwmp_user') || 'null'); } catch (_) { return null; } }
  function cachePeople(persons = []) { localStorage.setItem('wis_field_cached_people', JSON.stringify(persons.slice(0, 50))); }
  function cachedPeople() { try { return JSON.parse(localStorage.getItem('wis_field_cached_people') || '[]'); } catch (_) { return []; } }

  async function loadProfile() {
    state.user = getStoredUser();
    try {
      const data = await apiRequest('/api/me/profile', { cache: 'no-store' });
      state.profile = data.profile;
      state.user = { ...(state.user || {}), ...(data.profile || {}) };
      localStorage.setItem('krwmp_user', JSON.stringify(state.user));
    } catch (error) {
      if (!state.user) window.location.href = '/login.html';
    }
    $('#userLabel').textContent = state.user?.full_name || state.user?.name || state.user?.username || 'Field user';
  }

  async function loadLookupsForModule(moduleKey) {
    const module = MODULES[moduleKey];
    if (module.lookupLoaders?.includes('sourceTypes') && !state.lookups.sourceTypes.length) {
      const data = await apiRequest('/api/pollution-sources/lookups/source-types');
      state.lookups.sourceTypes = (data.source_types || []).map(item => ({ value: item.id, label: item.type_name || item.name || item.id }));
    }
    if (module.lookupLoaders?.includes('issueCategories') && !state.lookups.issueCategories.length) {
      const data = await apiRequest('/api/issue-categories');
      state.lookups.issueCategories = (data.categories || []).map(item => ({ value: item.id, label: item.category_name || item.name || item.id }));
      state.lookups.issueCategories.push({ value: OTHER_VALUE, label: 'Other' });
    }
  }

  async function loadSpecificIssues(categoryId) {
    state.lookups.specificIssues = [];
    state.lookups.solutions = [];
    if (!categoryId) return;
    if (categoryId === OTHER_VALUE) {
      state.lookups.specificIssues = [{ value: OTHER_VALUE, label: 'Other' }];
      return;
    }
    const data = await apiRequest(`/api/specific-issues?category_id=${encodeURIComponent(categoryId)}`);
    state.lookups.specificIssues = (data.issues || []).map(item => ({ value: item.id, label: item.issue_name || item.name || item.id }));
    state.lookups.specificIssues.push({ value: OTHER_VALUE, label: 'Other' });
  }

  async function loadSolutions(categoryId, issueId) {
    state.lookups.solutions = [];
    if (!categoryId || !issueId || categoryId === OTHER_VALUE || issueId === OTHER_VALUE) return;
    const data = await apiRequest(`/api/solutions?category_id=${encodeURIComponent(categoryId)}&issue_id=${encodeURIComponent(issueId)}`);
    state.lookups.solutions = (data.solutions || []).map(item => ({ value: item.id, label: item.solution_title || item.title || item.id }));
  }

  function hasModuleAccess(moduleKey) {
    const permissions = state.profile?.permissions || state.user?.permissions || state.user?.privileges || [];
    if (!Array.isArray(permissions) || !permissions.length) return true;
    const hints = MODULES[moduleKey].permissionHints;
    return hints.some(hint => permissions.includes(hint) || permissions.includes(hint.replace('.', ':')));
  }

  function renderModuleButtons() {
    $('#moduleButtons').innerHTML = Object.entries(MODULES).map(([key, module]) => `<button type="button" data-module="${key}" class="module-btn rounded-2xl border border-emerald-100 bg-white p-4 text-left shadow-sm ${hasModuleAccess(key) ? '' : 'opacity-50'}"><span class="block text-sm font-semibold text-slate-900">${escapeHtml(module.title)}</span><span class="mt-1 block text-xs text-slate-500">Offline entry, GPS and photo evidence</span></button>`).join('');
  }

  function fieldHtml([name, label, type, required]) {
    const req = required ? 'required' : '';
    const common = `name="${name}" ${req} class="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"`;
    if (type === 'textarea') return `<label class="block text-sm font-semibold text-slate-700">${escapeHtml(label)}<textarea ${common} rows="4"></textarea></label>`;
    if (type.startsWith('select:')) {
      const options = type.slice(7).split('|').map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      return `<label class="block text-sm font-semibold text-slate-700">${escapeHtml(label)}<select ${common}><option value="">Select</option>${options}</select></label>`;
    }
    if (type.startsWith('lookup:')) {
      const lookupKey = type.slice(7);
      const disabled = lookupKey === 'specificIssues' && !state.lookups.specificIssues.length ? 'disabled' : '';
      const options = (state.lookups[lookupKey] || []).map(item => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`).join('');
      return `<label class="block text-sm font-semibold text-slate-700">${escapeHtml(label)}<select ${common} ${disabled}><option value="">Select</option>${options}</select></label>`;
    }
    if (type === 'person') {
      const selected = state.selectedPerson;
      return `<section class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <input type="hidden" name="reporter_person_id" id="reporterPersonId" value="${escapeHtml(selected?.id || '')}">
        <input type="hidden" name="reporter_name" id="reporterNameInput" value="${escapeHtml(selected?.full_name || selected?.name || '')}">
        <input type="hidden" name="reporter_contact" id="reporterContactInput" value="${escapeHtml(selected?.phone_number || selected?.phone || '')}">
        <input type="hidden" name="reporter_email" id="reporterEmailInput" value="${escapeHtml(selected?.email || '')}">
        <div class="text-sm font-semibold text-slate-800">${escapeHtml(label)}</div>
        <div id="selectedPersonSummary" class="mt-2 rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-600">${selected ? `${escapeHtml(selected.full_name || selected.name)} · ${escapeHtml(selected.phone_number || selected.phone || '')}` : 'No reporter selected. Search online or use cached people in offline mode.'}</div>
        <div class="mt-3 flex gap-2"><input id="personSearchInput" type="search" placeholder="Search name, phone, NIC or email" class="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><button type="button" id="personSearchBtn" class="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Search</button></div>
        <div id="personSearchResults" class="mt-3 space-y-2"></div>
      </section>`;
    }
    return `<label class="block text-sm font-semibold text-slate-700">${escapeHtml(label)}<input type="${escapeHtml(type)}" ${common}></label>`;
  }

  function syncIssueTitleFromSelection() {
    const issueSelect = document.querySelector('[name="issue_id"]');
    const titleInput = document.querySelector('[name="issue_title"]');
    if (!issueSelect || !titleInput) return;
    const item = state.lookups.specificIssues.find(x => String(x.value) === String(issueSelect.value));
    if (item && item.value !== OTHER_VALUE) titleInput.value = item.label;
  }

  async function renderForm() {
    const module = MODULES[state.moduleKey];
    $('#formTitle').textContent = module.title;
    $('#dynamicFields').innerHTML = '<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Loading form...</div>';
    try {
      await loadLookupsForModule(state.moduleKey);
      $('#dynamicFields').innerHTML = module.fields.map(fieldHtml).join('');
      $('#moduleKeyInput').value = state.moduleKey;
      $$('.module-btn').forEach(button => button.classList.toggle('ring-4', button.dataset.module === state.moduleKey));
      bindDynamicFormEvents();
      setTimeout(() => state.map?.resize(), 80);
    } catch (error) {
      $('#dynamicFields').innerHTML = `<div class="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">${escapeHtml(error.message || 'Unable to load form lookups.')}</div>`;
    }
  }

  function normalizePayload(moduleKey, payload) {
    const clean = { ...payload };
    if (moduleKey === 'community_issues') {
      if (clean.category_id === OTHER_VALUE) clean.category_id = null;
      if (clean.issue_id === OTHER_VALUE || clean.category_id === null) clean.issue_id = null;
      if (!clean.assigned_solution_id || clean.assigned_solution_id === OTHER_VALUE) clean.assigned_solution_id = null;
      clean.severity_level = clean.severity_level || 'medium';
    }
    if (moduleKey === 'pollution_sources') {
      clean.description = clean.description || clean.source_description || null;
      clean.source_type_id = clean.source_type_id || null;
      clean.status = clean.status || 'active';
      clean.reported_date = clean.reported_date || new Date().toISOString().slice(0, 10);
      delete clean.pollution_type; delete clean.source_description; delete clean.risk_level; delete clean.responsible_party;
    }
    if (moduleKey === 'water_quality') clean.test_date = clean.sample_date || clean.test_date || new Date().toISOString().slice(0, 10);
    return clean;
  }

  function setPosition(position) {
    state.position = position;
    $('#latitudeInput').value = position?.latitude ?? '';
    $('#longitudeInput').value = position?.longitude ?? '';
    $('#gpsLabel').textContent = position ? `${Number(position.latitude).toFixed(7)}, ${Number(position.longitude).toFixed(7)}` : 'Not captured';
    updateMapMarker(position);
  }

  function initMap() {
    if (state.map || !window.maplibregl || !$('#fieldLocationMap')) return;
    state.map = new maplibregl.Map({ container: 'fieldLocationMap', style: FIELD_BASEMAP_STYLE, center: KELANI_CENTER, zoom: 9 });
    state.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    state.map.on('click', event => setPosition({ latitude: event.lngLat.lat, longitude: event.lngLat.lng, manual: true }));
  }

  function updateMapMarker(position) {
    if (!state.map || !position?.latitude || !position?.longitude) return;
    const lngLat = [Number(position.longitude), Number(position.latitude)];
    if (!state.marker) state.marker = new maplibregl.Marker({ draggable: true, color: '#059669' }).setLngLat(lngLat).addTo(state.map);
    else state.marker.setLngLat(lngLat);
    state.marker.off?.('dragend');
    state.marker.on('dragend', () => { const ll = state.marker.getLngLat(); setPosition({ latitude: ll.lat, longitude: ll.lng, manual: true }); });
    state.map.easeTo({ center: lngLat, zoom: Math.max(state.map.getZoom(), 13), duration: 400 });
  }

  function captureGps() {
    if (!navigator.geolocation) return toast('GPS is not supported on this device.', true);
    toast('Capturing GPS location...');
    navigator.geolocation.getCurrentPosition(
      pos => { setPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }); toast('GPS location captured. You may edit latitude/longitude or drag the map marker.'); },
      error => toast(error.message || 'Unable to capture GPS location.', true),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  function syncManualLocation() { const latitude = Number($('#latitudeInput').value); const longitude = Number($('#longitudeInput').value); if (Number.isFinite(latitude) && Number.isFinite(longitude)) setPosition({ latitude, longitude, manual: true }); }
  function selectedPhotoList() { const list = $('#photoList'); list.innerHTML = state.selectedFiles.length ? state.selectedFiles.map(file => `<div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">${escapeHtml(file.name)} · ${(file.size / 1024 / 1024).toFixed(2)} MB</div>`).join('') : '<div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">No photos selected.</div>'; }

  function collectPayload() {
    const formData = new FormData($('#fieldEntryForm'));
    const payload = {};
    for (const [key, value] of formData.entries()) { if (key === 'photos') continue; payload[key] = value === '' ? null : value; }
    payload.latitude = $('#latitudeInput').value ? Number($('#latitudeInput').value) : null;
    payload.longitude = $('#longitudeInput').value ? Number($('#longitudeInput').value) : null;
    payload.field_app_source = 'WIS Field App';
    payload.sync_policy = 'reviewer_decision_on_conflict';
    payload.field_collected_at = new Date().toISOString();
    return normalizePayload(state.moduleKey, payload);
  }

  async function uploadPhotos(moduleKey, recordId, recordKind, photos) { if (!photos.length || !window.KRWMP_FILE_ATTACHMENTS?.uploadAttachment) return; for (const photo of photos) await window.KRWMP_FILE_ATTACHMENTS.uploadAttachment(photo.blob || photo, { moduleKey, recordId, recordKind, attachmentRole: 'field_photo', visibility: 'module', metadata: { source: 'WIS Field App' } }); }
  async function submitOnline(moduleKey, payload, files = []) { const module = MODULES[moduleKey]; const finalPayload = normalizePayload(moduleKey, payload); const data = await apiRequest(module.endpoint, { method: 'POST', body: finalPayload }); const record = data.report || data.test || data.record || data.item || data.intervention || data.source || data.result || data.data || {}; const recordId = record.id || data.id; if (recordId) await uploadPhotos(moduleKey, recordId, module.recordKind, files); return { data, recordId }; }

  async function saveOffline() { const payload = collectPayload(); if (!payload.latitude || !payload.longitude) throw new Error('Capture GPS, tap the map, or manually enter latitude/longitude before saving.'); await window.WIS_FIELD_STORE.saveRecord(state.moduleKey, payload, state.selectedFiles); $('#fieldEntryForm').reset(); state.selectedFiles = []; state.selectedPerson = null; selectedPhotoList(); setPosition(null); await renderPendingRecords(); toast('Saved offline. Use Manual Sync when internet is available.'); }
  async function handleSubmit(event) { event.preventDefault(); try { const payload = collectPayload(); if (!payload.latitude || !payload.longitude) throw new Error('Capture GPS, tap the map, or manually enter latitude/longitude before submission.'); if (!navigator.onLine) return saveOffline(); try { await submitOnline(state.moduleKey, payload, state.selectedFiles); toast('Submitted successfully.'); $('#fieldEntryForm').reset(); state.selectedFiles = []; state.selectedPerson = null; selectedPhotoList(); setPosition(null); await renderForm(); } catch (error) { await window.WIS_FIELD_STORE.saveRecord(state.moduleKey, payload, state.selectedFiles); await renderPendingRecords(); toast(`Online submission failed. Saved offline for sync. ${error.message}`, true); } } catch (error) { toast(error.message || 'Unable to save record.', true); } }

  async function renderPendingRecords() { const records = await window.WIS_FIELD_STORE.getRecords(); $('#pendingCount').textContent = records.length; $('#pendingList').innerHTML = records.length ? records.map(record => `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><div class="text-sm font-semibold text-slate-900">${escapeHtml(MODULES[record.moduleKey]?.title || record.moduleKey)}</div><div class="mt-1 text-xs text-slate-500">${escapeHtml(record.status)} · ${new Date(record.createdAt).toLocaleString()}</div>${record.lastError ? `<div class="mt-2 text-xs text-rose-600">${escapeHtml(record.lastError)}</div>` : ''}</div><button type="button" data-delete-pending="${record.localId}" class="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">Delete</button></div></div>`).join('') : '<div class="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">No pending offline records.</div>'; }
  async function syncPendingRecords() { const records = await window.WIS_FIELD_STORE.getRecords(); if (!records.length) return toast('No pending records to sync.'); if (!navigator.onLine) return toast('Device is offline. Connect to internet before syncing.', true); let synced = 0; for (const record of records) { try { const photos = await window.WIS_FIELD_STORE.getPhotos(record.localId); const result = await submitOnline(record.moduleKey, { ...record.payload, offline_local_id: record.localId }, photos); if (result.recordId) await window.WIS_FIELD_STORE.deleteRecord(record.localId); else { record.status = 'conflict_review_required'; record.conflictStatus = 'reviewer_decision_required'; record.lastError = 'Submitted but server record ID was not returned. Reviewer decision required.'; await window.WIS_FIELD_STORE.updateRecord(record); } synced += 1; } catch (error) { record.attempts = Number(record.attempts || 0) + 1; record.status = /conflict|duplicate|version/i.test(error.message || '') ? 'conflict_review_required' : 'sync_failed'; record.conflictStatus = record.status === 'conflict_review_required' ? 'reviewer_decision_required' : null; record.lastError = error.message || 'Sync failed'; await window.WIS_FIELD_STORE.updateRecord(record); } } await renderPendingRecords(); toast(`${synced} pending record(s) processed. Failed/conflict records remain for review.`, synced === 0); }

  async function searchPeople(query) {
    if (!query || query.length < 3) { renderPersonResults(cachedPeople(), true); return; }
    if (!navigator.onLine) { renderPersonResults(cachedPeople().filter(p => JSON.stringify(p).toLowerCase().includes(query.toLowerCase())), true); return; }
    const data = await apiRequest(`/api/public/persons/search?q=${encodeURIComponent(query)}&limit=10`);
    const persons = data.persons || [];
    cachePeople([...(persons || []), ...cachedPeople()].filter((p, i, arr) => p?.id && arr.findIndex(x => x.id === p.id) === i));
    renderPersonResults(persons, false);
  }
  function renderPersonResults(persons = [], cached = false) { const box = $('#personSearchResults'); if (!box) return; box.innerHTML = persons.length ? persons.map(person => `<button type="button" data-select-person="${escapeHtml(person.id)}" class="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-700"><strong>${escapeHtml(person.full_name || person.name || 'Unnamed person')}</strong><br>${escapeHtml(person.phone_number || person.phone || '')} ${person.email ? ' · ' + escapeHtml(person.email) : ''}${cached ? '<br><span class="text-amber-600">Cached offline result</span>' : ''}</button>`).join('') : '<div class="rounded-xl border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">No matching person found. For offline work, select a cached person before field visit or submit without reporter_person_id for reviewer decision.</div>'; }
  function selectPerson(id) { const person = [...cachedPeople(), ...(state.lastPersonResults || [])].find(p => String(p.id) === String(id)); if (!person) return; state.selectedPerson = person; renderForm(); }

  function bindDynamicFormEvents() {
    const category = document.querySelector('[name="category_id"]');
    const issue = document.querySelector('[name="issue_id"]');
    const personBtn = $('#personSearchBtn');
    const personInput = $('#personSearchInput');
    category?.addEventListener('change', async () => { await loadSpecificIssues(category.value); state.lookups.solutions = []; await renderForm(); document.querySelector('[name="category_id"]').value = category.value; });
    issue?.addEventListener('change', async () => { await loadSolutions(document.querySelector('[name="category_id"]')?.value, issue.value); syncIssueTitleFromSelection(); const selectedIssue = issue.value; await renderForm(); const cat = document.querySelector('[name="category_id"]'); const newIssue = document.querySelector('[name="issue_id"]'); if (cat) cat.value = category?.value || ''; if (newIssue) newIssue.value = selectedIssue || ''; syncIssueTitleFromSelection(); });
    personBtn?.addEventListener('click', async () => { try { const data = await apiRequest(`/api/public/persons/search?q=${encodeURIComponent(personInput.value.trim())}&limit=10`); state.lastPersonResults = data.persons || []; cachePeople([...(state.lastPersonResults || []), ...cachedPeople()].filter((p, i, arr) => p?.id && arr.findIndex(x => x.id === p.id) === i)); renderPersonResults(state.lastPersonResults); } catch (error) { toast(error.message || 'Unable to search persons. Showing cached records.', true); renderPersonResults(cachedPeople(), true); } });
    $('#personSearchResults')?.addEventListener('click', event => { const btn = event.target.closest('[data-select-person]'); if (btn) selectPerson(btn.dataset.selectPerson); });
  }

  async function searchKnowledge() { const query = $('#knowledgeSearch').value.trim(); if (!query) return; try { const data = await apiRequest(`/api/knowledge?search=${encodeURIComponent(query)}`); const items = data.items || data.knowledge || data.products || data.records || []; $('#knowledgeResults').innerHTML = items.length ? items.map(item => `<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="text-sm font-semibold text-slate-900">${escapeHtml(item.title || item.name || 'Knowledge product')}</div><div class="mt-1 text-xs text-slate-500">${escapeHtml(item.category || item.type || '')}</div><div class="mt-2 text-sm text-slate-600">${escapeHtml(item.description || item.summary || '')}</div></div>`).join('') : '<div class="text-sm text-slate-500">No knowledge products found.</div>'; } catch (error) { toast(error.message || 'Knowledge search failed.', true); } }

  async function init() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/field/field-sw.js').catch(console.error);
    await loadProfile();
    renderModuleButtons();
    await renderForm();
    initMap();
    selectedPhotoList();
    await renderPendingRecords();
    $('#moduleButtons').addEventListener('click', async event => { const button = event.target.closest('[data-module]'); if (!button) return; state.moduleKey = button.dataset.module; state.selectedPerson = null; await renderForm(); setTimeout(() => state.map?.resize(), 100); });
    $('#captureGpsBtn').addEventListener('click', captureGps);
    $('#latitudeInput').addEventListener('change', syncManualLocation);
    $('#longitudeInput').addEventListener('change', syncManualLocation);
    $('#photoInput').addEventListener('change', event => { state.selectedFiles = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/')); selectedPhotoList(); });
    $('#fieldEntryForm').addEventListener('submit', handleSubmit);
    $('#saveOfflineBtn').addEventListener('click', () => saveOffline().catch(error => toast(error.message, true)));
    $('#syncBtn').addEventListener('click', syncPendingRecords);
    $('#knowledgeBtn').addEventListener('click', searchKnowledge);
    $('#pendingList').addEventListener('click', async event => { const button = event.target.closest('[data-delete-pending]'); if (!button) return; await window.WIS_FIELD_STORE.deleteRecord(button.dataset.deletePending); await renderPendingRecords(); toast('Pending record deleted.'); });
    window.addEventListener('online', () => toast('Internet connection restored. Use Manual Sync to upload pending records.'));
    window.addEventListener('offline', () => toast('Offline mode active. Records will be saved locally.', true));
    captureGps();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
