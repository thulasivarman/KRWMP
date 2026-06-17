let canCreateInstitution = false;
let canUpdateInstitution = false;
let canDeleteInstitution = false;

const statusBox = document.getElementById('statusBox');
const writePanel = document.getElementById('writePanel');
const institutionForm = document.getElementById('institutionForm');
const tableBody = document.getElementById('institutionTableBody');
const paginationBox = document.getElementById('paginationBox');
const institutionTypeSelect = document.getElementById('institutionTypeSelect');
const typeFilter = document.getElementById('typeFilter');
const activeFilter = document.getElementById('activeFilter');
const searchInput = document.getElementById('searchInput');

let institutions = [];
let institutionTypes = [];
let currentPage = 1;
const pageSize = 10;
let locationPicker = null;

function showStatus(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('institution_management', 'view');
  canCreateInstitution = window.KRWMP_PRIVILEGES.can('institution_management', 'create');
  canUpdateInstitution = window.KRWMP_PRIVILEGES.can('institution_management', 'update');
  canDeleteInstitution = window.KRWMP_PRIVILEGES.can('institution_management', 'delete');
}

function applyPermissions() {
  const canWrite = canCreateInstitution || canUpdateInstitution;
  writePanel.classList.toggle('hidden', !canWrite);
  document.querySelectorAll('[data-edit]').forEach(el => el.classList.toggle('hidden', !canUpdateInstitution));
  document.querySelectorAll('[data-delete]').forEach(el => el.classList.toggle('hidden', !canDeleteInstitution));
  if (locationPicker) locationPicker.refresh();
}

function populateTypes() {
  const options = ['<option value="">Select type</option>'].concat(institutionTypes.map(t => `<option value="${escapeHtml(t.type_name)}">${escapeHtml(t.type_name)}</option>`));
  institutionTypeSelect.innerHTML = options.join('');
  typeFilter.innerHTML = '<option value="">All types</option>' + institutionTypes.map(t => `<option value="${escapeHtml(t.type_name)}">${escapeHtml(t.type_name)}</option>`).join('');
}

async function loadTypes() {
  try {
    const data = await json('/api/institutions/types');
    institutionTypes = data.types || [];
  } catch (error) {
    institutionTypes = [];
    showStatus(error.message || 'Unable to load institution types.', true);
  }
  populateTypes();
}

function buildQuery() {
  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  if (search) params.set('search', search);
  if (typeFilter.value) params.set('type', typeFilter.value);
  if (activeFilter.value) params.set('active', activeFilter.value);
  params.set('limit', '500');
  return params.toString();
}

async function loadInstitutions() {
  tableBody.innerHTML = '<tr><td colspan="6" class="krwmp-table-empty">Loading institutions...</td></tr>';
  try {
    const data = await json(`/api/institutions?${buildQuery()}`);
    institutions = data.institutions || [];
    if (currentPage > totalPages()) currentPage = totalPages();
    renderInstitutions();
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="6" class="krwmp-table-empty text-rose-300">${escapeHtml(error.message)}</td></tr>`;
  }
}

function totalPages() {
  return Math.max(1, Math.ceil(institutions.length / pageSize));
}

function visibleInstitutions() {
  const start = (currentPage - 1) * pageSize;
  return institutions.slice(start, start + pageSize);
}

function renderInstitutions() {
  tableBody.innerHTML = '';
  if (!institutions.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="krwmp-table-empty">No institutions found.</td></tr>';
    paginationBox.innerHTML = '';
    return;
  }

  visibleInstitutions().forEach(row => {
    const tr = document.createElement('tr');
    tr.className = '';
    const locationText = [row.dsd_name, row.gnd_name].filter(Boolean).join(' / ') || '-';
    const contactText = [row.contact_person, row.contact_phone, row.contact_email].filter(Boolean).join('<br>') || '-';
    tr.innerHTML = `
      <td><div class="font-bold text-slate-100">${escapeHtml(row.institution_name)}</div><div class="krwmp-status-label">${escapeHtml(row.institution_code || '-')}</div><div class="text-[10px] text-slate-600 mt-1">Updated ${formatDate(row.updated_at)}</div></td>
      <td class="text-slate-300">${escapeHtml(row.institution_type || '-')}</td>
      <td class="text-slate-300"><div>${escapeHtml(locationText)}</div><div class="krwmp-status-label">${row.latitude && row.longitude ? `${Number(row.latitude).toFixed(6)}, ${Number(row.longitude).toFixed(6)}` : 'No location'}</div></td>
      <td class="text-slate-300 text-xs">${contactText}</td>
      <td><span class="krwmp-badge ${row.active ? 'krwmp-badge-success' : 'krwmp-badge-neutral'}">${row.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
      <td class="text-right"><div class="krwmp-table-actions"><button data-view="${row.id}"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button><button data-edit="${row.id}"  class="krwmp-btn krwmp-btn-primary krwmp-btn-sm manage-action hidden">Edit</button><button data-delete="${row.id}"  class="krwmp-btn krwmp-btn-danger krwmp-btn-sm manage-action hidden">Deactivate</button></div></td>
    `;
    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => viewInstitution(btn.dataset.view)));
  tableBody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => editInstitution(btn.dataset.edit)));
  tableBody.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', () => deactivateInstitution(btn.dataset.delete)));
  renderPagination();
  applyPermissions();
}

function renderPagination() {
  paginationBox.innerHTML = `
    <nav class="krwmp-pagination" aria-label="Institution pagination">
      <span class="krwmp-pagination-meta">Showing ${visibleInstitutions().length} of ${institutions.length} institutions</span>
      <div class="krwmp-pagination-controls"><button id="prevPage"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${currentPage <= 1 ? 'opacity-50 pointer-events-none' : ''}">Previous</button><span>Page ${currentPage} of ${totalPages()}</span><button id="nextPage"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${currentPage >= totalPages() ? 'opacity-50 pointer-events-none' : ''}">Next</button></div>
    </nav>
  `;
  document.getElementById('prevPage')?.addEventListener('click', () => { currentPage -= 1; renderInstitutions(); });
  document.getElementById('nextPage')?.addEventListener('click', () => { currentPage += 1; renderInstitutions(); });
}

function validateForm() {
  const errors = [];
  const name = institutionForm.institution_name.value.trim();
  const code = institutionForm.institution_code.value.trim();
  const type = institutionForm.institution_type.value.trim();
  const email = institutionForm.contact_email.value.trim();
  const phone = institutionForm.contact_phone.value.trim();
  const website = institutionForm.website.value.trim();
  const address = institutionForm.address.value.trim();
  const lat = Number(institutionForm.latitude.value);
  const lng = Number(institutionForm.longitude.value);

  if (name.length < 3 || name.length > 255) errors.push('Institution name must be 3–255 characters.');
  if (code && !/^[A-Za-z0-9_-]{2,50}$/.test(code)) errors.push('Institution code must be 2–50 characters using letters, numbers, hyphen or underscore.');
  if (!type) errors.push('Institution type is required.');
  if (!address) errors.push('Address is required.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Contact email format is invalid.');
  if (phone && !/^[0-9+()\-\s]{7,30}$/.test(phone)) errors.push('Contact phone format is invalid.');
  if (website && !/^https?:\/\/.+/i.test(website)) errors.push('Website must start with http:// or https://.');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) errors.push('Please select a valid institution location on the map.');

  if (errors.length) {
    showStatus(errors.join(' '), true);
    return false;
  }
  return true;
}

function getFormPayload() {
  return {
    institution_name: institutionForm.institution_name.value.trim(),
    institution_code: institutionForm.institution_code.value.trim().toUpperCase() || null,
    institution_type: institutionForm.institution_type.value,
    contact_person: institutionForm.contact_person.value.trim() || null,
    contact_phone: institutionForm.contact_phone.value.trim() || null,
    contact_email: institutionForm.contact_email.value.trim() || null,
    website: institutionForm.website.value.trim() || null,
    address: institutionForm.address.value.trim(),
    district: institutionForm.district.value.trim() || null,
    dsd_name: institutionForm.dsd_name.value.trim() || null,
    gnd_name: institutionForm.gnd_name.value.trim() || null,
    latitude: institutionForm.latitude.value,
    longitude: institutionForm.longitude.value,
    description: institutionForm.description.value.trim() || null,
    active: institutionForm.active.checked,
  };
}

function resetForm() {
  institutionForm.reset();
  institutionForm.id.value = '';
  institutionForm.active.checked = true;
  updateLocationDisplay(null);
  if (locationPicker) locationPicker.clear();
}

function setLocationValues(row) {
  institutionForm.latitude.value = row?.latitude || '';
  institutionForm.longitude.value = row?.longitude || '';
  institutionForm.dsd_name.value = row?.dsd_name || '';
  institutionForm.gnd_name.value = row?.gnd_name || '';
  institutionForm.district.value = row?.district || '';
  updateLocationDisplay(row);
  if (locationPicker && row?.latitude && row?.longitude) {
    locationPicker.setLocation(row.latitude, row.longitude, true);
  }
}

function updateLocationDisplay(point) {
  document.getElementById('latText').textContent = point?.latitude ? Number(point.latitude).toFixed(7) : 'Not selected';
  document.getElementById('lngText').textContent = point?.longitude ? Number(point.longitude).toFixed(7) : 'Not selected';
  document.getElementById('dsdText').textContent = point?.dsd_name || 'Not detected';
  document.getElementById('gndText').textContent = point?.gnd_name || 'Not detected';
}

async function identifySelectedLocation(point) {
  if (!point || point.cleared) {
    institutionForm.latitude.value = '';
    institutionForm.longitude.value = '';
    institutionForm.dsd_name.value = '';
    institutionForm.gnd_name.value = '';
    institutionForm.district.value = '';
    updateLocationDisplay(null);
    return;
  }

  institutionForm.latitude.value = point.latitude;
  institutionForm.longitude.value = point.longitude;
  let displayPoint = { latitude: point.latitude, longitude: point.longitude };

  try {
    const data = await json(`/api/spatial/identify?lat=${encodeURIComponent(point.latitude)}&lng=${encodeURIComponent(point.longitude)}`);
    institutionForm.dsd_name.value = data.dsd?.dsd_name || '';
    institutionForm.gnd_name.value = data.gnd?.gnd_name || '';
    institutionForm.district.value = data.dsd?.iddistrict || '';
    displayPoint = { ...displayPoint, dsd_name: data.dsd?.dsd_name || '', gnd_name: data.gnd?.gnd_name || '' };
    updateLocationDisplay(displayPoint);
    showStatus(data.dsd || data.gnd ? 'Location selected and administrative boundaries detected.' : 'Location selected, but no matching DSD/GND boundary was detected.', !(data.dsd || data.gnd));
  } catch (error) {
    updateLocationDisplay(displayPoint);
    showStatus(error.message || 'Unable to identify selected location.', true);
  }
}

function fillForm(row) {
  institutionForm.id.value = row.id || '';
  institutionForm.institution_name.value = row.institution_name || '';
  institutionForm.institution_code.value = row.institution_code || '';
  institutionForm.institution_type.value = row.institution_type || '';
  institutionForm.contact_person.value = row.contact_person || '';
  institutionForm.contact_phone.value = row.contact_phone || '';
  institutionForm.contact_email.value = row.contact_email || '';
  institutionForm.website.value = row.website || '';
  institutionForm.address.value = row.address || '';
  institutionForm.description.value = row.description || '';
  institutionForm.active.checked = row.active !== false;
  setLocationValues(row);
}

function editInstitution(id) {
  if (!canUpdateInstitution) return showStatus('You do not have update access for institutions.', true);
  const row = institutions.find(item => String(item.id) === String(id));
  if (!row) return;
  fillForm(row);
  writePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function viewInstitution(id) {
  const row = institutions.find(item => String(item.id) === String(id));
  if (!row) return;
  const details = [
    `Institution: ${row.institution_name}`,
    `Code: ${row.institution_code || '-'}`,
    `Type: ${row.institution_type || '-'}`,
    `Address: ${row.address || '-'}`,
    `DSD/GND: ${[row.dsd_name, row.gnd_name].filter(Boolean).join(' / ') || '-'}`,
    `Contact: ${[row.contact_person, row.contact_phone, row.contact_email].filter(Boolean).join(' | ') || '-'}`,
    `Location: ${row.latitude && row.longitude ? `${row.latitude}, ${row.longitude}` : '-'}`,
    `Description: ${row.description || '-'}`,
  ].join('\n');
  alert(details);
}

async function deactivateInstitution(id) {
  if (!canDeleteInstitution) return showStatus('You do not have delete access for institutions.', true);
  if (!confirm('Deactivate this institution? Existing linked records will remain unchanged.')) return;
  try {
    await json(`/api/institutions/${id}`, { method: 'DELETE' });
    showStatus('Institution deactivated successfully.');
    await loadInstitutions();
  } catch (error) {
    showStatus(error.message, true);
  }
}

institutionForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!validateForm()) return;

  const id = institutionForm.id.value;
  if (id && !canUpdateInstitution) return showStatus('You do not have update access for institutions.', true);
  if (!id && !canCreateInstitution) return showStatus('You do not have create access for institutions.', true);
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/institutions/${id}` : '/api/institutions';

  try {
    await json(url, { method, body: getFormPayload() });
    showStatus(id ? 'Institution updated successfully.' : 'Institution created successfully.');
    resetForm();
    await loadInstitutions();
  } catch (error) {
    showStatus(error.message, true);
  }
});

function debounce(fn, delay = 350) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function init() {
  if (window.KRWMP_ENGINE) {
    await window.KRWMP_ENGINE.initSession();
    if (!window.KRWMP_ENGINE.requireAuthenticatedSession()) return;
  }
  await initSidebar();
  await loadTypes();
  await loadInstitutions();

  locationPicker = new KRWMPLocationPicker({
    containerId: 'institutionLocationPicker',
    latitudeInput: '[name="latitude"]',
    longitudeInput: '[name="longitude"]',
    initialCenter: [80.2280810, 7.2334995],
    initialZoom: 10,
    onChange: identifySelectedLocation,
  });

  document.getElementById('refreshBtn')?.addEventListener('click', () => { currentPage = 1; loadInstitutions(); });
  document.getElementById('resetInstitutionBtn')?.addEventListener('click', resetForm);
  document.getElementById('cancelEditBtn')?.addEventListener('click', resetForm);
  searchInput.addEventListener('input', debounce(() => { currentPage = 1; loadInstitutions(); }));
  typeFilter.addEventListener('change', () => { currentPage = 1; loadInstitutions(); });
  activeFilter.addEventListener('change', () => { currentPage = 1; loadInstitutions(); });
  applyPermissions();
}

document.addEventListener('DOMContentLoaded', init);
