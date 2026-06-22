const { apiRequest: api } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const form = document.getElementById('volunteerForm');
const saveBtn = document.getElementById('saveBtn');
const pageTitle = document.getElementById('pageTitle');
const params = new URLSearchParams(window.location.search);
const organisationId = params.get('id');
let locationPicker = null;
let canCreate = false;
let canUpdate = false;

function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
function clean(value) { return String(value ?? '').trim(); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function backToList() { window.location.href = '/volunteer-organisations.html'; }

async function init() {
  await window.KRWMP_ENGINE.assembleInterfaceContext();
  await window.KRWMP_PRIVILEGES.protectPage('volunteer_organisation_management', organisationId ? 'update' : 'create');
  canCreate = window.KRWMP_PRIVILEGES.can('volunteer_organisation_management', 'create');
  canUpdate = window.KRWMP_PRIVILEGES.can('volunteer_organisation_management', 'update');
  initLocationPicker();
  bindEvents();
  if (organisationId) await loadOrganisation();
}

function initLocationPicker() {
  if (!window.KRWMPLocationPicker) return;
  locationPicker = new window.KRWMPLocationPicker({
    containerId: 'volunteerLocationPicker',
    latitudeInput: '#latitudeInput',
    longitudeInput: '#longitudeInput',
    initialCenter: [80.3919668, 7.0020943],
    initialZoom: 10,
    onChange: async point => {
      if (point.cleared) { clearLocationInfo(); return; }
      await identifyAdministrativeLocation(point.latitude, point.longitude);
    },
  });
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
  } catch (error) {
    clearAutoSpatialFields();
    setLocationInfo(error.message || 'Unable to identify selected location.');
  }
}

function fillForm(row = {}) {
  pageTitle.textContent = 'Edit Volunteer Organisation';
  form.institution_name.value = row.institution_name || '';
  form.institution_code.value = row.institution_code || '';
  form.institution_type.value = row.institution_type || 'Volunteer Organisation';
  form.active.value = String(row.active !== false);
  form.contact_person.value = row.contact_person || '';
  form.contact_phone.value = row.contact_phone || '';
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
  if (row.latitude && row.longitude) {
    locationPicker?.setLocation?.(Number(row.latitude), Number(row.longitude), true);
    setLocationInfo(`Existing location: ${row.latitude}, ${row.longitude}<br>DSD: ${escapeHtml(row.dsd_name || '-')}<br>GND: ${escapeHtml(row.gnd_name || '-')}`, true);
  }
}

async function loadOrganisation() {
  const data = await api(`/api/volunteer-organisations/${encodeURIComponent(organisationId)}`);
  fillForm(data.organisation || {});
}

async function saveOrganisation(event) {
  event.preventDefault();
  if (organisationId && !canUpdate) return show('You do not have update access for volunteer organisations.', true);
  if (!organisationId && !canCreate) return show('You do not have create access for volunteer organisations.', true);
  if (!document.getElementById('latitudeInput').value || !document.getElementById('longitudeInput').value) return show('Please mark the organisation location on the map before saving.', true);
  if (!document.getElementById('dsdNameInput').value || !document.getElementById('gndNameInput').value) return show('DSD/GND is not captured. Please select a valid point inside the Kelani River Basin area.', true);
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  try {
    const url = organisationId ? `/api/volunteer-organisations/${encodeURIComponent(organisationId)}` : '/api/volunteer-organisations';
    const method = organisationId ? 'PUT' : 'POST';
    const response = await fetch(url, { method, body: new FormData(form) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || 'Unable to save volunteer organisation.');
    show('Volunteer organisation saved successfully.');
    setTimeout(backToList, 700);
  } catch (error) {
    show(error.message || 'Unable to save volunteer organisation.', true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Organisation';
  }
}

function clearAutoSpatialFields() { ['dsdNameInput', 'gndNameInput', 'districtInput', 'subWatershedIdInput', 'subWatershedNameInput'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); }
function clearLocationInfo() { clearAutoSpatialFields(); setLocationInfo('No location selected.'); }
function setLocationInfo(message, html = false) { const box = document.getElementById('locationInfo'); if (!box) return; if (html) box.innerHTML = message; else box.textContent = message; }

function bindEvents() {
  form.addEventListener('submit', saveOrganisation);
  form.addEventListener('reset', () => setTimeout(clearLocationInfo, 0));
}

init().catch(error => show(error.message || 'Unable to load volunteer organisation form.', true));
