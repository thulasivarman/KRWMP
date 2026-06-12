const statusBox = document.getElementById('statusBox');
const form = document.getElementById('communityReportForm');
const categorySelect = document.getElementById('categorySelect');
const specificIssueSelect = document.getElementById('specificIssueSelect');
const solutionSelect = document.getElementById('solutionSelect');
const issueTitleInput = document.getElementById('issueTitleInput');
const latitudeInput = document.getElementById('latitudeInput');
const longitudeInput = document.getElementById('longitudeInput');
const dsdNameInput = document.getElementById('dsdNameInput');
const gndNameInput = document.getElementById('gndNameInput');
const subWatershedIdInput = document.getElementById('subWatershedIdInput');
const subWatershedNameInput = document.getElementById('subWatershedNameInput');
const latDisplay = document.getElementById('latDisplay');
const lngDisplay = document.getElementById('lngDisplay');
const adminBoundaryDisplay = document.getElementById('adminBoundaryDisplay');
const subWatershedDisplay = document.getElementById('subWatershedDisplay');

let currentSpecificIssues = [];
let currentSolutions = [];
let locationPicker = null;

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('krwmp_user') || 'null') || {};
  } catch (error) {
    return {};
  }
}

function requestHeaders(extra = {}) {
  const user = currentUser();
  return {
    ...extra,
    'X-KRWMP-User': user.identifier || user.username || user.name || 'public',
    'X-KRWMP-Role': user.role_name || user.role || '',
  };
}

async function initializeCommunityReportSidebar() {
  if (window.KRWMP_ENGINE) {
    await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  }
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

function showStatus(message, error = false) {
  statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`;
  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
}

async function json(url, options = {}) {
  options.headers = requestHeaders(options.headers || {});
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

function resetSelect(select, placeholder, disabled = true) {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  select.disabled = disabled;
}

async function loadCategories() {
  const data = await json('/api/issue-categories');
  categorySelect.innerHTML = '<option value="">Select issue category</option>';
  (data.categories || []).forEach(category => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.category_name;
    categorySelect.appendChild(option);
  });
}

async function loadSpecificIssues(categoryId) {
  currentSpecificIssues = [];
  resetSelect(specificIssueSelect, 'Loading specific issues...', true);
  resetSelect(solutionSelect, 'Select issue first', true);
  issueTitleInput.value = '';
  if (!categoryId) {
    resetSelect(specificIssueSelect, 'Select category first', true);
    return;
  }

  const data = await json(`/api/specific-issues?category_id=${encodeURIComponent(categoryId)}`);
  currentSpecificIssues = data.issues || [];
  resetSelect(specificIssueSelect, currentSpecificIssues.length ? 'Select specific issue' : 'No active issues for this category', !currentSpecificIssues.length);
  currentSpecificIssues.forEach(issue => {
    const option = document.createElement('option');
    option.value = issue.id;
    option.textContent = issue.issue_name;
    specificIssueSelect.appendChild(option);
  });
}

async function loadApplicableSolutions(categoryId, issueId) {
  currentSolutions = [];
  resetSelect(solutionSelect, 'Loading applicable solutions...', true);
  if (!categoryId || !issueId) {
    resetSelect(solutionSelect, 'Select issue first', true);
    return;
  }

  const url = `/api/solutions?category_id=${encodeURIComponent(categoryId)}&issue_id=${encodeURIComponent(issueId)}`;
  const data = await json(url);
  currentSolutions = data.solutions || [];
  resetSelect(solutionSelect, currentSolutions.length ? 'Select applicable solution' : 'No predefined solution found', !currentSolutions.length);
  currentSolutions.forEach(solution => {
    const option = document.createElement('option');
    option.value = solution.id;
    option.textContent = solution.solution_title;
    option.dataset.description = solution.solution_description || '';
    solutionSelect.appendChild(option);
  });
}

function syncIssueTitle() {
  const selected = currentSpecificIssues.find(issue => String(issue.id) === String(specificIssueSelect.value));
  if (selected) issueTitleInput.value = selected.issue_name;
}

function resetDetectedLocation() {
  dsdNameInput.value = '';
  gndNameInput.value = '';
  subWatershedIdInput.value = '';
  subWatershedNameInput.value = '';
  latDisplay.textContent = 'Not selected';
  lngDisplay.textContent = 'Not selected';
  adminBoundaryDisplay.textContent = 'Pending location';
  subWatershedDisplay.textContent = 'Pending location';
}

async function identifySelectedLocation({ latitude, longitude, cleared = false } = {}) {
  if (cleared || latitude === null || longitude === null) {
    resetDetectedLocation();
    return;
  }

  latDisplay.textContent = Number(latitude).toFixed(7);
  lngDisplay.textContent = Number(longitude).toFixed(7);
  adminBoundaryDisplay.textContent = 'Detecting...';
  subWatershedDisplay.textContent = 'Detecting...';

  try {
    const data = await json(`/api/spatial/identify?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
    const dsdName = data.dsd?.dsd_name || '';
    const gndName = data.gnd?.gnd_name || '';
    const subName = data.sub_watershed?.watershed_name || data.sub_watershed?.name || '';

    dsdNameInput.value = dsdName;
    gndNameInput.value = gndName;
    subWatershedIdInput.value = data.sub_watershed?.id || '';
    subWatershedNameInput.value = subName;

    adminBoundaryDisplay.textContent = dsdName || gndName ? `${dsdName || 'Unknown DSD'} / ${gndName || 'Unknown GND'}` : 'Outside mapped DSD/GND';
    subWatershedDisplay.textContent = subName || 'Outside mapped sub-watershed';
  } catch (error) {
    dsdNameInput.value = '';
    gndNameInput.value = '';
    subWatershedIdInput.value = '';
    subWatershedNameInput.value = '';
    adminBoundaryDisplay.textContent = 'Unable to detect';
    subWatershedDisplay.textContent = 'Unable to detect';
    showStatus(error.message || 'Unable to identify selected location.', true);
  }
}

function initializeLocationPicker() {
  if (!window.KRWMPLocationPicker) {
    showStatus('Location picker module is not available.', true);
    return;
  }
  locationPicker = new window.KRWMPLocationPicker({
    containerId: 'communityLocationPicker',
    latitudeInput: '#latitudeInput',
    longitudeInput: '#longitudeInput',
    initialCenter: [80.2280810, 7.2334995],
    initialZoom: 11,
    onChange: identifySelectedLocation,
  });
}

function buildJsonPayload() {
  const formData = new FormData(form);
  const payload = {};
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) continue;
    payload[key] = value === '' ? null : value;
  }
  return payload;
}

function getSelectedPhoto() {
  const input = form.querySelector('input[name="photo"]');
  const file = input?.files?.[0] || null;
  return file && file.size > 0 ? file : null;
}

async function submitCommunityReport() {
  const selectedPhoto = getSelectedPhoto();
  if (!selectedPhoto) {
    return json('/api/community-reports', {
      method: 'POST',
      headers: requestHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(buildJsonPayload()),
    });
  }

  return json('/api/community-reports', {
    method: 'POST',
    body: new FormData(form),
  });
}

categorySelect.addEventListener('change', async () => {
  try {
    await loadSpecificIssues(categorySelect.value);
  } catch (error) {
    showStatus(error.message || 'Unable to load specific issues.', true);
  }
});

specificIssueSelect.addEventListener('change', async () => {
  try {
    syncIssueTitle();
    await loadApplicableSolutions(categorySelect.value, specificIssueSelect.value);
  } catch (error) {
    showStatus(error.message || 'Unable to load applicable solutions.', true);
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!latitudeInput.value || !longitudeInput.value) {
    showStatus('Please select the issue location on the map before submission.', true);
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
  }

  try {
    const data = await submitCommunityReport();
    form.reset();
    resetDetectedLocation();
    resetSelect(specificIssueSelect, 'Select category first', true);
    resetSelect(solutionSelect, 'Select issue first', true);
    if (locationPicker) locationPicker.clear();
    await loadCategories();
    showStatus(`Issue submitted successfully. Reference: ${data.report.report_code}`);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Issue Report';
    }
  }
});

(async () => {
  await initializeCommunityReportSidebar();
  await loadCategories();
  initializeLocationPicker();
})().catch(error => showStatus(error.message || 'Unable to initialize community report form.', true));
