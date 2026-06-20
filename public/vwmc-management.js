let canCreate = false;
let canUpdate = false;
let canDelete = false;

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const committeeForm = document.getElementById('committeeForm');
const memberForm = document.getElementById('memberForm');
const memberModalMessage = document.getElementById('memberModalMessage');
const memberModalList = document.getElementById('memberModalList');
const memberPersonSelectorContainer = document.getElementById('memberPersonSelector');
const committeeList = document.getElementById('committeeList');
const dsdSelect = document.getElementById('vwmcDsdSelect');
const gndSelect = document.getElementById('vwmcGndSelect');
const authorizedGndsField = document.getElementById('authorizedGndsField');
const authorizedGndsSelect = document.getElementById('authorizedGndsSelect');
const committeeModal = document.getElementById('committeeModal');
const memberModal = document.getElementById('memberModal');
const viewModal = document.getElementById('committeeViewModal');
const viewContent = document.getElementById('committeeViewContent');

let committees = [];
let currentPage = 1;
let vwmcLocationPicker = null;
let viewMap = null;
let activeMemberCommitteeId = null;
let memberPersonSelector = null;
const pageSize = 5;

function showStatus(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

function showMemberStatus(message, error = false) {
  window.KRWMP_UTILS.showStatus(memberModalMessage, message, error);
}

function clearMemberStatus() {
  if (!memberModalMessage) return;
  memberModalMessage.textContent = '';
  memberModalMessage.className = 'hidden rounded-lg p-3 text-sm';
}

function clearMemberFieldErrors() {
  if (!memberForm) return;
  memberForm.querySelectorAll('.form-input, .form-select').forEach(field => {
    field.classList.remove('border-rose-400', 'focus:border-rose-300', 'focus:ring-rose-400/30');
    field.removeAttribute('aria-invalid');
  });
}

function markMemberFieldInvalid(fieldName) {
  const field = memberForm?.elements[fieldName];
  if (!field) return;
  field.classList.add('border-rose-400', 'focus:border-rose-300', 'focus:ring-rose-400/30');
  field.setAttribute('aria-invalid', 'true');
}

function memberDisplayName(member = {}) {
  return member.person_full_name || member.full_name || member.member_name || '-';
}

function memberPhone(member = {}) {
  return member.person_phone_number || member.phone || '-';
}

function memberEmail(member = {}) {
  return member.person_email || member.email || '-';
}

function memberLocation(member = {}) {
  return [member.person_gnd || member.gnd, member.person_dsd || member.dsd].filter(Boolean).join(', ') || '-';
}

function personProfileLink(personId, label = 'View Profile') {
  if (!personId) return '';
  return `<a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" href="/person-profile.html?id=${encodeURIComponent(personId)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

function personFromMember(member = {}) {
  if (!member?.person_id) return null;
  return {
    id: member.person_id,
    full_name: member.person_full_name || member.member_name,
    phone_number: member.person_phone_number || member.phone,
    email: member.person_email || member.email,
    dsd: member.person_dsd || member.dsd,
    gnd: member.person_gnd || member.gnd,
    nic_number: member.person_nic_number,
  };
}

function applySelectedPersonToMemberForm(person = null) {
  memberForm.person_id.value = person?.id || '';
  if (!person) return;
  memberForm.member_name.value = person.full_name || memberForm.member_name.value || '';
  memberForm.phone.value = person.phone_number || memberForm.phone.value || '';
  memberForm.email.value = person.email || memberForm.email.value || '';
}

function mountMemberPersonSelector(member = null) {
  if (!memberPersonSelectorContainer) {
    showMemberStatus('Person selector container is missing from the Add Member popup.', true);
    return;
  }
  if (!window.KRWMP_PERSON_SELECTOR) {
    showMemberStatus('Person selector script did not load. Refresh the page and try again.', true);
    memberPersonSelectorContainer.innerHTML = '<div class="krwmp-empty-state text-rose-300">Person selector is unavailable.</div>';
    return;
  }
  try {
    memberPersonSelector?.destroy?.();
    memberPersonSelector = window.KRWMP_PERSON_SELECTOR.mount({
      container: memberPersonSelectorContainer,
      valueInput: '#memberPersonId',
      label: 'Search or Create Person',
      helperText: 'Select a person from the registry or create a new person before saving this committee member.',
      allowCreate: true,
      selectedPerson: personFromMember(member),
      onSelect: applySelectedPersonToMemberForm,
      onCreate: applySelectedPersonToMemberForm,
    });
  } catch (error) {
    showMemberStatus(error.message || 'Unable to initialize the person selector.', true);
    memberPersonSelectorContainer.innerHTML = `<div class="krwmp-empty-state text-rose-300">${escapeHtml(error.message || 'Unable to initialize the person selector.')}</div>`;
  }
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('vwmc_view', 'view');
  canCreate = window.KRWMP_PRIVILEGES.can('vwmc_management', 'create');
  canUpdate = window.KRWMP_PRIVILEGES.can('vwmc_management', 'update');
  canDelete = window.KRWMP_PRIVILEGES.can('vwmc_management', 'delete');
  document.getElementById('addVwmcBtn')?.classList.toggle('hidden', !canCreate);
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

function totalPages() {
  return Math.max(1, Math.ceil(committees.length / pageSize));
}

function visibleCommittees() {
  const start = (currentPage - 1) * pageSize;
  return committees.slice(start, start + pageSize);
}

function setSelectValue(select, value) {
  const text = String(value || '').trim();
  if (!select) return;
  if (!text) {
    select.value = '';
    return;
  }
  let option = Array.from(select.options).find(o => o.value === text || o.textContent === text);
  if (!option) {
    option = document.createElement('option');
    option.value = text;
    option.textContent = text;
    select.appendChild(option);
  }
  select.value = option.value;
}

function selectAuthorizedGnds(values = []) {
  const selected = new Set(values.map(String));
  Array.from(authorizedGndsSelect.options).forEach(option => {
    option.selected = selected.has(String(option.value));
  });
}

function selectedAuthorizedGnds() {
  return Array.from(authorizedGndsSelect.selectedOptions).map(option => option.value);
}

function setAuthorizedGndsVisible(visible) {
  authorizedGndsField?.classList.toggle('hidden', !visible);
}

function parseAuthorizedGnds(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return value.split(',').map(gnd => ({ gnd_name: gnd.trim() })).filter(row => row.gnd_name);
    }
  }
  return [];
}

function normalizedAuthorizedGnds(c = {}) {
  const committee = c || {};
  return parseAuthorizedGnds(committee.authorized_gnds)
    .map(row => (typeof row === 'string' ? { gnd_name: row } : row))
    .filter(row => row?.gnd_name);
}

async function loadDsds(selected = '') {
  const data = await json('/api/vwmc/lookups/dsds');
  dsdSelect.innerHTML = '<option value="">Auto-detect from map</option>';
  (data.dsds || []).forEach(row => {
    const option = document.createElement('option');
    option.value = row.dsd_name;
    option.textContent = row.dsd_name;
    if (row.dsd_name === selected) option.selected = true;
    dsdSelect.appendChild(option);
  });
}

async function loadGnds(dsdName = '', selected = '', authorized = []) {
  authorizedGndsSelect.innerHTML = '';
  if (!dsdName) {
    gndSelect.innerHTML = '<option value="">Auto-detect from map</option>';
    setAuthorizedGndsVisible(false);
    return;
  }
  gndSelect.innerHTML = '<option value="">Loading GNDs...</option>';
  setAuthorizedGndsVisible(true);
  const url = dsdName ? `/api/vwmc/lookups/gnds?dsd_name=${encodeURIComponent(dsdName)}` : '/api/vwmc/lookups/gnds';
  const data = await json(url);
  gndSelect.innerHTML = '<option value="">Auto-detect from map</option>';
  (data.gnds || []).forEach(row => {
    const option = document.createElement('option');
    option.value = row.gnd_name;
    option.textContent = row.gnd_name;
    if (row.gnd_name === selected) option.selected = true;
    gndSelect.appendChild(option);

    const multi = document.createElement('option');
    multi.value = row.gnd_name;
    multi.textContent = row.gnd_name;
    multi.dataset.gndCode = row.gnd_code || '';
    authorizedGndsSelect.appendChild(multi);
  });
  selectAuthorizedGnds(Array.from(new Set([selected, ...authorized].filter(Boolean))));
}

async function identifySelectedLocation(point) {
  if (!point || point.cleared) {
    setSelectValue(dsdSelect, '');
    setSelectValue(gndSelect, '');
    committeeForm.sub_watershed_id.value = '';
    committeeForm.sub_watershed_name.value = '';
    document.getElementById('autoDsdText').textContent = 'Not detected';
    document.getElementById('autoGndText').textContent = 'Not detected';
    document.getElementById('autoSubText').textContent = 'Pending upload';
    selectAuthorizedGnds([]);
    setAuthorizedGndsVisible(false);
    return;
  }
  try {
    const data = await json(`/api/spatial/identify?lat=${encodeURIComponent(point.latitude)}&lng=${encodeURIComponent(point.longitude)}`);
    const dsdName = data.dsd?.dsd_name || '';
    const gndName = data.gnd?.gnd_name || '';
    if (dsdName) {
      await loadDsds(dsdName);
      await loadGnds(dsdName, gndName, [gndName]);
    } else {
      await loadGnds('');
    }
    setSelectValue(dsdSelect, dsdName);
    setSelectValue(gndSelect, gndName);
    committeeForm.sub_watershed_id.value = data.sub_watershed?.id || '';
    committeeForm.sub_watershed_name.value = data.sub_watershed?.watershed_name || data.sub_watershed?.name || '';
    document.getElementById('autoDsdText').textContent = dsdName || 'Not detected';
    document.getElementById('autoGndText').textContent = gndName || 'Not detected';
    document.getElementById('autoSubText').textContent = committeeForm.sub_watershed_name.value || 'Pending upload';
    showStatus(dsdName || gndName ? 'Administrative location detected from selected point.' : 'Location selected, but no matching boundary was detected.', !dsdName && !gndName);
  } catch (error) {
    showStatus(error.message || 'Unable to identify selected location.', true);
  }
}

function validateCommitteeForm() {
  const errors = [];
  const name = committeeForm.committee_name.value.trim();
  const village = committeeForm.village_name.value.trim();
  const lat = Number(committeeForm.latitude.value);
  const lng = Number(committeeForm.longitude.value);
  const namePattern = /^[A-Za-z0-9 .,&/()'-]+$/;
  if (name.length < 5 || name.length > 150) errors.push('VWMC Name must be 5-150 characters.');
  if (!namePattern.test(name)) errors.push('VWMC Name contains unsupported characters.');
  if (village.length < 3) errors.push('Village name is required and must be at least 3 characters.');
  if (!committeeForm.dsd_name.value) errors.push('Please select a map location inside a DSD.');
  if (!committeeForm.gnd_name.value) errors.push('Please select a map location inside a GND.');
  if (!selectedAuthorizedGnds().length) errors.push('Select at least one Authorized GND.');
  if (!Number.isFinite(lat) || lat < 5 || lat > 10) errors.push('Please select a valid latitude on the map.');
  if (!Number.isFinite(lng) || lng < 78 || lng > 82) errors.push('Please select a valid longitude on the map.');
  if (errors.length) {
    showStatus(errors.join(' '), true);
    return false;
  }
  return true;
}

function isValidSriLankanPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return true;
  return /^(?:07\d{8}|\+947\d{8}|0\d{2}\s?\d{3}\s?\d{4}|\+94\s?\d{2}\s?\d{3}\s?\d{4})$/.test(phone);
}

function validateMemberForm() {
  const errors = [];
  const name = memberForm.member_name.value.trim();
  const phone = memberForm.phone.value.trim();
  const email = memberForm.email.value.trim();
  const personId = memberForm.person_id.value.trim();
  const memberId = memberForm.member_id.value.trim();
  const committeeRoleValue = memberForm.role_in_committee.value.trim();
  clearMemberStatus();
  clearMemberFieldErrors();
  if (!personId) {
    errors.push('Select or create a person from the Master Person Registry.');
    memberPersonSelectorContainer?.querySelector('[data-person-search]')?.focus();
  }
  if (name.length < 3) {
    errors.push('Member name is required and must be at least 3 characters.');
    markMemberFieldInvalid('member_name');
  }
  if (!committeeRoleValue) {
    errors.push('Committee Role is required.');
    markMemberFieldInvalid('role_in_committee');
  }
  if (!isValidSriLankanPhone(phone)) {
    errors.push('Phone number is optional. If provided, use 07XXXXXXXX, +947XXXXXXXX, 0XX XXX XXXX, or +94 XX XXX XXXX.');
    markMemberFieldInvalid('phone');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push('Enter a valid email address.');
    markMemberFieldInvalid('email');
  }
  if (errors.length) {
    showMemberStatus(errors.join(' '), true);
    const firstInvalid = memberForm.querySelector('[aria-invalid="true"]');
    firstInvalid?.focus();
    return false;
  }
  return true;
}

async function loadCommittees() {
  committeeList.innerHTML = '<div class="krwmp-loading-state">Loading VWMC records...</div>';
  const data = await json('/api/vwmc/committees');
  committees = data.committees || [];
  if (currentPage > totalPages()) currentPage = totalPages();
  renderCommittees();
}

function renderCommittees() {
  committeeList.innerHTML = '';
  if (!committees.length) {
    committeeList.innerHTML = '<div class="krwmp-empty-state">No VWMC records found.</div>';
    return;
  }
  visibleCommittees().forEach(renderCommittee);
  renderPagination();
}

function authorizedGndBadges(c) {
  const gnds = normalizedAuthorizedGnds(c);
  if (!gnds.length) return '<span class="krwmp-badge krwmp-badge-warning">No authorized GNDs</span>';
  return gnds.slice(0, 4).map(row => `<span class="krwmp-badge krwmp-badge-info mr-1">${escapeHtml(row.gnd_name)}</span>`).join('')
    + (gnds.length > 4 ? `<span class="krwmp-badge krwmp-badge-info">+${gnds.length - 4}</span>` : '');
}

function committeeRole(member = {}) {
  return member?.committee_role || member?.role_in_committee || '-';
}

function renderCommittee(c) {
  const article = document.createElement('article');
  article.className = 'krwmp-card krwmp-stack-sm';
  const locationText = c.latitude && c.longitude ? `${Number(c.latitude).toFixed(6)}, ${Number(c.longitude).toFixed(6)}` : 'No location';
  article.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
      <div class="min-w-0">
        <h3 class="font-bold text-slate-100 truncate">${escapeHtml(c.committee_name)} (${escapeHtml(c.committee_code)})</h3>
        <p class="text-xs text-slate-500 mt-1">${escapeHtml(c.village_name || '-')} | ${escapeHtml(c.gnd_name || '-')} | ${escapeHtml(c.dsd_name || '-')} | Members: ${(c.members || []).length} | ${escapeHtml(c.status || '-')}</p>
        <p class="text-[10px] text-slate-600 mt-1">Location: ${escapeHtml(locationText)} | Updated by ${escapeHtml(c.updated_by || '-')} on ${formatDate(c.updated_at)}</p>
      </div>
      <div class="krwmp-table-actions">
        <button data-add-member="${c.id}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm ${canCreate ? '' : 'hidden'}">Add Member</button>
        <button data-view="${c.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View Committee</button>
        <button data-edit="${c.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${canUpdate ? '' : 'hidden'}">Edit</button>
        <button data-delete="${c.id}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDelete ? '' : 'hidden'}">Delete</button>
      </div>
    </div>
    <div class="text-xs">${authorizedGndBadges(c)}</div>
  `;
  committeeList.appendChild(article);
}

function renderMemberModalList(committee = null) {
  const members = committee?.members || [];
  if (!memberModalList) return;
  if (!members.length) {
    memberModalList.innerHTML = '<div class="krwmp-empty-state">No members recorded.</div>';
    return;
  }
  memberModalList.innerHTML = members.map(member => `
    <article class="krwmp-card p-3 text-sm">
      <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div class="min-w-0">
          <strong class="text-slate-100">${escapeHtml(memberDisplayName(member))}</strong>
          <div class="form-helper">Committee Role: ${escapeHtml(committeeRole(member))}</div>
          <div class="form-helper">Location: ${escapeHtml(memberLocation(member))}</div>
          <div class="form-helper">${escapeHtml(member.organization || '-')} | ${escapeHtml(member.designation || '-')}</div>
          <div class="form-helper">${escapeHtml(memberPhone(member))} | ${escapeHtml(memberEmail(member))}</div>
        </div>
        <div class="krwmp-table-actions">
          ${personProfileLink(member?.person_id)}
          <button type="button" data-modal-edit-member="${member.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${canUpdate ? '' : 'hidden'}">Edit</button>
          <button type="button" data-modal-delete-member="${member.id}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDelete ? '' : 'hidden'}">Delete</button>
        </div>
      </div>
    </article>
  `).join('');
}

function upsertCommittee(committee) {
  if (!committee?.id) return;
  const index = committees.findIndex(row => String(row.id) === String(committee.id));
  if (index >= 0) committees[index] = committee;
  else committees.unshift(committee);
}

async function refreshCommitteeMembers(committeeId) {
  if (!committeeId) return null;
  const data = await json(`/api/vwmc/committees/${committeeId}/details`);
  const committee = data.committee || null;
  if (!committee) return null;
  upsertCommittee(committee);
  renderMemberModalList(committee);
  renderCommittees();
  if (viewModal?.open && String(viewModal.dataset.committeeId || '') === String(committeeId)) {
    await openViewModal(committeeId, true);
  }
  return committee;
}

function renderPagination() {
  const total = totalPages();
  const pager = document.createElement('div');
  pager.className = 'krwmp-pagination';
  pager.innerHTML = `<span class="krwmp-pagination-meta">Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, committees.length)} of ${committees.length} VWMC records</span><div class="krwmp-pagination-controls"><button id="prevVwmcPage" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${total}</span><button id="nextVwmcPage" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentPage === total ? 'disabled' : ''}>Next</button></div>`;
  committeeList.appendChild(pager);
  pager.querySelector('#prevVwmcPage')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderCommittees(); });
  pager.querySelector('#nextVwmcPage')?.addEventListener('click', () => { currentPage = Math.min(total, currentPage + 1); renderCommittees(); });
}

async function openCommitteeModal(c = null) {
  committeeForm.reset();
  committeeForm.elements.id.value = c?.id || '';
  document.getElementById('committeeModalTitle').textContent = c ? 'Edit VWMC' : 'Add VWMC';
  const authorizedGnds = normalizedAuthorizedGnds(c).map(row => row.gnd_name);
  await loadDsds(c?.dsd_name || '');
  await loadGnds(c?.dsd_name || '', c?.gnd_name || '', authorizedGnds);
  if (c) {
    committeeForm.committee_name.value = c.committee_name || '';
    committeeForm.village_name.value = c.village_name || '';
    committeeForm.address.value = c.address || '';
    committeeForm.latitude.value = c.latitude || '';
    committeeForm.longitude.value = c.longitude || '';
    committeeForm.sub_watershed_id.value = c.sub_watershed_id || '';
    committeeForm.sub_watershed_name.value = c.sub_watershed_name || '';
    committeeForm.status.value = c.status || 'active';
    committeeForm.remarks.value = c.remarks || '';
    document.getElementById('autoDsdText').textContent = c.dsd_name || 'Not detected';
    document.getElementById('autoGndText').textContent = c.gnd_name || 'Not detected';
    document.getElementById('autoSubText').textContent = c.sub_watershed_name || 'Pending upload';
  }
  committeeModal.showModal();
  setTimeout(() => {
    vwmcLocationPicker?.refresh();
    if (c?.latitude && c?.longitude) vwmcLocationPicker?.setLocation(c.latitude, c.longitude, true);
  }, 150);
}

async function saveCommittee(event) {
  event.preventDefault();
  if (!validateCommitteeForm()) return;
  const body = Object.fromEntries(new FormData(committeeForm));
  const id = body.id;
  delete body.id;
  body.authorized_gnds = selectedAuthorizedGnds();
  if (id && !canUpdate) return showStatus('You do not have update access for VWMC records.', true);
  if (!id && !canCreate) return showStatus('You do not have create access for VWMC records.', true);
  try {
    await json(id ? `/api/vwmc/committees/${id}` : '/api/vwmc/committees', { method: id ? 'PUT' : 'POST', body });
    committeeModal.close();
    showStatus(id ? 'VWMC updated successfully.' : 'VWMC created successfully.');
    await loadCommittees();
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function openMemberModal(committeeId, member = null) {
  activeMemberCommitteeId = committeeId;
  memberForm.reset();
  clearMemberStatus();
  clearMemberFieldErrors();
  renderMemberModalList(committeeById(committeeId));
  memberForm.committee_id.value = committeeId;
  memberForm.member_id.value = member?.id || '';
  memberForm.person_id.value = member?.person_id || '';
  memberForm.member_name.value =
  member?.person_full_name ||
  member?.full_name ||
  member?.member_name ||
  '';
  memberForm.member_type.value = member?.member_type || 'village_representative';
  memberForm.organization.value = member?.organization || '';
  memberForm.designation.value = member?.designation || '';
 memberForm.phone.value =
  member?.person_phone_number ||
  member?.phone ||
  '';
  memberForm.email.value =
  member?.person_email ||
  member?.email ||
  '';
  memberForm.role_in_committee.value = committeeRole(member) === '-' ? '' : committeeRole(member);
  document.getElementById('memberModalTitle').textContent = member ? 'Edit Member' : 'Add Member';
  mountMemberPersonSelector(member);
  memberModal.showModal();
  try {
    await refreshCommitteeMembers(committeeId);
  } catch (error) {
    showMemberStatus(error.message || 'Unable to load committee members.', true);
  }
}

async function saveMember(event) {
  event.preventDefault();
  if (!validateMemberForm()) return;
  const body = Object.fromEntries(new FormData(memberForm));
  const committeeId = body.committee_id;
  const memberId = body.member_id;
  delete body.committee_id;
  delete body.member_id;
  if (memberId && !canUpdate) return showMemberStatus('You do not have update access for VWMC members.', true);
  if (!memberId && !canCreate) return showMemberStatus('You do not have create access for VWMC members.', true);
  try {
    showMemberStatus(memberId ? 'Updating member...' : 'Saving member...');
    const response = await json(memberId ? `/api/vwmc/members/${memberId}` : `/api/vwmc/committees/${committeeId}/members`, { method: memberId ? 'PUT' : 'POST', body });
    if (!response?.success) throw new Error(response?.message || 'Unable to save member.');
    showMemberStatus(memberId ? 'Member updated successfully.' : 'Member added successfully.');
    memberForm.reset();
    memberForm.committee_id.value = committeeId;
    memberForm.member_id.value = '';
    memberForm.person_id.value = '';
    document.getElementById('memberModalTitle').textContent = 'Add Member';
    clearMemberFieldErrors();
    mountMemberPersonSelector();
    await refreshCommitteeMembers(committeeId);
  } catch (error) {
    showMemberStatus(error.message || 'Unable to save member.', true);
  }
}

async function deleteCommittee(id) {
  if (!canDelete) return showStatus('You do not have delete access for VWMC records.', true);
  if (!confirm('Delete this VWMC and all its members?')) return;
  try {
    await json(`/api/vwmc/committees/${id}`, { method: 'DELETE' });
    showStatus('VWMC deleted.');
    await loadCommittees();
  } catch (error) {
    showStatus(error.message, true);
  }
}

async function deleteMember(id) {
  const showDeleteStatus = memberModal?.open ? showMemberStatus : showStatus;
  if (!canDelete) return showDeleteStatus('You do not have delete access for VWMC members.', true);
  if (!confirm('Delete this member?')) return;
  try {
    await json(`/api/vwmc/members/${id}`, { method: 'DELETE' });
    if (memberModal?.open && activeMemberCommitteeId) {
      showMemberStatus('Member deleted successfully.');
      await refreshCommitteeMembers(activeMemberCommitteeId);
    } else {
      showStatus('Member deleted.');
      await loadCommittees();
    }
    const committeeId = viewModal.dataset.committeeId;
    if (committeeId) await openViewModal(committeeId, true);
  } catch (error) {
    showStatus(error.message, true);
  }
}

function detailRow(label, value) {
  return `<div><dt class="form-helper">${escapeHtml(label)}</dt><dd class="text-sm text-slate-100">${escapeHtml(value || '-')}</dd></div>`;
}

async function openViewModal(id, keepOpen = false) {
  viewModal.dataset.committeeId = id;
  viewContent.innerHTML = '<div class="krwmp-loading-state">Loading committee details...</div>';
  if (!keepOpen) viewModal.showModal();
  try {
    const data = await json(`/api/vwmc/committees/${id}/details`);
    const c = data.committee;
    if (!c) throw new Error('Committee details were not returned by the server.');
    viewContent.innerHTML = `
      <section class="krwmp-card-muted p-4">
        <h3 class="form-section-heading mb-3">${escapeHtml(c.committee_name)}</h3>
        <dl class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${detailRow('Village', c.village_name)}
          ${detailRow('DSD', c.dsd_name)}
          ${detailRow('Primary GND', c.gnd_name)}
          ${detailRow('Status', c.status)}
          ${detailRow('Address', c.address)}
          ${detailRow('Location', c.latitude && c.longitude ? `${c.latitude}, ${c.longitude}` : '')}
        </dl>
        <div class="mt-3">${authorizedGndBadges(c)}</div>
      </section>
      <section class="krwmp-card-muted p-4">
        <h3 class="form-section-heading mb-3">Location Map</h3>
        <div id="vwmcViewMap" class="h-64 rounded border border-slate-700 overflow-hidden"></div>
      </section>
      <section class="krwmp-card-muted p-4">
        <div class="krwmp-cluster-between mb-3"><h3 class="form-section-heading">Committee Members</h3><button data-view-add-member="${c.id}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm ${canCreate ? '' : 'hidden'}">Add Member</button></div>
        ${memberCards(c)}
      </section>
      <section class="krwmp-card-muted p-4">
        <h3 class="form-section-heading mb-3">Related Interventions</h3>
        ${interventionCards(c.interventions || [])}
      </section>
      <section class="krwmp-card-muted p-4">
        <h3 class="form-section-heading mb-3">Reported Complaints Within Authorized GNDs</h3>
        ${complaintCards(c.complaints || [])}
      </section>
    `;
    renderViewMap(c);
  } catch (error) {
    viewContent.innerHTML = `
      <div class="krwmp-empty-state text-left">
        <p class="text-red-300 font-medium">Unable to load committee details.</p>
        <p class="form-helper mt-1">${escapeHtml(error.message || 'Please try again.')}</p>
        <button type="button" data-retry-view="${escapeHtml(id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-3">Retry</button>
      </div>
    `;
  }
}

function memberCards(c) {
  if (!(c.members || []).length) return '<div class="krwmp-empty-state">No members recorded.</div>';
  return (c.members || []).map(m => `
    <div class="krwmp-card p-3 text-sm">
      <div class="flex justify-between gap-3">
        <div><strong>${escapeHtml(memberDisplayName(m))}</strong><div class="form-helper">Committee Role: ${escapeHtml(committeeRole(m))}</div><div class="form-helper">Location: ${escapeHtml(memberLocation(m))}</div><div class="form-helper">${escapeHtml(m.organization || '-')} | ${escapeHtml(m.designation || '-')}</div><div class="form-helper">${escapeHtml(memberPhone(m))} | ${escapeHtml(memberEmail(m))}</div></div>
        <div class="krwmp-table-actions">
          ${personProfileLink(m?.person_id)}
          <button data-edit-member="${m.id}" data-committee-id="${c.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${canUpdate ? '' : 'hidden'}">Edit</button>
          <button data-delete-member="${m.id}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${canDelete ? '' : 'hidden'}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

function interventionCards(rows) {
  if (!rows.length) return '<div class="krwmp-empty-state">No related interventions found.</div>';
  return rows.map(row => `<div class="krwmp-card p-3 text-sm"><strong>${escapeHtml(row.intervention_title)}</strong><div class="form-helper">${escapeHtml(row.status || '-')} | ${escapeHtml(row.progress_percent ?? 0)}% | Officer: ${escapeHtml(row.lead_officer_name || '-')}</div><div class="form-helper">${formatDate(row.planned_start_date)} - ${formatDate(row.planned_end_date)}</div><a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-2 inline-flex" href="/intervention-registry.html?intervention_id=${encodeURIComponent(row.id)}">Open Intervention</a></div>`).join('');
}

function complaintCards(rows) {
  if (!rows.length) return '<div class="krwmp-empty-state">No complaints found within authorized GNDs.</div>';
  return rows.map(row => `<div class="krwmp-card p-3 text-sm"><strong>${escapeHtml(row.issue_title || row.description || row.report_code)}</strong><div class="form-helper">${escapeHtml(row.category_name || row.issue_name || '-')} | ${escapeHtml(row.status || '-')} | ${formatDate(row.submitted_at)}</div><div class="form-helper">Linked intervention: ${escapeHtml(row.intervention_title || 'None')}</div></div>`).join('');
}

function renderViewMap(c) {
  if (!window.maplibregl || !c.latitude || !c.longitude) return;
  if (viewMap) {
    viewMap.remove();
    viewMap = null;
  }
  const center = [Number(c.longitude), Number(c.latitude)];
  viewMap = new maplibregl.Map({ container: 'vwmcViewMap', style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', center, zoom: 13 });
  viewMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  new maplibregl.Marker({ color: '#059669' }).setLngLat(center).addTo(viewMap);
  setTimeout(() => viewMap?.resize(), 150);
}

function committeeById(id) {
  return committees.find(c => String(c.id) === String(id));
}

function memberById(id) {
  for (const committee of committees) {
    const member = (committee.members || []).find(m => String(m.id) === String(id));
    if (member) return { committee, member };
  }
  return {};
}

function bindEvents() {
  document.getElementById('addVwmcBtn')?.addEventListener('click', () => openCommitteeModal());
  document.getElementById('closeCommitteeModalBtn')?.addEventListener('click', () => committeeModal.close());
  document.getElementById('closeMemberModalBtn')?.addEventListener('click', () => {
    clearMemberStatus();
    clearMemberFieldErrors();
    memberModal.close();
  });
  document.getElementById('cancelMemberBtn')?.addEventListener('click', () => {
    clearMemberStatus();
    clearMemberFieldErrors();
    memberModal.close();
  });
  document.getElementById('closeViewModalBtn')?.addEventListener('click', () => viewModal.close());
  document.getElementById('refreshBtn')?.addEventListener('click', loadCommittees);
  document.getElementById('resetCommitteeBtn')?.addEventListener('click', () => { committeeForm.reset(); vwmcLocationPicker?.clear(); loadGnds(''); });
  dsdSelect.addEventListener('change', () => {
    const hasLocation = Boolean(committeeForm.latitude.value && committeeForm.longitude.value);
    return hasLocation ? loadGnds(dsdSelect.value, gndSelect.value, selectedAuthorizedGnds()) : loadGnds('');
  });
  gndSelect.addEventListener('change', () => selectAuthorizedGnds(Array.from(new Set([gndSelect.value, ...selectedAuthorizedGnds()].filter(Boolean)))));
  committeeForm.addEventListener('submit', saveCommittee);
  memberForm.addEventListener('submit', saveMember);
  memberForm.addEventListener('input', event => {
    const field = event.target.closest('.form-input, .form-select');
    if (!field) return;
    field.classList.remove('border-rose-400', 'focus:border-rose-300', 'focus:ring-rose-400/30');
    field.removeAttribute('aria-invalid');
    clearMemberStatus();
  });
  memberPersonSelectorContainer?.addEventListener('krwmp:person-selected', event => {
    const person = event.detail?.person || null;
    applySelectedPersonToMemberForm(person);
    if (person?.id) showMemberStatus(`Selected person: ${person.full_name || person.name || person.id}`);
  });
  memberModalList?.addEventListener('click', event => {
    const editMember = event.target.closest('[data-modal-edit-member]');
    const deleteMemberBtn = event.target.closest('[data-modal-delete-member]');
    if (editMember) {
      const { committee, member } = memberById(editMember.dataset.modalEditMember);
      return openMemberModal(activeMemberCommitteeId || committee?.id, member);
    }
    if (deleteMemberBtn) return deleteMember(deleteMemberBtn.dataset.modalDeleteMember);
  });
  committeeList.addEventListener('click', event => {
    const addMember = event.target.closest('[data-add-member]');
    const view = event.target.closest('[data-view]');
    const edit = event.target.closest('[data-edit]');
    const remove = event.target.closest('[data-delete]');
    if (addMember) return openMemberModal(addMember.dataset.addMember);
    if (view) return openViewModal(view.dataset.view);
    if (edit) return openCommitteeModal(committeeById(edit.dataset.edit));
    if (remove) return deleteCommittee(remove.dataset.delete);
  });
  viewContent.addEventListener('click', event => {
    const addMember = event.target.closest('[data-view-add-member]');
    const retryView = event.target.closest('[data-retry-view]');
    const editMember = event.target.closest('[data-edit-member]');
    const deleteMemberBtn = event.target.closest('[data-delete-member]');
    if (retryView) return openViewModal(retryView.dataset.retryView, true);
    if (addMember) return openMemberModal(addMember.dataset.viewAddMember);
    if (editMember) {
      const { committee, member } = memberById(editMember.dataset.editMember);
      return openMemberModal(editMember.dataset.committeeId || committee?.id, member);
    }
    if (deleteMemberBtn) return deleteMember(deleteMemberBtn.dataset.deleteMember);
  });
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

(async () => {
  await initSidebar();
  await loadDsds();
  await loadGnds('');
  vwmcLocationPicker = new KRWMPLocationPicker({
    containerId: 'vwmcLocationPicker',
    latitudeInput: '#latitudeInput',
    longitudeInput: '#longitudeInput',
    initialCenter: [80.2280810, 7.2334995],
    initialZoom: 11,
    onChange: identifySelectedLocation,
  });
  bindEvents();
  await loadCommittees();
})().catch(error => showStatus(error.message, true));
