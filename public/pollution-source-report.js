const { apiRequest: api, escapeHtml: esc } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const form = document.getElementById('pollutionSourceForm');
const sourceTypeSelect = document.getElementById('sourceTypeSelect');
const locationInfo = document.getElementById('locationInfo');
const sourceContactPersonId = document.getElementById('sourceContactPersonId');
const contactPersonName = document.getElementById('contactPersonName');
const contactPersonPhone = document.getElementById('contactPersonPhone');
const contactPersonEmail = document.getElementById('contactPersonEmail');
const contactSearchResults = document.getElementById('contactSearchResults');
const selectedContactSummary = document.getElementById('selectedContactSummary');
const sourceEvidenceInput = document.getElementById('sourceEvidenceInput');
const sourceEvidenceStatus = document.getElementById('sourceEvidenceStatus');
let picker = null;
let contactMatches = [];

function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
function clean(value) { return String(value ?? '').trim(); }
function openList() { window.location.href = '/pollution-sources.html'; }
function normalizeSourceStatus(value) {
  const status = clean(value).toLowerCase();
  if (status === 'closed') return 'closed';
  return 'active';
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('pollution_sources_management', 'create');
}

async function loadSourceTypes() {
  const data = await api('/api/pollution-sources/lookups/source-types');
  const rows = data.source_types || [];
  sourceTypeSelect.innerHTML = '<option value="">Select source type</option>' + rows.map(row => `<option value="${esc(row.id)}">${esc(row.type_name || row.source_type_name || row.name || 'Unnamed Type')}</option>`).join('');
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

function renderSelectedContact(person = null) {
  if (!person) {
    selectedContactSummary.className = 'krwmp-empty-state py-3';
    selectedContactSummary.textContent = 'No source contact linked yet. Enter details below if the person is not available.';
    return;
  }
  selectedContactSummary.className = 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3';
  selectedContactSummary.innerHTML = `<strong class="text-emerald-200">${esc(person.full_name || '-')}</strong><div class="form-helper mt-1">${esc(person.phone_number || '-')} | ${esc(person.email || '-')}</div>`;
}

function selectContact(person) {
  sourceContactPersonId.value = person?.id || '';
  contactPersonName.value = person?.full_name || '';
  contactPersonPhone.value = person?.phone_number || '';
  contactPersonEmail.value = person?.email || '';
  renderSelectedContact(person);
  contactSearchResults.innerHTML = '';
}

function renderContactMatches(rows = []) {
  contactMatches = rows;
  if (!rows.length) {
    contactSearchResults.innerHTML = '<div class="krwmp-empty-state">No existing contact found. Enter details below to create a new master person record.</div>';
    return;
  }
  contactSearchResults.innerHTML = rows.map(row => `
    <div class="krwmp-card p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <strong class="text-sm text-slate-100">${esc(row.full_name || '-')}</strong>
        <div class="form-helper mt-1">${esc(row.phone_number || '-')} | ${esc(row.email || '-')}</div>
      </div>
      <button type="button" data-select-contact="${esc(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Select</button>
    </div>`).join('');
}

async function searchContact() {
  const q = clean(contactPersonName.value || contactPersonPhone.value || contactPersonEmail.value);
  if (q.length < 3) return show('Enter at least 3 characters in contact name, phone or email before searching.', true);
  const data = await api(`/api/public/persons/search?q=${encodeURIComponent(q)}&limit=10`);
  renderContactMatches(data.persons || []);
}

async function uploadSourceFiles(source) {
  const files = Array.from(sourceEvidenceInput.files || []);
  if (!files.length || !window.KRWMP_FILE_ATTACHMENTS?.uploadAttachment) return;
  for (let i = 0; i < files.length; i += 1) {
    sourceEvidenceStatus.textContent = `Uploading evidence file ${i + 1} of ${files.length}...`;
    await window.KRWMP_FILE_ATTACHMENTS.uploadAttachment(files[i], {
      moduleKey: 'pollution_sources',
      recordId: source.id,
      recordKind: 'pollution_source_report',
      attachmentRole: 'source_evidence',
      visibility: 'private',
      metadata: { source_code: source.source_code },
    });
  }
  sourceEvidenceStatus.textContent = 'Evidence files uploaded.';
}

async function saveSource(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  body.status = normalizeSourceStatus(body.status);
  if (!body.latitude || !body.longitude) return show('Please select the pollution source location.', true);
  try {
    const response = await api('/api/pollution-sources', { method: 'POST', body });
    await uploadSourceFiles(response.source);
    show(response.message || 'Pollution source saved.');
    setTimeout(openList, 900);
  } catch (error) { show(error.message, true); }
}

function bindEvents() {
  document.getElementById('searchContactBtn')?.addEventListener('click', searchContact);
  contactSearchResults.addEventListener('click', event => {
    const button = event.target.closest('[data-select-contact]');
    if (!button) return;
    const person = contactMatches.find(row => String(row.id) === String(button.dataset.selectContact));
    if (person) selectContact(person);
  });
  [contactPersonName, contactPersonPhone, contactPersonEmail].forEach(input => input.addEventListener('input', () => {
    if (sourceContactPersonId.value) {
      sourceContactPersonId.value = '';
      renderSelectedContact(null);
    }
  }));
  form.addEventListener('submit', saveSource);
}

(async () => {
  await initSidebar();
  await loadSourceTypes();
  initLocationPicker();
  bindEvents();
})().catch(error => show(error.message, true));
