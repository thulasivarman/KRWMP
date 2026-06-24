let canCreatePerson = false;
let canUpdatePerson = false;
let canPromotePerson = false;

const statusBox = document.getElementById('statusBox');
const writePanel = document.getElementById('writePanel');
const personForm = document.getElementById('personForm');
const tableBody = document.getElementById('personTableBody');
const paginationBox = document.getElementById('paginationBox');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const areaFilter = document.getElementById('areaFilter');
const openPersonModalBtn = document.getElementById('openPersonModalBtn');
const viewPersonModal = document.getElementById('viewPersonModal');
const viewPersonContent = document.getElementById('viewPersonContent');

let persons = [];
let currentPage = 1;
const pageSize = 12;

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;

function showStatus(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
}

function personDisplayName(row = {}) {
  return cleanText(row.full_name || row.name || row.preferred_name) || 'Unnamed person';
}

function statusBadge(status) {
  const value = cleanText(status || 'active').toLowerCase();
  const badgeClass = value === 'active' ? 'krwmp-badge-success' : 'krwmp-badge-neutral';
  return `<span class="krwmp-badge ${badgeClass}">${escapeHtml(value.toUpperCase())}</span>`;
}

function togglePersonModal(show) {
  if (!writePanel) return;
  writePanel.classList.toggle('hidden', !show);
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('person_registry', 'view');
  canCreatePerson = window.KRWMP_PRIVILEGES.can('person_registry', 'create');
  canUpdatePerson = window.KRWMP_PRIVILEGES.can('person_registry', 'update');
  canPromotePerson = window.KRWMP_PRIVILEGES.can('user_management_settings', 'create');
}

function applyPermissions() {
  if (openPersonModalBtn) openPersonModalBtn.classList.toggle('hidden', !canCreatePerson);
  document.querySelectorAll('[data-edit]').forEach(el => el.classList.toggle('hidden', !canUpdatePerson));
  document.querySelectorAll('[data-deactivate]').forEach(el => el.classList.toggle('hidden', !canUpdatePerson));
  document.querySelectorAll('[data-promote]').forEach(el => el.classList.toggle('hidden', !(canUpdatePerson && canPromotePerson)));
}

function buildSearchQuery() {
  const params = new URLSearchParams();
  const search = cleanText(searchInput.value);
  if (search) params.set('q', search);
  params.set('limit', '50');
  return params.toString();
}

function filteredPersons() {
  const wantedStatus = cleanText(statusFilter.value).toLowerCase();
  const wantedArea = cleanText(areaFilter.value).toLowerCase();
  return persons.filter(row => {
    const rowStatus = cleanText(row.status || 'active').toLowerCase();
    const rowArea = [row.dsd, row.gnd, row.address].filter(Boolean).join(' ').toLowerCase();
    if (wantedStatus && rowStatus !== wantedStatus) return false;
    if (wantedArea && !rowArea.includes(wantedArea)) return false;
    return true;
  });
}

async function loadPersons() {
  tableBody.innerHTML = '<tr><td colspan="6" class="krwmp-table-empty">Loading persons...</td></tr>';
  try {
    const data = await json(`/api/persons/search?${buildSearchQuery()}`);
    persons = data.persons || [];
    if (currentPage > totalPages()) currentPage = totalPages();
    renderPersons();
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="6" class="krwmp-table-empty text-rose-300">${escapeHtml(error.message || 'Unable to load persons.')}</td></tr>`;
  }
}

function updateSummaryCards() {
  const activeCount = persons.filter(row => cleanText(row.status || 'active').toLowerCase() === 'active').length;
  const systemUserCount = persons.filter(row => row.is_system_user || row.linked_user_id).length;
  const incompleteContactCount = persons.filter(row => !row.phone_number && !row.email).length;
  document.getElementById('totalPersonsCard').textContent = persons.length;
  document.getElementById('activePersonsCard').textContent = activeCount;
  document.getElementById('systemUsersCard').textContent = systemUserCount;
  document.getElementById('incompleteContactsCard').textContent = incompleteContactCount;
}

function totalPages() {
  return Math.max(1, Math.ceil(filteredPersons().length / pageSize));
}

function visiblePersons() {
  const rows = filteredPersons();
  const start = (currentPage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

function renderPersons() {
  updateSummaryCards();
  const rows = filteredPersons();
  if (currentPage > totalPages()) currentPage = totalPages();
  tableBody.innerHTML = '';

  if (!rows.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="krwmp-table-empty">No person records found.</td></tr>';
    paginationBox.innerHTML = '';
    return;
  }

  visiblePersons().forEach(row => {
    const tr = document.createElement('tr');
    const name = personDisplayName(row);
    const contactText = [row.phone_number, row.email].filter(Boolean).join('<br>') || '-';
    const areaText = [row.dsd, row.gnd].filter(Boolean).join(' / ') || '-';
    const systemUser = row.is_system_user || row.linked_user_id;
    tr.innerHTML = `
      <td>
        <div class="font-bold text-slate-100">${escapeHtml(name)}</div>
        <div class="krwmp-status-label">Preferred: ${escapeHtml(row.preferred_name || '-')}</div>
        <div class="krwmp-status-label">NIC: ${escapeHtml(row.nic_number || '-')}</div>
        <div class="text-[10px] text-slate-600 mt-1">Updated ${formatDate(row.updated_at)}</div>
      </td>
      <td class="text-slate-300 text-xs">${contactText}</td>
      <td class="text-slate-300"><div>${escapeHtml(areaText)}</div><div class="krwmp-status-label">${escapeHtml(row.address || 'No address')}</div></td>
      <td>${systemUser ? '<span class="krwmp-badge krwmp-badge-info">LINKED</span>' : '<span class="krwmp-badge krwmp-badge-neutral">NOT LINKED</span>'}</td>
      <td>${statusBadge(row.status)}</td>
      <td class="text-right">
        <div class="krwmp-table-actions">
          <button data-view="${escapeHtml(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button>
          <button data-edit="${escapeHtml(row.id)}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm hidden">Edit</button>
          <button data-deactivate="${escapeHtml(row.id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm hidden">Deactivate</button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => viewPerson(btn.dataset.view)));
  tableBody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => editPerson(btn.dataset.edit)));
  tableBody.querySelectorAll('[data-deactivate]').forEach(btn => btn.addEventListener('click', () => deactivatePerson(btn.dataset.deactivate)));
  renderPagination();
  applyPermissions();
}

function renderPagination() {
  const rows = filteredPersons();
  paginationBox.innerHTML = `
    <nav class="krwmp-pagination" aria-label="Person pagination">
      <span class="krwmp-pagination-meta">Showing ${visiblePersons().length} of ${rows.length} persons</span>
      <div class="krwmp-pagination-controls">
        <button id="prevPage" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${currentPage <= 1 ? 'opacity-50 pointer-events-none' : ''}">Previous</button>
        <span>Page ${currentPage} of ${totalPages()}</span>
        <button id="nextPage" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${currentPage >= totalPages() ? 'opacity-50 pointer-events-none' : ''}">Next</button>
      </div>
    </nav>
  `;
  document.getElementById('prevPage')?.addEventListener('click', () => { currentPage -= 1; renderPersons(); });
  document.getElementById('nextPage')?.addEventListener('click', () => { currentPage += 1; renderPersons(); });
}

function validateForm() {
  const errors = [];
  const fullName = cleanText(personForm.full_name.value);
  const email = cleanText(personForm.email.value);
  const phone = cleanText(personForm.phone_number.value);
  if (fullName.length < 2) errors.push('Full name is required and must contain at least 2 characters.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email format is invalid.');
  if (phone && !/^[0-9+()\-\s]{7,30}$/.test(phone)) errors.push('Phone number format is invalid.');
  if (errors.length) {
    showStatus(errors.join(' '), true);
    return false;
  }
  return true;
}

function getFormPayload() {
  return {
    full_name: cleanText(personForm.full_name.value),
    preferred_name: cleanText(personForm.preferred_name.value) || null,
    nic_number: cleanText(personForm.nic_number.value) || null,
    gender: cleanText(personForm.gender.value) || null,
    date_of_birth: cleanText(personForm.date_of_birth.value) || null,
    phone_number: cleanText(personForm.phone_number.value) || null,
    email: cleanText(personForm.email.value) || null,
    dsd: cleanText(personForm.dsd.value) || null,
    gnd: cleanText(personForm.gnd.value) || null,
    address: cleanText(personForm.address.value) || null,
    status: cleanText(personForm.status.value) || 'active',
  };
}

function resetForm() {
  personForm.reset();
  personForm.id.value = '';
  personForm.status.value = 'active';
  document.getElementById('person-modal-title').textContent = 'Add / Edit Person';
}

function openCreatePersonModal() {
  if (!canCreatePerson) return showStatus('You do not have create access for the person registry.', true);
  resetForm();
  togglePersonModal(true);
}

function closePersonModal() {
  resetForm();
  togglePersonModal(false);
}

function fillForm(row = {}) {
  personForm.id.value = row.id || '';
  personForm.full_name.value = row.full_name || '';
  personForm.preferred_name.value = row.preferred_name || '';
  personForm.nic_number.value = row.nic_number || '';
  personForm.gender.value = row.gender || '';
  personForm.date_of_birth.value = row.date_of_birth ? String(row.date_of_birth).slice(0, 10) : '';
  personForm.phone_number.value = row.phone_number || '';
  personForm.email.value = row.email || '';
  personForm.dsd.value = row.dsd || '';
  personForm.gnd.value = row.gnd || '';
  personForm.address.value = row.address || '';
  personForm.status.value = row.status || 'active';
  document.getElementById('person-modal-title').textContent = 'Edit Person';
}

function editPerson(id) {
  if (!canUpdatePerson) return showStatus('You do not have update access for the person registry.', true);
  const row = persons.find(item => String(item.id) === String(id));
  if (!row) return showStatus('Person record not found in the current list.', true);
  fillForm(row);
  togglePersonModal(true);
}

async function deactivatePerson(id) {
  if (!canUpdatePerson) return showStatus('You do not have update access for the person registry.', true);
  if (!confirm('Deactivate this person? Existing linked records will remain unchanged.')) return;
  try {
    await json(`/api/persons/${id}`, { method: 'PUT', body: { status: 'inactive' } });
    showStatus('Person deactivated successfully.');
    await loadPersons();
  } catch (error) {
    showStatus(error.message || 'Unable to deactivate person.', true);
  }
}

function moduleCount(profile = {}) {
  return [
    profile.vwmc_memberships,
    profile.complaints_reported,
    profile.intervention_actions,
    profile.volunteer_involvement,
    profile.water_quality_involvement,
    profile.pollution_involvement,
    profile.contact_involvement,
  ].reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0);
}

function linkedSummaryHtml(title, rows = [], renderer) {
  if (!Array.isArray(rows) || !rows.length) {
    return `<section class="krwmp-card-muted p-4"><h3 class="form-section-heading">${escapeHtml(title)}</h3><p class="form-helper mt-2">No linked records found.</p></section>`;
  }
  return `
    <section class="krwmp-card-muted p-4">
      <div class="krwmp-cluster-between gap-3">
        <h3 class="form-section-heading">${escapeHtml(title)}</h3>
        <span class="krwmp-badge krwmp-badge-info">${rows.length}</span>
      </div>
      <div class="mt-3 space-y-2">
        ${rows.slice(0, 8).map(renderer).join('')}
        ${rows.length > 8 ? `<p class="form-helper">Showing first 8 of ${rows.length} linked records.</p>` : ''}
      </div>
    </section>
  `;
}

function smallLinkedRow(primary, secondary = '', status = '') {
  return `
    <article class="rounded border border-slate-800 bg-slate-950/40 p-3">
      <div class="text-sm font-semibold text-slate-100">${escapeHtml(primary || '-')}</div>
      <div class="form-helper mt-1">${escapeHtml(secondary || '-')}</div>
      ${status ? `<div class="mt-2"><span class="krwmp-badge krwmp-badge-neutral">${escapeHtml(status)}</span></div>` : ''}
    </article>
  `;
}

async function viewPerson(id) {
  viewPersonContent.innerHTML = '<div class="krwmp-loading-state">Loading person profile...</div>';
  viewPersonModal?.showModal();
  try {
    const data = await json(`/api/persons/${id}/profile`);
    const profile = data.profile || {};
    const person = profile.person || {};
    const linkedUser = profile.linked_user;
    viewPersonContent.innerHTML = `
      <section class="krwmp-card-muted p-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 class="text-xl font-bold text-slate-100">${escapeHtml(personDisplayName(person))}</h3>
            <p class="form-helper mt-1">${escapeHtml([person.phone_number, person.email].filter(Boolean).join(' | ') || 'No contact details')}</p>
            <p class="form-helper mt-1">NIC: ${escapeHtml(person.nic_number || '-')} | Area: ${escapeHtml([person.dsd, person.gnd].filter(Boolean).join(' / ') || '-')}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            ${statusBadge(person.status)}
            ${linkedUser ? '<span class="krwmp-badge krwmp-badge-info">SYSTEM USER LINKED</span>' : '<span class="krwmp-badge krwmp-badge-neutral">NOT A SYSTEM USER</span>'}
            <span class="krwmp-badge krwmp-badge-warning">${moduleCount(profile)} LINKED RECORDS</span>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article class="krwmp-card-muted p-4">
          <h3 class="form-section-heading">Basic Details</h3>
          <dl class="mt-3 grid grid-cols-1 gap-2 text-sm">
            <div><dt class="krwmp-status-label">Preferred Name</dt><dd>${escapeHtml(person.preferred_name || '-')}</dd></div>
            <div><dt class="krwmp-status-label">Gender / DOB</dt><dd>${escapeHtml([person.gender, formatDate(person.date_of_birth)].filter(Boolean).join(' / ') || '-')}</dd></div>
            <div><dt class="krwmp-status-label">Address</dt><dd>${escapeHtml(person.address || '-')}</dd></div>
          </dl>
        </article>
        <article class="krwmp-card-muted p-4">
          <h3 class="form-section-heading">System User Link</h3>
          <dl class="mt-3 grid grid-cols-1 gap-2 text-sm">
            <div><dt class="krwmp-status-label">User Name</dt><dd>${escapeHtml(linkedUser?.name || '-')}</dd></div>
            <div><dt class="krwmp-status-label">Login Identifier</dt><dd>${escapeHtml(linkedUser?.identifier || '-')}</dd></div>
            <div><dt class="krwmp-status-label">Role</dt><dd>${escapeHtml(linkedUser?.role_name || '-')}</dd></div>
          </dl>
        </article>
      </section>

      ${linkedSummaryHtml('VWMC Memberships', profile.vwmc_memberships, row => smallLinkedRow(row.committee_name, [row.village_name, row.dsd_name, row.gnd_name].filter(Boolean).join(' / '), row.role_in_committee || row.member_type))}
      ${linkedSummaryHtml('Community Complaints Reported', profile.complaints_reported, row => smallLinkedRow(row.issue_title || row.report_code, [row.location_description, row.dsd_name, row.gnd_name].filter(Boolean).join(' / '), row.status))}
      ${linkedSummaryHtml('Intervention Actions', profile.intervention_actions, row => smallLinkedRow(row.action_title, [row.intervention_code, row.intervention_title].filter(Boolean).join(' - '), row.action_status))}
      ${linkedSummaryHtml('Volunteer / Institution Contacts', profile.volunteer_involvement, row => smallLinkedRow(row.organisation_name, [row.organisation_category, row.dsd_name, row.gnd_name].filter(Boolean).join(' / '), row.involvement_type))}
      ${linkedSummaryHtml('Water Quality Involvement', profile.water_quality_involvement, row => smallLinkedRow(row.sample_code || row.sample_location_name, [row.sample_location_name, row.dsd_name, row.gnd_name].filter(Boolean).join(' / '), row.overall_status))}
      ${linkedSummaryHtml('Pollution Monitoring Involvement', profile.pollution_involvement, row => smallLinkedRow(row.source_name || row.source_code, [row.inspection_date, row.inspection_agency].filter(Boolean).join(' / '), row.follow_up_status))}
      ${linkedSummaryHtml('Institution Contact Records', profile.contact_involvement, row => smallLinkedRow(row.institution_name, [row.institution_code, row.institution_type, row.dsd_name].filter(Boolean).join(' / '), row.active === false ? 'inactive' : 'active'))}
    `;
  } catch (error) {
    viewPersonContent.innerHTML = `<div class="krwmp-empty-state text-rose-300">${escapeHtml(error.message || 'Unable to load person profile.')}</div>`;
  }
}

personForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!validateForm()) return;
  const id = personForm.id.value;
  if (id && !canUpdatePerson) return showStatus('You do not have update access for the person registry.', true);
  if (!id && !canCreatePerson) return showStatus('You do not have create access for the person registry.', true);
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/persons/${id}` : '/api/persons';
  try {
    await json(url, { method, body: getFormPayload() });
    showStatus(id ? 'Person updated successfully.' : 'Person created successfully.');
    closePersonModal();
    await loadPersons();
  } catch (error) {
    showStatus(error.message || 'Unable to save person.', true);
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
  await loadPersons();

  document.getElementById('refreshBtn')?.addEventListener('click', () => { currentPage = 1; loadPersons(); });
  openPersonModalBtn?.addEventListener('click', openCreatePersonModal);
  document.getElementById('closePersonModalBtn')?.addEventListener('click', closePersonModal);
  document.getElementById('resetPersonBtn')?.addEventListener('click', resetForm);
  document.getElementById('cancelPersonBtn')?.addEventListener('click', closePersonModal);
  document.getElementById('closeViewModalBtn')?.addEventListener('click', () => viewPersonModal?.close());
  document.getElementById('closeViewModalFooterBtn')?.addEventListener('click', () => viewPersonModal?.close());
  searchInput.addEventListener('input', debounce(() => { currentPage = 1; loadPersons(); }));
  statusFilter.addEventListener('change', () => { currentPage = 1; renderPersons(); });
  areaFilter.addEventListener('input', debounce(() => { currentPage = 1; renderPersons(); }));
  applyPermissions();
}

document.addEventListener('DOMContentLoaded', init);
