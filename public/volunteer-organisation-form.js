const { apiRequest: api } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const form = document.getElementById('volunteerForm');
const saveBtn = document.getElementById('saveBtn');
const pageTitle = document.getElementById('pageTitle');
const params = new URLSearchParams(window.location.search);
let organisationId = params.get('id');
let locationPicker = null;
let activityLocationPicker = null;
let canCreate = false;
let canUpdate = false;
let activityTypes = [];
let partnerInstitutions = [];
let coordinatorMatches = [];

function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function openModal(dialog) { if (dialog) (typeof dialog.showModal === 'function' ? dialog.showModal() : dialog.setAttribute('open', 'open')); }
function closeModal(dialog) { if (dialog) (typeof dialog.close === 'function' ? dialog.close() : dialog.removeAttribute('open')); }
function debounce(fn, delay = 300) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; }

async function init() {
  await window.KRWMP_ENGINE.assembleInterfaceContext();
  await window.KRWMP_PRIVILEGES.protectPage('volunteer_organisation_management', organisationId ? 'update' : 'create');
  canCreate = window.KRWMP_PRIVILEGES.can('volunteer_organisation_management', 'create');
  canUpdate = window.KRWMP_PRIVILEGES.can('volunteer_organisation_management', 'update');
  initLocationPicker();
  initActivityLocationPicker();
  bindEvents();
  await loadLookups();
  toggleProgrammeSection();
  if (organisationId) await loadOrganisation();
}

function initLocationPicker() {
  if (!window.KRWMPLocationPicker) return;
  locationPicker = new window.KRWMPLocationPicker({ containerId: 'volunteerLocationPicker', latitudeInput: '#latitudeInput', longitudeInput: '#longitudeInput', initialCenter: [80.3919668, 7.0020943], initialZoom: 10, onChange: async point => { if (point.cleared) { clearLocationInfo(); return; } await identifyAdministrativeLocation(point.latitude, point.longitude); } });
}

function initActivityLocationPicker() {
  if (!window.KRWMPLocationPicker) return;
  activityLocationPicker = new window.KRWMPLocationPicker({ containerId: 'activityLocationPicker', latitudeInput: '#activityLatitude', longitudeInput: '#activityLongitude', initialCenter: [80.3919668, 7.0020943], initialZoom: 10, onChange: async point => { if (point.cleared) { clearActivityLocationInfo(); return; } await identifyActivityLocation(point.latitude, point.longitude); } });
}

async function identifyAdministrativeLocation(latitude, longitude) {
  setLocationInfo('Identifying DSD, GND and sub-watershed...');
  try {
    const response = await fetch(`/api/spatial/identify?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to identify location.');
    document.getElementById('dsdNameInput').value = data.dsd?.dsd_name || '';
    document.getElementById('gndNameInput').value = data.gnd?.gnd_name || '';
    document.getElementById('districtInput').value = data.dsd?.iddistrict || '';
    document.getElementById('subWatershedIdInput').value = data.sub_watershed?.id || '';
    document.getElementById('subWatershedNameInput').value = data.sub_watershed?.watershed_name || '';
    setLocationInfo(`<strong class="text-slate-200">Selected Location</strong><br>Latitude: ${escapeHtml(latitude)}<br>Longitude: ${escapeHtml(longitude)}<br>DSD: ${escapeHtml(data.dsd?.dsd_name || 'Not identified')}<br>GND: ${escapeHtml(data.gnd?.gnd_name || 'Not identified')}<br>Sub-watershed: ${escapeHtml(data.sub_watershed?.watershed_name || 'Not identified')}`, true);
  } catch (error) { clearAutoSpatialFields(); setLocationInfo(error.message || 'Unable to identify selected location.'); }
}

async function identifyActivityLocation(latitude, longitude) {
  document.getElementById('activityLocationInfo').textContent = 'Identifying activity location...';
  try {
    const response = await fetch(`/api/spatial/identify?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to identify location.');
    document.getElementById('activityDsd').value = data.dsd?.dsd_name || '';
    document.getElementById('activityGnd').value = data.gnd?.gnd_name || '';
    document.getElementById('activityDistrict').value = data.dsd?.iddistrict || '';
    document.getElementById('activitySubWatershedId').value = data.sub_watershed?.id || '';
    document.getElementById('activitySubWatershedName').value = data.sub_watershed?.watershed_name || '';
    document.getElementById('activityLocationInfo').innerHTML = `Latitude: ${escapeHtml(latitude)}<br>Longitude: ${escapeHtml(longitude)}<br>DSD: ${escapeHtml(data.dsd?.dsd_name || '-')}<br>GND: ${escapeHtml(data.gnd?.gnd_name || '-')}`;
  } catch (error) { clearActivityLocationInfo(); show(error.message, true); }
}

async function loadLookups() {
  if (!organisationId && !canCreate) return;
  const [types, institutions] = await Promise.all([api('/api/volunteer-organisations/lookups/activity-types'), api('/api/volunteer-organisations/lookups/partner-institutions')]);
  activityTypes = types.activity_types || [];
  partnerInstitutions = institutions.institutions || [];
  document.getElementById('activityTypeSelect').innerHTML = '<option value="">Select activity type</option>' + activityTypes.map(t => `<option value="${escapeHtml(t.id)}" data-name="${escapeHtml(t.activity_type_name)}">${escapeHtml(t.activity_type_name)}</option>`).join('');
  document.getElementById('partnerInstitutionSelect').innerHTML = '<option value="">Select partner organisation</option>' + partnerInstitutions.map(i => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.institution_name)}${i.institution_type ? ' - ' + escapeHtml(i.institution_type) : ''}</option>`).join('');
}

function fillForm(row = {}) {
  pageTitle.textContent = 'Edit Volunteer Organisation';
  form.institution_name.value = row.institution_name || '';
  form.institution_code.value = row.institution_code || '';
  form.institution_type.value = row.institution_type || 'Volunteer Organisation';
  form.active.value = String(row.active !== false);
  form.contact_email.value = row.contact_email || '';
  form.website.value = row.website || '';
  form.address.value = row.address || '';
  form.description.value = row.description || '';
  document.getElementById('latitudeInput').value = row.latitude || '';
  document.getElementById('longitudeInput').value = row.longitude || '';
  document.getElementById('districtInput').value = row.district || '';
  document.getElementById('dsdNameInput').value = row.dsd_name || '';
  document.getElementById('gndNameInput').value = row.gnd_name || '';
  document.getElementById('subWatershedIdInput').value = row.sub_watershed_id || '';
  document.getElementById('subWatershedNameInput').value = row.sub_watershed_name || '';
  if (row.latitude && row.longitude) { locationPicker?.setLocation?.(Number(row.latitude), Number(row.longitude), true); setLocationInfo(`Existing location: ${row.latitude}, ${row.longitude}<br>DSD: ${escapeHtml(row.dsd_name || '-')}<br>GND: ${escapeHtml(row.gnd_name || '-')}`, true); }
  renderProgrammes(row.programmes || []);
}

async function loadOrganisation() { const data = await api(`/api/volunteer-organisations/${encodeURIComponent(organisationId)}`); fillForm(data.organisation || {}); toggleProgrammeSection(); }
function toggleProgrammeSection() { document.getElementById('programmeSection').classList.toggle('hidden', !organisationId); document.getElementById('programmePlaceholder').classList.toggle('hidden', !!organisationId); }

async function saveOrganisation(event) {
  event.preventDefault();
  if (organisationId && !canUpdate) return show('You do not have update access for volunteer organisations.', true);
  if (!organisationId && !canCreate) return show('You do not have create access for volunteer organisations.', true);
  if (!document.getElementById('latitudeInput').value || !document.getElementById('longitudeInput').value) return show('Please mark the organisation location on the map before saving.', true);
  if (!document.getElementById('dsdNameInput').value || !document.getElementById('gndNameInput').value) return show('DSD/GND is not captured. Please select a valid point inside the Kelani River Basin area.', true);
  saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
  try {
    const url = organisationId ? `/api/volunteer-organisations/${encodeURIComponent(organisationId)}` : '/api/volunteer-organisations';
    const method = organisationId ? 'PUT' : 'POST';
    const response = await fetch(url, { method, body: new FormData(form) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save volunteer organisation.');
    if (!organisationId && data.organisation?.id) { organisationId = String(data.organisation.id); window.history.replaceState({}, '', `/volunteer-organisation-form.html?id=${encodeURIComponent(organisationId)}`); pageTitle.textContent = 'Edit Volunteer Organisation'; toggleProgrammeSection(); }
    show('Volunteer organisation saved successfully. You can now add catchment improvement programmes.');
    await loadOrganisation();
  } catch (error) { show(error.message || 'Unable to save volunteer organisation.', true); }
  finally { saveBtn.disabled = false; saveBtn.textContent = 'Save Organisation'; }
}

function renderProgrammes(programmes = []) {
  const list = document.getElementById('programmeList');
  if (!programmes.length) { list.innerHTML = '<div class="krwmp-empty-state">No catchment improvement programmes recorded.</div>'; return; }
  list.innerHTML = programmes.map(programme => `<article class="krwmp-card krwmp-stack-sm"><div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3"><div><h3 class="font-semibold text-slate-100">${escapeHtml(programme.programme_name)}</h3><p class="form-helper mt-1">Coordinator: ${escapeHtml(programme.coordinator_name || '-')} | Status: ${escapeHtml(programme.overall_status || '-')}</p><p class="text-sm text-slate-300 mt-2">${escapeHtml(programme.recommendations || '')}</p></div><button type="button" data-add-activity="${programme.id}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm">Add Activity</button></div><div class="space-y-2 border-t border-slate-800 pt-3">${renderActivities(programme.activities || [])}</div></article>`).join('');
}
function renderActivities(activities = []) { if (!activities.length) return '<div class="krwmp-empty-state py-2">No activities recorded under this programme.</div>'; return activities.map(a => `<div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><div class="font-semibold text-slate-100">${escapeHtml(a.activity_type_name || a.other_activity_type || 'Activity')}</div><div class="form-helper mt-1">${escapeHtml(a.activity_date || '-')} | Partner: ${escapeHtml(a.partner_organisation_name || '-')} | ${escapeHtml(a.dsd_name || '-')} / ${escapeHtml(a.gnd_name || '-')}</div><p class="text-sm text-slate-300 mt-2">${escapeHtml(a.notes || '')}</p></div>`).join(''); }

function openProgrammeModal() { document.getElementById('programmeForm').reset(); document.getElementById('programmeCoordinatorPersonId').value = ''; coordinatorMatches = []; document.getElementById('coordinatorSearchResults').innerHTML = ''; document.getElementById('coordinatorSelectedSummary').className = 'krwmp-empty-state py-2'; document.getElementById('coordinatorSelectedSummary').textContent = 'No coordinator selected.'; openModal(document.getElementById('programmeModal')); }
async function saveProgramme(event) { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); const response = await api(`/api/volunteer-organisations/${encodeURIComponent(organisationId)}/programmes`, { method: 'POST', body }); closeModal(document.getElementById('programmeModal')); show('Programme saved.'); await loadOrganisation(); }
async function searchCoordinator() { const q = String(document.getElementById('coordinatorSearch').value || '').trim(); if (q.length < 3) return; const data = await api(`/api/persons/search?q=${encodeURIComponent(q)}&limit=10`); coordinatorMatches = data.persons || []; document.getElementById('coordinatorSearchResults').innerHTML = coordinatorMatches.map(p => `<div class="krwmp-card p-3 flex justify-between gap-3"><div><strong>${escapeHtml(p.full_name || '-')}</strong><div class="form-helper">${escapeHtml(p.phone_number || p.email || '-')}</div></div><button type="button" data-select-coordinator="${escapeHtml(p.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Select</button></div>`).join('') || '<div class="krwmp-empty-state">No matching person found.</div>'; }
function selectCoordinator(id) { const p = coordinatorMatches.find(row => String(row.id) === String(id)); if (!p) return; document.getElementById('programmeCoordinatorPersonId').value = p.id; const box = document.getElementById('coordinatorSelectedSummary'); box.className = 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3'; box.innerHTML = `<strong class="text-emerald-200">${escapeHtml(p.full_name || '-')}</strong><div class="form-helper">${escapeHtml(p.phone_number || p.email || '-')}</div>`; }

function openActivityModal(programmeId) { document.getElementById('activityForm').reset(); document.getElementById('activityProgrammeId').value = programmeId; clearActivityLocationInfo(); document.getElementById('otherActivityLabel').classList.add('hidden'); openModal(document.getElementById('activityModal')); setTimeout(() => activityLocationPicker?.resize?.(), 150); }
async function saveActivity(event) { event.preventDefault(); const programmeId = document.getElementById('activityProgrammeId').value; const body = Object.fromEntries(new FormData(event.currentTarget)); const activityType = activityTypes.find(t => String(t.id) === String(body.activity_type_id)); if (activityType?.activity_type_name === 'Other' && !body.other_activity_type) return show('Please enter other activity type.', true); const response = await api(`/api/volunteer-organisations/${encodeURIComponent(organisationId)}/programmes/${encodeURIComponent(programmeId)}/activities`, { method: 'POST', body }); await uploadActivityPhotos(response.activity); closeModal(document.getElementById('activityModal')); show('Activity saved.'); await loadOrganisation(); }
async function uploadActivityPhotos(activity) { const files = Array.from(document.getElementById('activityPhotoInput').files || []); if (!files.length || !window.KRWMP_FILE_ATTACHMENTS?.uploadAttachment) return; for (let i = 0; i < files.length; i += 1) { document.getElementById('activityPhotoStatus').textContent = `Uploading photo ${i + 1} of ${files.length}...`; await window.KRWMP_FILE_ATTACHMENTS.uploadAttachment(files[i], { moduleKey: 'volunteer_organisations', recordId: activity.id, recordKind: 'catchment_programme_activity', attachmentRole: 'activity_photo', visibility: 'private', metadata: { organisation_id: organisationId, programme_id: activity.programme_id } }); } document.getElementById('activityPhotoStatus').textContent = 'Photos uploaded.'; }

function clearAutoSpatialFields() { ['dsdNameInput', 'gndNameInput', 'districtInput', 'subWatershedIdInput', 'subWatershedNameInput'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }
function clearLocationInfo() { clearAutoSpatialFields(); setLocationInfo('No location selected.'); }
function setLocationInfo(message, html = false) { const box = document.getElementById('locationInfo'); if (!box) return; if (html) box.innerHTML = message; else box.textContent = message; }
function clearActivityLocationInfo() { ['activityLatitude','activityLongitude','activityDistrict','activityDsd','activityGnd','activitySubWatershedId','activitySubWatershedName'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); document.getElementById('activityLocationInfo').textContent = 'No activity location selected.'; }

function bindEvents() {
  form.addEventListener('submit', saveOrganisation);
  form.addEventListener('reset', () => setTimeout(clearLocationInfo, 0));
  document.getElementById('addProgrammeBtn')?.addEventListener('click', openProgrammeModal);
  document.getElementById('programmeForm')?.addEventListener('submit', saveProgramme);
  document.getElementById('activityForm')?.addEventListener('submit', saveActivity);
  document.getElementById('coordinatorSearch')?.addEventListener('input', debounce(() => searchCoordinator().catch(error => show(error.message, true)), 300));
  document.getElementById('coordinatorSearchResults')?.addEventListener('click', event => { const btn = event.target.closest('[data-select-coordinator]'); if (btn) selectCoordinator(btn.dataset.selectCoordinator); });
  document.getElementById('programmeList')?.addEventListener('click', event => { const btn = event.target.closest('[data-add-activity]'); if (btn) openActivityModal(btn.dataset.addActivity); });
  document.getElementById('activityTypeSelect')?.addEventListener('change', event => { const type = activityTypes.find(t => String(t.id) === String(event.target.value)); document.getElementById('otherActivityLabel').classList.toggle('hidden', type?.activity_type_name !== 'Other'); });
  document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(document.getElementById(btn.dataset.closeModal))));
}

init().catch(error => show(error.message || 'Unable to load volunteer organisation form.', true));