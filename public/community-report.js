const statusBox = document.getElementById('statusBox');
const form = document.getElementById('communityReportForm');
const categorySelect = document.getElementById('categorySelect');
const specificIssueSelect = document.getElementById('specificIssueSelect');
const solutionSelect = document.getElementById('solutionSelect');
const otherCategoryLabel = document.getElementById('otherCategoryLabel');
const otherCategoryInput = document.getElementById('otherCategoryInput');
const otherIssueLabel = document.getElementById('otherIssueLabel');
const otherIssueInput = document.getElementById('otherIssueInput');
const issueTitleInput = document.getElementById('issueTitleInput');
const reporterNameInput = document.getElementById('reporterNameInput');
const reporterContactInput = document.getElementById('reporterContactInput');
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
const photoEvidenceInput = document.getElementById('photoEvidenceInput');
const photoPreviewGrid = document.getElementById('photoPreviewGrid');
const photoCountLabel = document.getElementById('photoCountLabel');

const OTHER_VALUE = '__other__';
const KELANI_CENTER = [80.2280810, 7.2334995];
const KELANI_ZOOM = 10;
const MAX_PHOTOS = 5;
const ALLOWED_PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

let currentSpecificIssues = [];
let currentSolutions = [];
let locationPicker = null;
let selectedPhotos = [];

function currentUser() {
  try { return JSON.parse(localStorage.getItem('krwmp_user') || 'null') || {}; }
  catch (error) { return {}; }
}

const { apiRequest: json } = window.KRWMP_UTILS;

async function initializeCommunityReportSidebar() {
  if (!window.KRWMP_ENGINE) return;
  await window.KRWMP_ENGINE.initSession();
  if (!window.KRWMP_ENGINE.Session.isAuthenticated) return;
  await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

function showStatus(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

function resetSelect(select, placeholder, disabled = true) { select.innerHTML = `<option value="">${placeholder}</option>`; select.disabled = disabled; }
function addOtherOption(select) { const option = document.createElement('option'); option.value = OTHER_VALUE; option.textContent = 'Other'; select.appendChild(option); }
async function loadCategories() { const data = await json('/api/issue-categories'); categorySelect.innerHTML = '<option value="">Select issue category</option>'; (data.categories || []).forEach(category => { const option = document.createElement('option'); option.value = category.id; option.textContent = category.category_name; categorySelect.appendChild(option); }); addOtherOption(categorySelect); }
async function loadSpecificIssues(categoryId) { currentSpecificIssues = []; resetSelect(specificIssueSelect, 'Loading specific issues...', true); resetSelect(solutionSelect, 'No applicable solution selected', true); issueTitleInput.value = ''; if (!categoryId) { resetSelect(specificIssueSelect, 'Select category first', true); return; } if (categoryId === OTHER_VALUE) { resetSelect(specificIssueSelect, 'Other', false); specificIssueSelect.innerHTML = `<option value="${OTHER_VALUE}" selected>Other</option>`; toggleOtherFields(); return; } const data = await json(`/api/specific-issues?category_id=${encodeURIComponent(categoryId)}`); currentSpecificIssues = data.issues || []; resetSelect(specificIssueSelect, currentSpecificIssues.length ? 'Select specific issue' : 'No active issues for this category', false); currentSpecificIssues.forEach(issue => { const option = document.createElement('option'); option.value = issue.id; option.textContent = issue.issue_name; specificIssueSelect.appendChild(option); }); addOtherOption(specificIssueSelect); }
async function loadApplicableSolutions(categoryId, issueId) { currentSolutions = []; resetSelect(solutionSelect, 'No applicable solution selected', true); if (!categoryId || !issueId || categoryId === OTHER_VALUE || issueId === OTHER_VALUE) return; const url = `/api/solutions?category_id=${encodeURIComponent(categoryId)}&issue_id=${encodeURIComponent(issueId)}`; const data = await json(url); currentSolutions = data.solutions || []; resetSelect(solutionSelect, currentSolutions.length ? 'No applicable solution selected' : 'No predefined solution found', !currentSolutions.length); currentSolutions.forEach(solution => { const option = document.createElement('option'); option.value = solution.id; option.textContent = solution.solution_title; option.dataset.description = solution.solution_description || ''; solutionSelect.appendChild(option); }); }
function toggleOtherFields() { const isOtherCategory = categorySelect.value === OTHER_VALUE; const isOtherIssue = specificIssueSelect.value === OTHER_VALUE; otherCategoryLabel.classList.toggle('hidden', !isOtherCategory); otherIssueLabel.classList.toggle('hidden', !(isOtherCategory || isOtherIssue)); otherCategoryInput.required = isOtherCategory; otherIssueInput.required = isOtherCategory || isOtherIssue; if (!isOtherCategory) otherCategoryInput.value = ''; if (!(isOtherCategory || isOtherIssue)) otherIssueInput.value = ''; }
function syncIssueTitle() { if (categorySelect.value === OTHER_VALUE || specificIssueSelect.value === OTHER_VALUE) { const title = otherIssueInput.value.trim() || otherCategoryInput.value.trim(); if (title) issueTitleInput.value = title; return; } const selected = currentSpecificIssues.find(issue => String(issue.id) === String(specificIssueSelect.value)); if (selected) issueTitleInput.value = selected.issue_name; }
function prefillReporterFromSession() { const user = currentUser(); const displayName = user.name || user.full_name || user.username || user.identifier || ''; const contact = user.contact_number || user.phone || user.mobile || user.telephone || ''; if (displayName && !reporterNameInput.value) reporterNameInput.value = displayName; if (contact && !reporterContactInput.value) reporterContactInput.value = contact; }
function normalizePhone(value) { return String(value || '').replace(/[\s()-]/g, ''); }
function isValidPhone(value) { const raw = String(value || '').trim(); if (!raw) return true; return /^\+?\d{7,15}$/.test(normalizePhone(raw)); }
function resetDetectedLocation() { dsdNameInput.value = ''; gndNameInput.value = ''; subWatershedIdInput.value = ''; subWatershedNameInput.value = ''; latDisplay.textContent = 'Not selected'; lngDisplay.textContent = 'Not selected'; adminBoundaryDisplay.textContent = 'Pending location'; subWatershedDisplay.textContent = 'Pending location'; }
async function identifySelectedLocation({ latitude, longitude, cleared = false } = {}) { if (cleared || latitude === null || longitude === null) { resetDetectedLocation(); return; } latDisplay.textContent = Number(latitude).toFixed(7); lngDisplay.textContent = Number(longitude).toFixed(7); adminBoundaryDisplay.textContent = 'Detecting...'; subWatershedDisplay.textContent = 'Detecting...'; try { const data = await json(`/api/spatial/identify?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`); const dsdName = data.dsd?.dsd_name || ''; const gndName = data.gnd?.gnd_name || ''; const subName = data.sub_watershed?.watershed_name || data.sub_watershed?.name || ''; dsdNameInput.value = dsdName; gndNameInput.value = gndName; subWatershedIdInput.value = data.sub_watershed?.id || ''; subWatershedNameInput.value = subName; adminBoundaryDisplay.textContent = dsdName || gndName ? `${dsdName || 'Unknown DSD'} / ${gndName || 'Unknown GND'}` : 'Outside mapped DSD/GND'; subWatershedDisplay.textContent = subName || 'Outside mapped sub-watershed'; } catch (error) { dsdNameInput.value = ''; gndNameInput.value = ''; subWatershedIdInput.value = ''; subWatershedNameInput.value = ''; adminBoundaryDisplay.textContent = 'Unable to detect'; subWatershedDisplay.textContent = 'Unable to detect'; showStatus(error.message || 'Unable to identify selected location.', true); } }
function initializeLocationPicker() { if (!window.KRWMPLocationPicker) { showStatus('Location picker module is not available.', true); return; } locationPicker = new window.KRWMPLocationPicker({ containerId: 'communityLocationPicker', latitudeInput: '#latitudeInput', longitudeInput: '#longitudeInput', initialCenter: KELANI_CENTER, initialZoom: KELANI_ZOOM, onChange: identifySelectedLocation }); setTimeout(() => { if (locationPicker?.map) { locationPicker.map.jumpTo({ center: KELANI_CENTER, zoom: KELANI_ZOOM }); locationPicker.map.resize(); } }, 500); }
function buildJsonPayload() { const formData = new FormData(form); const payload = {}; for (const [key, value] of formData.entries()) { if (value instanceof File) continue; payload[key] = value === '' ? null : value; } normalizeOtherPayload(payload); return payload; }
function normalizeOtherPayload(payload) { const isOtherCategory = payload.category_id === OTHER_VALUE; const isOtherIssue = payload.issue_id === OTHER_VALUE; if (isOtherCategory) payload.category_id = null; if (isOtherIssue || isOtherCategory) payload.issue_id = null; if (!payload.assigned_solution_id || payload.assigned_solution_id === OTHER_VALUE) payload.assigned_solution_id = null; if ((isOtherCategory || isOtherIssue) && payload.other_issue_name && !payload.issue_title) payload.issue_title = payload.other_issue_name; }
function validPhoto(file) { return file && file.size > 0 && ALLOWED_PHOTO_TYPES.has(file.type); }
function revokePhotoUrls() { selectedPhotos.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); }); }
function renderPhotoPreviews() {
  if (photoCountLabel) photoCountLabel.textContent = `${selectedPhotos.length} / ${MAX_PHOTOS}`;
  if (!photoPreviewGrid) return;
  if (!selectedPhotos.length) {
    photoPreviewGrid.innerHTML = '<div class="rounded border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-500 sm:col-span-2 lg:col-span-3">No images selected.</div>';
    return;
  }
  photoPreviewGrid.innerHTML = selectedPhotos.map((item, index) => `
    <div class="overflow-hidden rounded border border-slate-800 bg-slate-950/50" data-photo-index="${index}">
      <div class="aspect-video bg-slate-900">
        <img src="${window.KRWMP_UTILS.escapeAttribute(item.previewUrl)}" alt="" class="h-full w-full object-cover">
      </div>
      <div class="space-y-2 p-3">
        <div class="truncate text-xs font-semibold text-slate-200">${window.KRWMP_UTILS.escapeHtml(item.file.name)}</div>
        <div class="h-1.5 overflow-hidden rounded bg-slate-800">
          <div data-photo-progress class="h-full w-0 rounded bg-emerald-500 transition-all"></div>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span data-photo-status class="text-[10px] font-normal text-slate-500">Ready</span>
          <button type="button" data-remove-photo="${index}"  class="krwmp-btn krwmp-btn-danger krwmp-btn-sm border border-rose-900/40 bg-rose-950/30 text-[10px] text-rose-300 hover:bg-rose-900/50">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}
function setPhotoProgress(index, percent, status = '') {
  const card = photoPreviewGrid?.querySelector(`[data-photo-index="${index}"]`);
  const bar = card?.querySelector('[data-photo-progress]');
  const label = card?.querySelector('[data-photo-status]');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
  if (label && status) label.textContent = status;
}
function addSelectedPhotos(files = []) {
  const accepted = [];
  for (const file of files) {
    if (!validPhoto(file)) {
      showStatus('Only JPG, PNG and WEBP images can be attached.', true);
      continue;
    }
    if (selectedPhotos.length + accepted.length >= MAX_PHOTOS) {
      showStatus(`Only ${MAX_PHOTOS} images can be attached.`, true);
      break;
    }
    accepted.push({ file, previewUrl: URL.createObjectURL(file) });
  }
  selectedPhotos = selectedPhotos.concat(accepted);
  renderPhotoPreviews();
  if (photoEvidenceInput) photoEvidenceInput.value = '';
}
async function uploadReportPhotos(report) {
  if (!selectedPhotos.length) return [];
  if (!window.KRWMP_FILE_ATTACHMENTS?.uploadAttachment) throw new Error('Attachment upload library is not available.');
  const uploaded = [];
  for (let index = 0; index < selectedPhotos.length; index += 1) {
    const item = selectedPhotos[index];
    setPhotoProgress(index, 1, 'Preparing');
    const result = await window.KRWMP_FILE_ATTACHMENTS.uploadAttachment(item.file, {
      moduleKey: 'community_issues',
      recordId: report.id,
      recordKind: 'community_issue_report',
      attachmentRole: 'report_photo',
      visibility: 'private',
      metadata: { report_code: report.report_code },
      onProgress: percent => setPhotoProgress(index, percent, `Uploading ${percent}%`),
    });
    uploaded.push(result.attachment);
    setPhotoProgress(index, 100, 'Uploaded');
  }
  return uploaded;
}
async function submitCommunityReport() { return json('/api/community-reports', { method: 'POST', body: buildJsonPayload() }); }
categorySelect.addEventListener('change', async () => { try { toggleOtherFields(); await loadSpecificIssues(categorySelect.value); toggleOtherFields(); } catch (error) { showStatus(error.message || 'Unable to load specific issues.', true); } });
specificIssueSelect.addEventListener('change', async () => { try { toggleOtherFields(); syncIssueTitle(); await loadApplicableSolutions(categorySelect.value, specificIssueSelect.value); } catch (error) { showStatus(error.message || 'Unable to load applicable solutions.', true); } });
otherCategoryInput.addEventListener('input', syncIssueTitle); otherIssueInput.addEventListener('input', syncIssueTitle); reporterContactInput.addEventListener('input', () => reporterContactInput.setCustomValidity(''));
photoEvidenceInput?.addEventListener('change', event => addSelectedPhotos(Array.from(event.target.files || [])));
photoPreviewGrid?.addEventListener('click', event => {
  const button = event.target.closest('[data-remove-photo]');
  if (!button) return;
  const index = Number(button.dataset.removePhoto);
  const [removed] = selectedPhotos.splice(index, 1);
  if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
  renderPhotoPreviews();
});
form.addEventListener('submit', async event => { event.preventDefault(); syncIssueTitle(); if (!isValidPhone(reporterContactInput.value)) { reporterContactInput.setCustomValidity('Please enter a valid phone number with 7 to 15 digits.'); reporterContactInput.reportValidity(); return; } if (!form.reportValidity()) return; if (!latitudeInput.value || !longitudeInput.value) { showStatus('Please select the issue location on the map before submission.', true); return; } const submitButton = form.querySelector('button[type="submit"]'); if (submitButton) { submitButton.disabled = true; submitButton.textContent = selectedPhotos.length ? 'Submitting and uploading...' : 'Submitting...'; } try { const data = await submitCommunityReport(); await uploadReportPhotos(data.report); form.reset(); revokePhotoUrls(); selectedPhotos = []; renderPhotoPreviews(); resetDetectedLocation(); resetSelect(specificIssueSelect, 'Select category first', true); resetSelect(solutionSelect, 'No applicable solution selected', true); if (locationPicker) locationPicker.clear(); await loadCategories(); prefillReporterFromSession(); showStatus(`Issue submitted successfully. Reference: ${data.report.report_code}`); } catch (error) { showStatus(error.message, true); } finally { if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit Issue Report'; } } });
(async () => { await initializeCommunityReportSidebar(); await loadCategories(); prefillReporterFromSession(); initializeLocationPicker(); renderPhotoPreviews(); })().catch(error => showStatus(error.message || 'Unable to initialize community report form.', true));
