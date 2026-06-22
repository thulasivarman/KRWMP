const state = { organisations: [], memberSearchResults: [], currentOrganisationId: null, canCreate: false, canUpdate: false, canDelete: false };
const { apiRequest: api, escapeHtml } = window.KRWMP_UTILS;
const statusBox = document.getElementById('statusBox');
const cards = document.getElementById('organisationCards');
const searchInput = document.getElementById('searchInput');
const addOrganisationBtn = document.getElementById('addOrganisationBtn');
const organisationModal = document.getElementById('organisationModal');
const organisationModalContent = document.getElementById('organisationModalContent');
const memberModal = document.getElementById('memberModal');
const memberForm = document.getElementById('memberForm');
const memberOrganisationId = document.getElementById('memberOrganisationId');
const memberPersonId = document.getElementById('memberPersonId');
const memberPersonSearch = document.getElementById('memberPersonSearch');
const memberSearchResults = document.getElementById('memberSearchResults');
const memberSelectedSummary = document.getElementById('memberSelectedSummary');

function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value ?? '-'; }
function openModal(dialog) { if (dialog) (typeof dialog.showModal === 'function' ? dialog.showModal() : dialog.setAttribute('open', 'open')); }
function closeModal(dialog) { if (dialog) (typeof dialog.close === 'function' ? dialog.close() : dialog.removeAttribute('open')); }
function formatStatus(value) { const active = !(value === false || value === 'false'); return active ? '<span class="krwmp-badge krwmp-badge-success">Active</span>' : '<span class="krwmp-badge krwmp-badge-danger">Inactive</span>'; }
function formatScore(value) { const n = Number(value); return Number.isNaN(n) ? '-' : n.toFixed(1); }
function formatDocument(row) { return row.supporting_document_url ? `<a href="${escapeHtml(row.supporting_document_url)}" target="_blank" rel="noopener" class="text-emerald-300 font-semibold">Open</a>` : '<span class="text-slate-500">-</span>'; }
function pickNumber(...values) { for (const value of values) if (value !== undefined && value !== null && value !== '') return value; return 0; }
function debounce(fn, delay = 300) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }

async function init() {
  await window.KRWMP_ENGINE.assembleInterfaceContext();
  await window.KRWMP_PRIVILEGES.protectPage('volunteer_organisation_management', 'view');
  state.canCreate = window.KRWMP_PRIVILEGES.can('volunteer_organisation_management', 'create');
  state.canUpdate = window.KRWMP_PRIVILEGES.can('volunteer_organisation_management', 'update');
  state.canDelete = window.KRWMP_PRIVILEGES.can('volunteer_organisation_management', 'delete');
  addOrganisationBtn.classList.toggle('hidden', !state.canCreate);
  bindEvents();
  await loadVolunteerOrganisations();
}

async function loadVolunteerOrganisations() {
  show('Loading volunteer organisation records...');
  const [dashboardData, listData] = await Promise.all([api('/api/volunteer-organisations/dashboard'), api('/api/volunteer-organisations')]);
  state.organisations = listData.organisations || [];
  renderSummary(dashboardData.dashboard?.summary || {}, state.organisations);
  renderOrganisationCards();
  show(`Loaded ${state.organisations.length} volunteer organisation record(s).`);
}

function renderSummary(summary, rows) {
  const total = pickNumber(summary.total_organisations, summary.total_count, rows.length);
  const active = pickNumber(summary.active_organisations, summary.active_count, rows.filter(row => row.active !== false && row.active !== 'false').length);
  const avg = pickNumber(summary.average_performance_score, summary.avg_performance_score, null);
  const mapped = pickNumber(summary.mapped_records, summary.mapped_count, rows.filter(row => row.active !== false && row.active !== 'false' && (row.latitude || row.longitude)).length);
  setText('totalOrganisations', total);
  setText('activeOrganisations', active);
  setText('averageScore', avg === null || avg === undefined || Number.isNaN(Number(avg)) ? '-' : Number(avg).toFixed(1));
  setText('mappedRecords', mapped);
}

function filteredOrganisations() {
  const term = String(searchInput.value || '').trim().toLowerCase();
  if (!term) return state.organisations;
  return state.organisations.filter(row => [row.institution_name, row.organisation_name, row.institution_type, row.contact_person, row.contact_phone, row.contact_email, row.dsd_name, row.gnd_name, row.address].some(value => String(value || '').toLowerCase().includes(term)));
}

function renderOrganisationCards() {
  const rows = filteredOrganisations();
  if (!rows.length) {
    cards.innerHTML = '<div class="krwmp-empty-state">No volunteer organisations found.</div>';
    return;
  }
  cards.innerHTML = rows.map(row => `
    <article class="krwmp-card krwmp-stack-sm">
      <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap gap-2 items-center"><h3 class="font-semibold text-slate-100">${escapeHtml(row.institution_name || row.organisation_name || 'Unnamed Organisation')}</h3>${formatStatus(row.active)}<span class="krwmp-badge krwmp-badge-info">${escapeHtml(row.member_count || 0)} member(s)</span></div>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(row.institution_code || '-')} · ${escapeHtml(row.institution_type || '-')}</p>
          <p class="text-sm text-slate-300 mt-2">${escapeHtml(row.contact_person || '-')} · ${escapeHtml(row.contact_phone || row.contact_email || '-')}</p>
          <p class="text-xs text-slate-500 mt-1">${escapeHtml(row.dsd_name || '-')} / ${escapeHtml(row.gnd_name || '-')} · Score: ${formatScore(row.performance_score)} · Document: ${formatDocument(row)}</p>
        </div>
        <div class="krwmp-table-actions">
          <button type="button" data-view-id="${escapeHtml(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">View</button>
          <a href="/volunteer-organisation-form.html?id=${encodeURIComponent(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm ${state.canUpdate ? '' : 'hidden'}">Edit</a>
          <button type="button" data-member-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.institution_name || 'Organisation')}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm ${state.canUpdate ? '' : 'hidden'}">Add Member</button>
          <button type="button" data-delete-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.institution_name || 'this record')}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${state.canDelete ? '' : 'hidden'}">Delete</button>
        </div>
      </div>
    </article>`).join('');
}

function memberRows(members = []) {
  if (!members.length) return '<div class="krwmp-empty-state">No members linked yet.</div>';
  return members.map(member => `
    <div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div><div class="font-semibold text-slate-100">${escapeHtml(member.full_name || '-')}</div><div class="form-helper mt-1">${escapeHtml(member.organisation_role || 'Member')} · ${escapeHtml(member.phone_number || member.email || '-')} · ${escapeHtml(member.responsibility || '')}</div></div>
      <button type="button" data-remove-member="${escapeHtml(member.id)}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${state.canUpdate ? '' : 'hidden'}">Remove</button>
    </div>`).join('');
}

async function viewOrganisation(id) {
  const data = await api(`/api/volunteer-organisations/${encodeURIComponent(id)}`);
  const row = data.organisation;
  state.currentOrganisationId = id;
  organisationModalContent.innerHTML = `
    <section class="krwmp-card-muted p-4 krwmp-stack-sm">
      <h3 class="font-semibold text-slate-100">${escapeHtml(row.institution_name || '-')}</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div><span class="text-slate-500">Type:</span> ${escapeHtml(row.institution_type || '-')}</div>
        <div><span class="text-slate-500">Code:</span> ${escapeHtml(row.institution_code || '-')}</div>
        <div><span class="text-slate-500">Contact:</span> ${escapeHtml(row.contact_person || '-')} ${escapeHtml(row.contact_phone || '')}</div>
        <div><span class="text-slate-500">Location:</span> ${escapeHtml(row.dsd_name || '-')} / ${escapeHtml(row.gnd_name || '-')}</div>
        <div><span class="text-slate-500">Website:</span> ${row.website ? `<a href="${escapeHtml(row.website)}" target="_blank" class="text-emerald-300">${escapeHtml(row.website)}</a>` : '-'}</div>
        <div><span class="text-slate-500">Document:</span> ${formatDocument(row)}</div>
      </div>
      <p class="text-sm text-slate-300 whitespace-pre-line">${escapeHtml(row.description || '-')}</p>
    </section>
    <section><div class="flex items-center justify-between gap-3 mb-3"><h3 class="form-section-heading">Members</h3><button type="button" data-member-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.institution_name || 'Organisation')}" class="krwmp-btn krwmp-btn-primary krwmp-btn-sm ${state.canUpdate ? '' : 'hidden'}">Add Member</button></div><div id="modalMemberList" class="space-y-2">${memberRows(row.members || [])}</div></section>`;
  openModal(organisationModal);
}

function openMemberModal(id, name) {
  memberForm.reset();
  memberOrganisationId.value = id;
  memberPersonId.value = '';
  state.memberSearchResults = [];
  memberSearchResults.innerHTML = '<div class="krwmp-empty-state">Search and select a master person.</div>';
  memberSelectedSummary.className = 'krwmp-empty-state py-3';
  memberSelectedSummary.textContent = 'No person selected.';
  document.getElementById('memberModalTitle').textContent = `Link Member - ${name || 'Organisation'}`;
  openModal(memberModal);
}

function renderPersonMatches(rows = []) {
  state.memberSearchResults = rows;
  if (!rows.length) { memberSearchResults.innerHTML = '<div class="krwmp-empty-state">No matching person found.</div>'; return; }
  memberSearchResults.innerHTML = rows.map(row => `<div class="krwmp-card p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"><div><strong>${escapeHtml(row.full_name || '-')}</strong><div class="form-helper">${escapeHtml(row.phone_number || row.email || '-')}</div></div><button type="button" data-select-person="${escapeHtml(row.id)}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Select</button></div>`).join('');
}

async function searchPersons() {
  const q = String(memberPersonSearch.value || '').trim();
  if (q.length < 3) { renderPersonMatches([]); return; }
  const data = await api(`/api/persons/search?q=${encodeURIComponent(q)}&limit=10`);
  renderPersonMatches(data.persons || []);
}

function selectPerson(id) {
  const person = state.memberSearchResults.find(row => String(row.id) === String(id));
  if (!person) return;
  memberPersonId.value = person.id;
  memberSelectedSummary.className = 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3';
  memberSelectedSummary.innerHTML = `<strong class="text-emerald-200">${escapeHtml(person.full_name || '-')}</strong><div class="form-helper mt-1">${escapeHtml(person.phone_number || person.email || '-')}</div>`;
}

async function saveMember(event) {
  event.preventDefault();
  if (!memberPersonId.value) return show('Please select a master person before linking member.', true);
  const body = Object.fromEntries(new FormData(memberForm));
  await api(`/api/volunteer-organisations/${encodeURIComponent(memberOrganisationId.value)}/members`, { method: 'POST', body });
  closeModal(memberModal);
  show('Organisation member linked.');
  await loadVolunteerOrganisations();
  if (organisationModal?.open && state.currentOrganisationId) await viewOrganisation(state.currentOrganisationId);
}

async function removeMember(memberId) {
  if (!state.currentOrganisationId || !confirm('Remove this member link?')) return;
  await api(`/api/volunteer-organisations/${encodeURIComponent(state.currentOrganisationId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
  show('Member link removed.');
  await viewOrganisation(state.currentOrganisationId);
  await loadVolunteerOrganisations();
}

async function deleteOrganisation(id, name) {
  if (!state.canDelete) return show('You do not have delete access for volunteer organisations.', true);
  if (!confirm(`Delete ${name || 'this volunteer organisation'}?`)) return;
  await api(`/api/volunteer-organisations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  show('Volunteer organisation deleted.');
  await loadVolunteerOrganisations();
}

function bindEvents() {
  document.getElementById('reloadBtn')?.addEventListener('click', loadVolunteerOrganisations);
  searchInput.addEventListener('input', renderOrganisationCards);
  cards.addEventListener('click', event => {
    const view = event.target.closest('[data-view-id]');
    const member = event.target.closest('[data-member-id]');
    const del = event.target.closest('[data-delete-id]');
    if (view) viewOrganisation(view.dataset.viewId).catch(error => show(error.message, true));
    if (member) openMemberModal(member.dataset.memberId, member.dataset.name);
    if (del) deleteOrganisation(del.dataset.deleteId, del.dataset.name).catch(error => show(error.message, true));
  });
  organisationModalContent.addEventListener('click', event => {
    const member = event.target.closest('[data-member-id]');
    const remove = event.target.closest('[data-remove-member]');
    if (member) openMemberModal(member.dataset.memberId, member.dataset.name);
    if (remove) removeMember(remove.dataset.removeMember).catch(error => show(error.message, true));
  });
  memberPersonSearch.addEventListener('input', debounce(() => searchPersons().catch(error => show(error.message, true)), 300));
  memberSearchResults.addEventListener('click', event => { const button = event.target.closest('[data-select-person]'); if (button) selectPerson(button.dataset.selectPerson); });
  memberForm.addEventListener('submit', saveMember);
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(document.getElementById(button.dataset.closeModal))));
}

init().catch(error => show(error.message || 'Unable to load volunteer organisations.', true));
