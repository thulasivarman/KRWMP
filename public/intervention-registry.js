let canCreateIntervention = false;
let canUpdateIntervention = false;
let canDeleteIntervention = false;
let canCreateAction = false;
let canUpdateAction = false;
let canDeleteAction = false;

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const form = document.getElementById('registryForm');
const list = document.getElementById('registryList');
const addInterventionBtn = document.getElementById('addInterventionBtn');
const writePanel = document.getElementById('writePanel');
const formModalTitle = document.getElementById('formModalTitle');
const librarySelect = document.getElementById('librarySelect');
const dsdSelect = document.getElementById('dsdSelect');
const gndSelect = document.getElementById('gndSelect');
const institutionSelect = document.getElementById('institutionSelect');
const actionInstitutionSelect = document.getElementById('actionInstitutionSelect');
const nearbyComplaintList = document.getElementById('nearbyComplaintList');
const nearbyComplaintCount = document.getElementById('nearbyComplaintCount');
const locationAdminStatus = document.getElementById('locationAdminStatus');
const viewModal = document.getElementById('viewInterventionModal');
const viewContent = document.getElementById('viewInterventionContent');
const actionModal = document.getElementById('actionModal');
const actionModalTitle = document.getElementById('actionModalTitle');
const actionList = document.getElementById('actionList');
const actionForm = document.getElementById('actionForm');
const actionPersonSelectorContainer = document.getElementById('actionPersonSelector');

const pageSize = 5;
const nearbyRadiusMeters = 1000;
let interventionRecords = [];
let currentPage = 1;
let locationPicker = null;
let selectedComplaintIds = new Set();
let activeActionIntervention = null;
let actionPersonSelector = null;

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('intervention_registry_view', 'view');
  canCreateIntervention = window.KRWMP_PRIVILEGES.can('intervention_registry_manage', 'create');
  canUpdateIntervention = window.KRWMP_PRIVILEGES.can('intervention_registry_manage', 'update');
  canDeleteIntervention = window.KRWMP_PRIVILEGES.can('intervention_registry_manage', 'delete');
  canCreateAction = window.KRWMP_PRIVILEGES.can('intervention_progress_update', 'create');
  canUpdateAction = window.KRWMP_PRIVILEGES.can('intervention_progress_update', 'update');
  canDeleteAction = window.KRWMP_PRIVILEGES.can('intervention_progress_update', 'delete');
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

function applyPermissions() {
  addInterventionBtn?.classList.toggle('hidden', !canCreateIntervention);
  document.querySelectorAll('[data-edit]').forEach(el => el.classList.toggle('hidden', !canUpdateIntervention));
  document.querySelectorAll('[data-delete]').forEach(el => el.classList.toggle('hidden', !canDeleteIntervention));
  document.querySelectorAll('[data-action]').forEach(el => el.classList.toggle('hidden', !(canCreateAction || canUpdateAction || canDeleteAction)));
}

function applyDateFieldIcons() {
  document.querySelectorAll('input[type="date"]').forEach(input => {
    if (input.dataset.calendarIconApplied === 'true') return;
    input.dataset.calendarIconApplied = 'true';
    input.classList.add('calendar-date-input');
    if (!input.parentElement.classList.contains('calendar-field')) {
      const wrapper = document.createElement('span');
      wrapper.className = 'calendar-field block relative mt-1';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }
  });
  if (!document.getElementById('calendarFieldStyle')) {
    const style = document.createElement('style');
    style.id = 'calendarFieldStyle';
    style.textContent = `.calendar-field::after{content:'📅';position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:13px;opacity:.8}.calendar-date-input{padding-right:2.4rem!important;color-scheme:dark}.calendar-date-input::-webkit-calendar-picker-indicator{opacity:0;position:absolute;right:0;width:2.4rem;height:100%;cursor:pointer}`;
    document.head.appendChild(style);
  }
}

async function loadLibrary() {
  const data = await json('/api/interventions/library');
  librarySelect.innerHTML = '<option value="">Select intervention type</option>';
  (data.library || []).filter(i => i.active !== false).forEach(i => {
    const option = document.createElement('option');
    option.value = i.id;
    option.textContent = i.intervention_name;
    librarySelect.appendChild(option);
  });
}

async function loadDsds(selected = '') {
  const data = await json('/api/interventions/lookups/dsds');
  dsdSelect.innerHTML = '<option value="">Auto-detect from map</option>';
  (data.dsds || []).forEach(row => {
    const option = document.createElement('option');
    option.value = row.dsd_name;
    option.textContent = row.dsd_name;
    if (row.dsd_name === selected) option.selected = true;
    dsdSelect.appendChild(option);
  });
}

async function loadGnds(dsdName = '', selected = '') {
  gndSelect.innerHTML = '<option value="">Loading GNDs...</option>';
  const url = dsdName ? `/api/interventions/lookups/gnds?dsd_name=${encodeURIComponent(dsdName)}` : '/api/interventions/lookups/gnds';
  const data = await json(url);
  gndSelect.innerHTML = '<option value="">Auto-detect from map</option>';
  (data.gnds || []).forEach(row => {
    const option = document.createElement('option');
    option.value = row.gnd_name;
    option.textContent = row.gnd_name;
    if (row.gnd_name === selected) option.selected = true;
    gndSelect.appendChild(option);
  });
}

async function loadInstitutions(selected = '') {
  const data = await json('/api/interventions/lookups/institutions');
  const options = ['<option value="">Select institution</option>'];
  (data.institutions || []).forEach(row => {
    const selectedAttr = row.institution_name === selected ? ' selected' : '';
    options.push(`<option value="${escapeHtml(row.institution_name)}"${selectedAttr}>${escapeHtml(row.institution_name)}</option>`);
  });
  institutionSelect.innerHTML = options.join('');
  actionInstitutionSelect.innerHTML = options.join('');
}

function setLocationStatus(message, error = false) {
  if (!locationAdminStatus) return;
  locationAdminStatus.textContent = message || '';
  locationAdminStatus.className = error ? 'form-error' : 'form-helper';
}

function clearNearbyComplaints(message = 'Select a map location to search nearby unlinked complaints.') {
  selectedComplaintIds = new Set();
  if (nearbyComplaintCount) nearbyComplaintCount.textContent = '0 found';
  if (nearbyComplaintList) nearbyComplaintList.innerHTML = `<div class="krwmp-empty-state">${escapeHtml(message)}</div>`;
}

function complaintType(row) {
  return row.issue_name || row.category_name || row.severity_level || '-';
}

function complaintSummary(row) {
  return row.issue_title || row.description || row.report_code || 'Community complaint';
}

function renderNearbyComplaints(reports = []) {
  selectedComplaintIds = new Set();
  if (nearbyComplaintCount) nearbyComplaintCount.textContent = `${reports.length} found`;
  if (!nearbyComplaintList) return;
  if (!reports.length) {
    nearbyComplaintList.innerHTML = '<div class="krwmp-empty-state">No unlinked complaints found within 1 km.</div>';
    return;
  }
  nearbyComplaintList.innerHTML = reports.map(row => `
    <label class="krwmp-card p-3 flex gap-3 items-start">
      <input type="checkbox" class="mt-1 nearby-complaint-checkbox" value="${escapeHtml(row.id)}">
      <span class="min-w-0 flex-1">
        <span class="block text-sm font-semibold text-slate-100">${escapeHtml(complaintSummary(row))}</span>
        <span class="block text-xs text-slate-400">${escapeHtml(row.report_code || '-')} · ${escapeHtml(complaintType(row))} · ${escapeHtml(row.status || '-')}</span>
        <span class="block text-xs text-slate-500">${escapeHtml(Number(row.distance_meters || 0).toFixed(1))} m away · Reported ${escapeHtml(formatDate(row.submitted_at))}</span>
      </span>
    </label>
  `).join('');
  nearbyComplaintList.querySelectorAll('.nearby-complaint-checkbox').forEach(input => {
    input.addEventListener('change', () => {
      if (input.checked) selectedComplaintIds.add(input.value);
      else selectedComplaintIds.delete(input.value);
    });
  });
}

async function identifySelectedLocation(latitude, longitude) {
  try {
    const data = await json(`/api/spatial/identify?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
    const dsdName = data.dsd?.dsd_name || '';
    const gndName = data.gnd?.gnd_name || '';
    if (dsdName) {
      await loadDsds(dsdName);
      await loadGnds(dsdName, gndName);
    } else {
      await loadDsds('');
      await loadGnds('');
    }
    setLocationStatus(dsdName && gndName
      ? `Detected ${dsdName} / ${gndName}.`
      : 'Warning: DSD/GND could not be detected for this point. You can still save if the current workflow allows it.',
    !dsdName || !gndName);
  } catch (error) {
    setLocationStatus(`Warning: unable to identify DSD/GND. ${error.message}`, true);
  }
}

async function loadNearbyComplaints(latitude, longitude) {
  nearbyComplaintList.innerHTML = '<div class="krwmp-loading-state">Searching nearby unlinked complaints...</div>';
  try {
    const params = new URLSearchParams({ latitude, longitude, radius_meters: nearbyRadiusMeters, limit: 50 });
    const data = await json(`/api/community-issue-interventions/nearby-unlinked?${params.toString()}`);
    renderNearbyComplaints(data.reports || []);
  } catch (error) {
    clearNearbyComplaints(`Unable to load nearby complaints: ${error.message}`);
  }
}

async function handleLocationChange(point) {
  if (point?.cleared) {
    await loadDsds('');
    await loadGnds('');
    clearNearbyComplaints();
    setLocationStatus('');
    return;
  }
  if (!Number.isFinite(Number(point?.latitude)) || !Number.isFinite(Number(point?.longitude))) return;
  await identifySelectedLocation(point.latitude, point.longitude);
  await loadNearbyComplaints(point.latitude, point.longitude);
}

function initLocationPicker() {
  if (!window.KRWMPLocationPicker) return;
  locationPicker = new window.KRWMPLocationPicker({
    containerId: 'interventionLocationPicker',
    latitudeInput: '#latInput',
    longitudeInput: '#lngInput',
    initialCenter: [80.228081, 7.2334995],
    initialZoom: 10,
    onChange: handleLocationChange,
  });
}

async function linkSelectedComplaints(interventionId) {
  const reportIds = Array.from(selectedComplaintIds);
  if (!interventionId || !reportIds.length) return;
  await json(`/api/interventions/registry/${interventionId}/community-reports`, {
    method: 'POST',
    body: { report_ids: reportIds, link_note: 'Linked from Intervention Registry location workflow' },
  });
  selectedComplaintIds = new Set();
}

async function loadRegistry() {
  list.innerHTML = '<div class="krwmp-loading-state">Loading interventions...</div>';
  const data = await json('/api/interventions/registry');
  interventionRecords = data.interventions || [];
  applyRequestedInterventionPage();
  if (currentPage > totalPages()) currentPage = totalPages();
  renderRegistryPage();
  setTimeout(focusRequestedIntervention, 100);
}

function totalPages() {
  return Math.max(1, Math.ceil(interventionRecords.length / pageSize));
}

function paginatedRecords() {
  const start = (currentPage - 1) * pageSize;
  return interventionRecords.slice(start, start + pageSize);
}

function requestedInterventionId() {
  return new URLSearchParams(window.location.search).get('intervention_id') || '';
}

function applyRequestedInterventionPage() {
  const targetId = requestedInterventionId();
  if (!targetId) return;
  const index = interventionRecords.findIndex(item => String(item.id) === String(targetId));
  if (index >= 0) currentPage = Math.floor(index / pageSize) + 1;
}

function focusRequestedIntervention() {
  const targetId = requestedInterventionId();
  if (!targetId) return;
  const card = document.getElementById(`intervention-${targetId}`);
  if (!card) return;
  card.classList.add('ring-2', 'ring-emerald-400/60');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function calculatedProgress(item = {}) {
  const actions = item.timeline || [];
  if (!actions.length) return 0;
  const total = actions.reduce((sum, action) => sum + Number(action.progress_percent || 0), 0);
  return Math.round(total / actions.length);
}

function renderRegistryPage() {
  list.innerHTML = '';
  if (!interventionRecords.length) {
    list.innerHTML = '<div class="krwmp-empty-state">No interventions registered.</div>';
    return;
  }
  paginatedRecords().forEach(renderIntervention);
  renderPagination();
  applyPermissions();
}

function renderPagination() {
  const total = totalPages();
  const pager = document.createElement('div');
  pager.className = 'krwmp-pagination';
  pager.innerHTML = `<span class="krwmp-pagination-meta">Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, interventionRecords.length)} of ${interventionRecords.length} interventions</span><div class="krwmp-pagination-controls"><button id="prevPageBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${total}</span><button id="nextPageBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentPage === total ? 'disabled' : ''}>Next</button></div>`;
  list.appendChild(pager);
  pager.querySelector('#prevPageBtn')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderRegistryPage(); });
  pager.querySelector('#nextPageBtn')?.addEventListener('click', () => { currentPage = Math.min(total, currentPage + 1); renderRegistryPage(); });
}

function renderIntervention(item) {
  const card = document.createElement('article');
  card.className = 'krwmp-card krwmp-stack-md';
  card.id = `intervention-${item.id}`;
  const progress = calculatedProgress(item);
  card.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
      <div class="min-w-0">
        <h3 class="font-bold text-slate-100">${escapeHtml(item.intervention_title)} (${escapeHtml(item.intervention_code)})</h3>
        <p class="text-xs text-slate-500">${escapeHtml(item.library_name || '-')} · ${escapeHtml(item.status || '-')} · ${escapeHtml(item.priority || '-')} · ${escapeHtml(item.dsd_name || '-')} / ${escapeHtml(item.gnd_name || '-')}</p>
        <p class="text-[10px] text-slate-600">Updated by ${escapeHtml(item.updated_by || '-')} on ${formatDate(item.updated_at)}</p>
      </div>
      <div class="krwmp-table-actions">
        <button data-view="${item.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button>
        <button data-edit="${item.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit</button>
        <button data-action="${item.id}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm">Action</button>
        <button data-delete="${item.id}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm">Delete</button>
      </div>
    </div>
    <div>
      <div class="flex justify-between text-xs text-slate-400 mb-1">
        <span>Calculated Progress</span>
        <span class="krwmp-badge krwmp-badge-success">${progress}%</span>
      </div>
      <div class="h-2 rounded bg-slate-800 overflow-hidden">
        <div class="h-full bg-emerald-500" style="width:${Math.max(0, Math.min(100, progress))}%"></div>
      </div>
    </div>
    <div class="text-xs text-slate-400">${escapeHtml((item.timeline || []).length)} action(s) · ${escapeHtml(item.implementing_office || 'No responsible institution')}</div>
  `;
  list.appendChild(card);
}

function interventionById(id) {
  return interventionRecords.find(item => String(item.id) === String(id));
}

function handleRegistryCardClick(event) {
  const viewButton = event.target.closest('[data-view]');
  const editButton = event.target.closest('[data-edit]');
  const actionButton = event.target.closest('[data-action]');
  const deleteButton = event.target.closest('[data-delete]');
  const button = viewButton || editButton || actionButton || deleteButton;
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const id = viewButton?.dataset.view || editButton?.dataset.edit || actionButton?.dataset.action || deleteButton?.dataset.delete;
  const item = interventionById(id);
  if (viewButton) return openViewModal(id);
  if (!item) return show('Intervention record is not loaded. Refresh and try again.', true);
  if (editButton) return openFormModal(item);
  if (actionButton) return openActionModal(item);
  if (deleteButton) return deleteIntervention(id);
}

function detailRow(label, value) {
  return `<div><dt class="form-helper">${escapeHtml(label)}</dt><dd class="text-sm text-slate-100">${escapeHtml(value || '-')}</dd></div>`;
}

async function safeFetchLinkedComplaints(id) {
  try {
    const data = await json(`/api/interventions/registry/${id}/community-reports`);
    return data.reports || [];
  } catch (_) {
    return [];
  }
}

async function safeFetchAttachments(id) {
  try {
    const data = await json(`/api/files/intervention_registry/${id}`);
    return data.files || [];
  } catch (_) {
    return [];
  }
}

async function openViewModal(id) {
  viewContent.innerHTML = '<div class="krwmp-loading-state">Loading intervention details...</div>';
  viewModal.showModal();
  const [{ intervention }, complaints, attachments] = await Promise.all([
    json(`/api/interventions/registry/${id}`),
    safeFetchLinkedComplaints(id),
    safeFetchAttachments(id),
  ]);
  const progress = calculatedProgress(intervention);
  viewContent.innerHTML = `
    <section class="krwmp-card-muted p-4">
      <h3 class="form-section-heading mb-3">${escapeHtml(intervention.intervention_title)}</h3>
      <dl class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${detailRow('Library Type', intervention.library_name)}
        ${detailRow('Status', intervention.status)}
        ${detailRow('Priority', intervention.priority)}
        ${detailRow('Location', intervention.location_name)}
        ${detailRow('Village', intervention.village_name)}
        ${detailRow('DSD', intervention.dsd_name)}
        ${detailRow('GND', intervention.gnd_name)}
        ${detailRow('Latitude', intervention.latitude)}
        ${detailRow('Longitude', intervention.longitude)}
        ${detailRow('Planned Start', formatDate(intervention.planned_start_date))}
        ${detailRow('Planned End', formatDate(intervention.planned_end_date))}
        ${detailRow('Actual Start', formatDate(intervention.actual_start_date))}
        ${detailRow('Actual End', formatDate(intervention.actual_end_date))}
        ${detailRow('Lead Officer', intervention.lead_officer_name)}
        ${detailRow('Lead Contact', intervention.lead_officer_contact)}
        ${detailRow('Responsible Institution', intervention.implementing_office)}
        ${detailRow('Calculated Progress', `${progress}%`)}
        ${detailRow('Remarks / Description', intervention.remarks)}
      </dl>
    </section>
    <section class="krwmp-card-muted p-4">
      <h3 class="form-section-heading mb-3">Linked Complaints</h3>
      ${complaints.length ? complaints.map(row => `<div class="krwmp-card p-3 text-sm"><strong>${escapeHtml(complaintSummary(row))}</strong><div class="form-helper">${escapeHtml(row.report_code || '-')} · ${escapeHtml(row.category_name || row.issue_name || '-')} · ${escapeHtml(row.report_status || row.status || '-')}</div></div>`).join('') : '<div class="krwmp-empty-state">No linked complaints.</div>'}
    </section>
    <section class="krwmp-card-muted p-4">
      <h3 class="form-section-heading mb-3">Actions</h3>
      ${actionCardsHtml(intervention.timeline || [], false)}
    </section>
    <section class="krwmp-card-muted p-4">
      <h3 class="form-section-heading mb-3">Attachments</h3>
      ${attachments.length ? attachments.map(file => `<div class="text-sm text-slate-200">${escapeHtml(file.original_filename || file.object_key || 'Attachment')}</div>`).join('') : '<div class="krwmp-empty-state">No attachments found.</div>'}
    </section>
  `;
}

async function openFormModal(item = null) {
  form.reset();
  clearNearbyComplaints();
  setLocationStatus('');
  form.elements.id.value = item?.id || '';
  formModalTitle.textContent = item ? 'Edit Intervention' : 'Add Intervention';
  await loadDsds(item?.dsd_name || '');
  await loadGnds(item?.dsd_name || '', item?.gnd_name || '');
  if (item) {
    form.library_id.value = item.library_id || '';
    form.intervention_title.value = item.intervention_title || '';
    form.location_name.value = item.location_name || '';
    form.village_name.value = item.village_name || '';
    form.latitude.value = item.latitude || '';
    form.longitude.value = item.longitude || '';
    form.priority.value = item.priority || 'medium';
    form.status.value = item.status || 'planned';
    form.planned_start_date.value = dateInput(item.planned_start_date);
    form.planned_end_date.value = dateInput(item.planned_end_date);
    form.actual_start_date.value = dateInput(item.actual_start_date);
    form.actual_end_date.value = dateInput(item.actual_end_date);
    form.lead_officer_name.value = item.lead_officer_name || '';
    form.lead_officer_contact.value = item.lead_officer_contact || '';
    form.implementing_office.value = item.implementing_office || '';
    form.remarks.value = item.remarks || '';
  }
  writePanel.showModal();
  setTimeout(() => {
    locationPicker?.refresh();
    if (item?.latitude && item?.longitude) locationPicker?.setLocation(Number(item.latitude), Number(item.longitude), true);
  }, 150);
}

function closeFormModal() {
  writePanel.close();
}

async function saveRegistry(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  const id = body.id;
  delete body.id;
  delete body.progress_percent;
  if (id && !canUpdateIntervention) return show('You do not have update access for interventions.', true);
  if (!id && !canCreateIntervention) return show('You do not have create access for interventions.', true);
  try {
    const result = id
      ? await json(`/api/interventions/registry/${id}`, { method: 'PUT', body })
      : await json('/api/interventions/registry', { method: 'POST', body });
    const savedId = id || result.intervention?.id;
    await linkSelectedComplaints(savedId);
    closeFormModal();
    show('Intervention saved.');
    await loadRegistry();
  } catch (error) {
    show(error.message, true);
  }
}

function resetActionForm() {
  actionForm.reset();
  actionForm.action_id.value = '';
  actionForm.responsible_person_id.value = '';
  actionForm.officer_name.value = '';
  actionForm.officer_contact.value = '';
  actionForm.progress_percent.value = 0;
  mountActionPersonSelector();
  document.getElementById('saveActionBtn').textContent = 'Save Action';
}

function actionOfficerName(action = {}) {
  return action.responsible_person_full_name || action.officer_name || '-';
}

function actionOfficerPhone(action = {}) {
  return action.responsible_person_phone_number || action.officer_contact || '-';
}

function actionOfficerDesignation(action = {}) {
  return action.responsible_person_designation || action.designation || '';
}

function personProfileLink(personId, label = 'View Profile') {
  if (!personId) return '';
  return `<a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" href="/person-profile.html?id=${encodeURIComponent(personId)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

function personFromAction(action = {}) {
  if (!action.responsible_person_id) return null;
  return {
    id: action.responsible_person_id,
    full_name: action.responsible_person_full_name || action.officer_name,
    phone_number: action.responsible_person_phone_number || action.officer_contact,
    email: action.responsible_person_email,
    dsd: action.responsible_person_dsd,
    gnd: action.responsible_person_gnd,
  };
}

function applyResponsiblePerson(person = null) {
  actionForm.responsible_person_id.value = person?.id || '';
  if (!person) {
    actionForm.officer_name.value = '';
    actionForm.officer_contact.value = '';
    return;
  }
  actionForm.officer_name.value = person.full_name || '';
  actionForm.officer_contact.value = person.phone_number || '';
}

function mountActionPersonSelector(action = null) {
  if (!actionPersonSelectorContainer || !window.KRWMP_PERSON_SELECTOR) return;
  actionPersonSelector?.destroy?.();
  actionPersonSelector = window.KRWMP_PERSON_SELECTOR.mount({
    container: actionPersonSelectorContainer,
    valueInput: '#actionResponsiblePersonId',
    label: 'Search or Create Responsible Officer',
    helperText: 'Select a responsible officer from the master person registry, or create a new person.',
    allowCreate: true,
    selectedPerson: personFromAction(action),
    onSelect: applyResponsiblePerson,
    onCreate: applyResponsiblePerson,
  });
}

async function openActionModal(item) {
  activeActionIntervention = item;
  actionModalTitle.textContent = `Actions - ${item.intervention_title}`;
  resetActionForm();
  await loadActionList(item.id);
  actionModal.showModal();
}

async function loadActionList(interventionId) {
  actionList.innerHTML = '<div class="krwmp-loading-state">Loading actions...</div>';
  const data = await json(`/api/interventions/registry/${interventionId}/timeline`);
  actionList.innerHTML = actionCardsHtml(data.actions || [], true);
  actionList.querySelectorAll('[data-edit-action]').forEach(button => {
    button.addEventListener('click', () => fillActionForm((data.actions || []).find(action => String(action.id) === String(button.dataset.editAction))));
  });
  actionList.querySelectorAll('[data-delete-action]').forEach(button => {
    button.addEventListener('click', () => deleteAction(button.dataset.deleteAction));
  });
  applyPermissions();
}

function actionCardsHtml(actions = [], interactive = true) {
  if (!actions.length) return '<div class="krwmp-empty-state">No actions recorded.</div>';
  return actions.map(action => `
    <article class="krwmp-card p-3 text-sm">
      <div class="flex justify-between gap-3">
        <div>
          <strong class="text-slate-100">${escapeHtml(action.action_title || '-')}</strong>
          <div class="form-helper">${escapeHtml(formatDate(action.action_date))} · ${escapeHtml(action.action_status || 'completed')} · ${escapeHtml(action.progress_percent ?? 0)}%</div>
        </div>
        ${interactive ? `<div class="krwmp-table-actions"><button type="button" data-edit-action="${escapeHtml(action.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${canUpdateAction ? '' : 'hidden'}">Edit</button><button type="button" data-delete-action="${escapeHtml(action.id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDeleteAction ? '' : 'hidden'}">Delete</button></div>` : ''}
      </div>
      <p class="mt-2 text-slate-300">${escapeHtml(action.action_description || '-')}</p>
      <div class="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-400">
        Responsible Officer: ${escapeHtml(actionOfficerName(action))} | ${escapeHtml(actionOfficerPhone(action))}
        ${actionOfficerDesignation(action) ? ` | ${escapeHtml(actionOfficerDesignation(action))}` : ''}
      </div>
      ${action.responsible_person_id ? `<div class="mt-2">${personProfileLink(action.responsible_person_id, 'View Responsible Officer')}</div>` : ''}
    </article>
  `).join('');
}

function fillActionForm(action = {}) {
  if (!action) return;
  actionForm.action_id.value = action.id || '';
  actionForm.action_date.value = dateInput(action.action_date);
  actionForm.progress_percent.value = action.progress_percent ?? 0;
  actionForm.action_title.value = action.action_title || '';
  actionForm.action_description.value = action.action_description || '';
  actionForm.responsible_person_id.value = action.responsible_person_id || '';
  actionForm.officer_name.value = action.officer_name || action.responsible_person_full_name || '';
  actionForm.officer_contact.value = action.officer_contact || action.responsible_person_phone_number || '';
  actionForm.designation.value = '';
  actionForm.institution.value = '';
  actionForm.responsibility.value = action.action_title || '';
  mountActionPersonSelector(action);
  document.getElementById('saveActionBtn').textContent = 'Update Action';
}

async function saveAction(event) {
  event.preventDefault();
  if (!activeActionIntervention) return;
  const body = Object.fromEntries(new FormData(actionForm));
  const actionId = body.action_id;
  delete body.action_id;
  if (actionId && !canUpdateAction) return show('You do not have update access for intervention actions.', true);
  if (!actionId && !canCreateAction) return show('You do not have create access for intervention actions.', true);
  if (!actionId && !body.responsible_person_id && !body.officer_name) {
    return show('Select or create a responsible officer before saving the action.', true);
  }
  try {
    if (actionId) {
      await json(`/api/interventions/registry/${activeActionIntervention.id}/timeline/${actionId}`, { method: 'PUT', body });
    } else {
      await json(`/api/interventions/registry/${activeActionIntervention.id}/timeline`, { method: 'POST', body: { ...body, action_status: 'completed' } });
      try {
        await json(`/api/interventions/registry/${activeActionIntervention.id}/officers`, {
          method: 'POST',
          body: {
            officer_name: body.officer_name,
            designation: body.designation,
            institution: body.institution,
            phone: body.officer_contact,
            responsibility: body.responsibility || body.action_title,
          },
        });
      } catch (_) {
        // The action row itself stores the responsible officer; the legacy officer table is best-effort.
      }
    }
    resetActionForm();
    await loadActionList(activeActionIntervention.id);
    await loadRegistry();
    show('Action saved.');
  } catch (error) {
    show(error.message, true);
  }
}

async function deleteAction(actionId) {
  if (!canDeleteAction || !activeActionIntervention) return show('You do not have delete access for intervention actions.', true);
  if (!confirm('Delete this action?')) return;
  try {
    await json(`/api/interventions/registry/${activeActionIntervention.id}/timeline/${actionId}`, { method: 'DELETE' });
    await loadActionList(activeActionIntervention.id);
    await loadRegistry();
    show('Action deleted.');
  } catch (error) {
    show(error.message, true);
  }
}

async function deleteIntervention(id) {
  if (!canDeleteIntervention) return show('You do not have delete access for interventions.', true);
  if (!confirm('Delete this registered intervention, including its action timeline and officer records?')) return;
  try {
    await json(`/api/interventions/registry/${id}`, { method: 'DELETE' });
    show('Intervention deleted.');
    await loadRegistry();
  } catch (error) {
    show(error.message, true);
  }
}

function dateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function bindEvents() {
  addInterventionBtn?.addEventListener('click', () => openFormModal());
  document.getElementById('closeFormModalBtn')?.addEventListener('click', closeFormModal);
  document.getElementById('closeViewModalBtn')?.addEventListener('click', () => viewModal.close());
  document.getElementById('closeViewModalFooterBtn')?.addEventListener('click', () => viewModal.close());
  document.getElementById('closeActionModalBtn')?.addEventListener('click', () => actionModal.close());
  document.getElementById('resetBtn')?.addEventListener('click', () => { form.reset(); locationPicker?.clear(); loadGnds(''); clearNearbyComplaints(); });
  document.getElementById('refreshBtn')?.addEventListener('click', loadRegistry);
  document.getElementById('resetActionFormBtn')?.addEventListener('click', resetActionForm);
  list.addEventListener('click', handleRegistryCardClick);
  dsdSelect.addEventListener('change', () => loadGnds(dsdSelect.value));
  form.addEventListener('submit', saveRegistry);
  actionForm.addEventListener('submit', saveAction);
}

(async () => {
  await initSidebar();
  await Promise.all([loadLibrary(), loadDsds(), loadInstitutions()]);
  await loadGnds('');
  initLocationPicker();
  bindEvents();
  applyPermissions();
  applyDateFieldIcons();
  await loadRegistry();
})().catch(error => show(error.message, true));
