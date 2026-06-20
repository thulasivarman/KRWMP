const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;

const statusBox = document.getElementById('statusBox');
const profileSummary = document.getElementById('profileSummary');
const personTitle = document.getElementById('personTitle');
const personSubtitle = document.getElementById('personSubtitle');
const promoteUserModal = document.getElementById('promoteUserModal');
const promoteUserForm = document.getElementById('promoteUserForm');
const promoteModalMessage = document.getElementById('promoteModalMessage');
const promoteRoleSelect = document.getElementById('promoteRoleSelect');

let currentProfile = null;
let canPromoteUser = false;
let rolesCache = [];

function show(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

function value(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatDate(date) {
  if (!date) return '-';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return String(date).slice(0, 10);
  return parsed.toLocaleDateString();
}

function badge(text, kind = 'neutral') {
  return `<span class="krwmp-badge krwmp-badge-${kind}">${escapeHtml(value(text))}</span>`;
}

function sectionTitle(title, count) {
  return `
    <div class="krwmp-cluster-between gap-3">
      <h2 class="form-section-heading">${escapeHtml(title)}</h2>
      ${badge(`${count} record${Number(count) === 1 ? '' : 's'}`, count ? 'info' : 'neutral')}
    </div>
  `;
}

function emptyState(message) {
  return `<div class="krwmp-empty-state">${escapeHtml(message)}</div>`;
}

function detail(label, text) {
  return `
    <div>
      <div class="form-helper">${escapeHtml(label)}</div>
      <div class="text-sm text-slate-100">${escapeHtml(value(text))}</div>
    </div>
  `;
}

function personProfileUrl(personId) {
  return `/person-profile.html?id=${encodeURIComponent(personId)}`;
}

function initialsFromName(name = '') {
  return String(name || '')
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 4)
    .toUpperCase() || 'USR';
}

function usernameFromName(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40);
}

function showPromoteMessage(message, error = false) {
  if (!promoteModalMessage) return;
  promoteModalMessage.textContent = message || '';
  promoteModalMessage.className = message
    ? `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 border border-rose-500/30 text-rose-300' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'}`
    : 'hidden rounded-lg p-3 text-sm';
}

async function loadRolesForPromotion() {
  if (rolesCache.length) return rolesCache;
  const data = await json('/api/admin/users');
  rolesCache = data.roles || [];
  return rolesCache;
}

function fillRoleSelect(roles = []) {
  promoteRoleSelect.innerHTML = '<option value="">Select user group</option>';
  roles.forEach(role => {
    const option = document.createElement('option');
    option.value = role.id;
    option.textContent = role.role_name;
    promoteRoleSelect.appendChild(option);
  });
}

async function openPromoteModal() {
  const person = currentProfile?.person || {};
  if (!person.id) return;
  if (!canPromoteUser) return show('You do not have access to create system users.', true);
  if (person.linked_user_id || person.is_system_user || currentProfile?.linked_user) {
    return show('This person is already linked to a system user.', true);
  }

  promoteUserForm.reset();
  showPromoteMessage('');
  promoteUserForm.elements.name.value = person.full_name || '';
  promoteUserForm.elements.phone_number.value = person.phone_number || '';
  promoteUserForm.elements.email.value = person.email || '';
  promoteUserForm.elements.identifier.value = usernameFromName(person.full_name);
  promoteUserForm.elements.initials.value = initialsFromName(person.full_name);
  promoteUserForm.elements.designation.value = 'System User';

  try {
    fillRoleSelect(await loadRolesForPromotion());
  } catch (error) {
    fillRoleSelect([]);
    showPromoteMessage(error.message || 'Unable to load user groups.', true);
  }
  promoteUserModal.showModal();
}

function closePromoteModal() {
  promoteUserModal?.close();
}

function renderPersonSummary(person = {}) {
  personTitle.textContent = person.full_name || 'Person Profile';
  personSubtitle.textContent = [person.phone_number, person.email, person.gnd, person.dsd].filter(Boolean).join(' | ') || 'No contact/location details recorded.';
  profileSummary.innerHTML = `
    <div class="krwmp-cluster-between gap-4">
      <div>
        <h2 class="form-section-heading">${escapeHtml(value(person.full_name, 'Unnamed person'))}</h2>
        <p class="form-helper mt-1">Master person record ${escapeHtml(person.id || '')}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        ${badge(person.status || 'active', person.status === 'inactive' ? 'warning' : 'success')}
        ${person.is_system_user ? badge('System User', 'info') : badge('Non-System Person', 'neutral')}
      </div>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      ${detail('Preferred Name', person.preferred_name)}
      ${detail('NIC', person.nic_number)}
      ${detail('Phone', person.phone_number)}
      ${detail('Email', person.email)}
      ${detail('Gender', person.gender)}
      ${detail('Date of Birth', formatDate(person.date_of_birth))}
      ${detail('DSD', person.dsd)}
      ${detail('GND', person.gnd)}
      <div class="md:col-span-2 xl:col-span-4">${detail('Address', person.address)}</div>
    </div>
  `;
}

function renderSystemUser(profile = {}) {
  const node = document.getElementById('systemUserSection');
  const user = profile.linked_user;
  const canCreate = canPromoteUser && !user && !profile.person?.linked_user_id && !profile.person?.is_system_user;
  node.innerHTML = `
    ${sectionTitle('Linked System User', user ? 1 : 0)}
    ${user ? `
      <div class="krwmp-card p-3 text-sm">
        <strong class="text-slate-100">${escapeHtml(value(user.name || user.identifier))}</strong>
        <div class="form-helper mt-1">${escapeHtml(value(user.identifier))} | ${escapeHtml(value(user.role_name))}</div>
        <div class="form-helper mt-1">${escapeHtml(value(user.designation))} | ${escapeHtml(value(user.phone_number || user.email))}</div>
      </div>
    ` : `
      ${emptyState('No system user is linked to this person.')}
      ${canCreate ? '<button id="createSystemUserBtn" type="button" class="krwmp-btn krwmp-btn-primary">Create System User</button>' : ''}
    `}
  `;
  node.querySelector('#createSystemUserBtn')?.addEventListener('click', openPromoteModal);
}

function renderVwmc(profile = {}) {
  const rows = profile.vwmc_memberships || [];
  document.getElementById('vwmcSection').innerHTML = `
    ${sectionTitle('VWMC Memberships', rows.length)}
    ${rows.length ? rows.map(row => `
      <article class="krwmp-card p-3 text-sm">
        <strong class="text-slate-100">${escapeHtml(value(row.committee_name))}</strong>
        <div class="form-helper mt-1">${escapeHtml(value(row.committee_code))} | ${escapeHtml(value(row.committee_status))}</div>
        <div class="form-helper mt-1">Role: ${escapeHtml(value(row.role_in_committee))} | Designation: ${escapeHtml(value(row.designation))}</div>
        <div class="form-helper mt-1">${escapeHtml(value(row.gnd_name))} | ${escapeHtml(value(row.dsd_name))}</div>
        <a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-3 inline-flex" href="/vwmc-management.html">Open VWMC</a>
      </article>
    `).join('') : emptyState('No VWMC memberships linked to this person.')}
  `;
}

function renderComplaints(profile = {}) {
  const rows = profile.complaints_reported || [];
  document.getElementById('complaintsSection').innerHTML = `
    ${sectionTitle('Complaints Reported', rows.length)}
    ${rows.length ? rows.map(row => `
      <article class="krwmp-card p-3 text-sm">
        <strong class="text-slate-100">${escapeHtml(value(row.report_code))} - ${escapeHtml(value(row.issue_title))}</strong>
        <div class="form-helper mt-1">${escapeHtml(value(row.category_name || row.issue_name))} | ${escapeHtml(value(row.status))} | ${formatDate(row.submitted_at)}</div>
        <div class="form-helper mt-1">${escapeHtml(value(row.gnd_name))} | ${escapeHtml(value(row.dsd_name))}</div>
        <a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-3 inline-flex" href="/admin-community-issues.html">Open Issue Review</a>
      </article>
    `).join('') : emptyState('No community complaints are linked to this person.')}
  `;
}

function renderInterventionActions(profile = {}) {
  const rows = profile.intervention_actions || [];
  document.getElementById('interventionActionsSection').innerHTML = `
    ${sectionTitle('Intervention Actions Responsible For', rows.length)}
    ${rows.length ? rows.map(row => `
      <article class="krwmp-card p-3 text-sm">
        <strong class="text-slate-100">${escapeHtml(value(row.action_title))}</strong>
        <div class="form-helper mt-1">${formatDate(row.action_date)} | ${escapeHtml(value(row.action_status))} | ${escapeHtml(value(row.progress_percent, 0))}%</div>
        <div class="form-helper mt-1">${escapeHtml(value(row.intervention_code))} - ${escapeHtml(value(row.intervention_title))}</div>
        <div class="form-helper mt-1">${escapeHtml(value(row.designation))} | ${escapeHtml(value(row.institution || row.implementing_office))}</div>
        <a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-3 inline-flex" href="/intervention-registry.html?intervention_id=${encodeURIComponent(row.intervention_id)}">Open Intervention</a>
      </article>
    `).join('') : emptyState('No intervention actions are linked to this person.')}
  `;
}

function renderVolunteer(profile = {}) {
  const rows = profile.volunteer_involvement || [];
  document.getElementById('volunteerSection').innerHTML = `
    ${sectionTitle('Volunteer Organisation Involvement', rows.length)}
    ${rows.length ? rows.map(row => `
      <article class="krwmp-card p-3 text-sm">
        <strong class="text-slate-100">${escapeHtml(value(row.organisation_name))}</strong>
        <div class="form-helper mt-1">${escapeHtml(value(row.involvement_type))} | ${escapeHtml(value(row.organisation_category))}</div>
        <div class="form-helper mt-1">${escapeHtml(value(row.contact_phone || row.contact_email))}</div>
        <div class="form-helper mt-1">${escapeHtml(value(row.gnd_name))} | ${escapeHtml(value(row.dsd_name))}</div>
        <a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-3 inline-flex" href="/volunteer-organisations.html">Open Volunteer Organisations</a>
      </article>
    `).join('') : emptyState('No volunteer organisation involvement found.')}
  `;
}

function renderMonitoring(profile = {}) {
  const waterRows = profile.water_quality_involvement || [];
  const pollutionRows = profile.pollution_involvement || [];
  document.getElementById('monitoringSection').innerHTML = `
    ${sectionTitle('Water Quality / Pollution Involvement', waterRows.length + pollutionRows.length)}
    <div class="krwmp-stack-sm">
      ${waterRows.length ? waterRows.map(row => `
        <article class="krwmp-card p-3 text-sm">
          <strong class="text-slate-100">Water Quality: ${escapeHtml(value(row.sample_code))}</strong>
          <div class="form-helper mt-1">${escapeHtml(value(row.sample_location_name))} | ${formatDate(row.sample_collection_datetime)} | ${escapeHtml(value(row.overall_status))}</div>
          <a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-3 inline-flex" href="/water-quality-records.html">Open Water Quality</a>
        </article>
      `).join('') : ''}
      ${pollutionRows.length ? pollutionRows.map(row => `
        <article class="krwmp-card p-3 text-sm">
          <strong class="text-slate-100">Pollution: ${escapeHtml(value(row.source_code))} - ${escapeHtml(value(row.source_name))}</strong>
          <div class="form-helper mt-1">${formatDate(row.inspection_date)} | ${escapeHtml(value(row.inspection_agency))} | ${escapeHtml(value(row.follow_up_status))}</div>
          <a class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm mt-3 inline-flex" href="/pollution-sources.html">Open Pollution Sources</a>
        </article>
      `).join('') : ''}
      ${!waterRows.length && !pollutionRows.length ? emptyState('No water quality or pollution source involvement found.') : ''}
    </div>
  `;
}

function renderContacts(profile = {}) {
  const rows = profile.contact_involvement || [];
  document.getElementById('contactSection').innerHTML = `
    ${sectionTitle('Institution / Contact Involvement', rows.length)}
    ${rows.length ? `
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        ${rows.map(row => `
          <article class="krwmp-card p-3 text-sm">
            <strong class="text-slate-100">${escapeHtml(value(row.institution_name))}</strong>
            <div class="form-helper mt-1">${escapeHtml(value(row.institution_code))} | ${escapeHtml(value(row.institution_type))}</div>
            <div class="form-helper mt-1">${escapeHtml(value(row.contact_phone || row.contact_email))}</div>
            <div class="form-helper mt-1">${escapeHtml(value(row.gnd_name))} | ${escapeHtml(value(row.dsd_name))}</div>
          </article>
        `).join('')}
      </div>
    ` : emptyState('No institution contact involvement found.')}
  `;
}

function renderProfile(profile = {}) {
  currentProfile = profile;
  renderPersonSummary(profile.person || {});
  renderSystemUser(profile);
  renderVwmc(profile);
  renderComplaints(profile);
  renderInterventionActions(profile);
  renderVolunteer(profile);
  renderMonitoring(profile);
  renderContacts(profile);
}

async function init() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('person_registry', 'view');
  canPromoteUser = window.KRWMP_PRIVILEGES.can('person_registry', 'update') && window.KRWMP_PRIVILEGES.can('user_management_settings', 'create');
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');

  const personId = new URLSearchParams(window.location.search).get('id');
  if (!personId) {
    show('Missing person id.', true);
    profileSummary.innerHTML = emptyState('No person id was provided in the URL.');
    return;
  }

  try {
    const data = await json(`/api/persons/${encodeURIComponent(personId)}/profile`);
    renderProfile(data.profile || {});
  } catch (error) {
    show(error.message || 'Unable to load person profile.', true);
    profileSummary.innerHTML = emptyState(error.message || 'Unable to load person profile.');
  }
}

promoteUserForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentProfile?.person?.id) return;
  const button = document.getElementById('savePromoteBtn');
  const body = Object.fromEntries(new FormData(promoteUserForm));
  button.disabled = true;
  showPromoteMessage('Creating system user...');
  try {
    const data = await json(`/api/persons/${encodeURIComponent(currentProfile.person.id)}/promote-user`, {
      method: 'POST',
      body,
    });
    closePromoteModal();
    show(data.message || 'System user created and linked.');
    const refreshed = await json(`/api/persons/${encodeURIComponent(currentProfile.person.id)}/profile`);
    renderProfile(refreshed.profile || {});
  } catch (error) {
    showPromoteMessage(error.message || 'Unable to create system user.', true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('closePromoteModalBtn')?.addEventListener('click', closePromoteModal);
document.getElementById('cancelPromoteBtn')?.addEventListener('click', closePromoteModal);

window.KRWMP_PERSON_PROFILE = { personProfileUrl };
document.addEventListener('DOMContentLoaded', init);
