const currentUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const currentRole = String(currentUser?.role_name || currentUser?.role || '').toLowerCase();
const canManage = currentRole === 'admin' || currentRole === 'data_collectors' || currentRole === 'data_collector';
const statusBox = document.getElementById('statusBox');
const committeeForm = document.getElementById('committeeForm');
const committeeList = document.getElementById('committeeList');

function headers(extra = {}) {
  return { ...extra, 'X-KRWMP-User': currentUser?.identifier || currentUser?.username || currentUser?.name || 'system', 'X-KRWMP-Role': currentUser?.role_name || currentUser?.role || '' };
}

function showStatus(message, error = false) {
  statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`;
  statusBox.textContent = message;
  statusBox.classList.remove('hidden');
}

async function json(url, options = {}) {
  options.headers = headers(options.headers || {});
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed');
  return data;
}

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

function applyPermissions() {
  if (canManage) document.getElementById('writePanel').classList.remove('hidden');
  document.querySelectorAll('.manage-actions').forEach(el => el.classList.toggle('hidden', !canManage));
}

async function loadCommittees() {
  committeeList.innerHTML = '<p class="text-sm text-slate-400">Loading VWMC records...</p>';
  const data = await json('/api/vwmc/committees');
  committeeList.innerHTML = '';
  if (!data.committees?.length) {
    committeeList.innerHTML = '<p class="text-sm text-slate-400">No VWMC records found.</p>';
    return;
  }
  data.committees.forEach(renderCommittee);
  applyPermissions();
}

function renderCommittee(c) {
  const node = document.getElementById('committeeTemplate').content.cloneNode(true);
  node.querySelector('[data-field="name"]').textContent = `${c.committee_name} (${c.committee_code})`;
  node.querySelector('[data-field="meta"]').textContent = `${c.village_name || '-'} | ${c.gnd_name || '-'} | ${c.dsd_name || '-'} | ${c.latitude || '-'}, ${c.longitude || '-'} | ${c.status}`;
  node.querySelector('[data-field="audit"]').textContent = `Created by ${c.created_by || '-'} on ${formatDate(c.created_at)} | Updated by ${c.updated_by || '-'} on ${formatDate(c.updated_at)}`;

  const membersBox = node.querySelector('[data-field="members"]');
  (c.members || []).forEach(m => {
    const row = document.createElement('div');
    row.className = 'bg-slate-900/70 border border-slate-800 rounded p-2 text-xs text-slate-300';
    row.innerHTML = `<div class="font-bold text-slate-100">${escapeHtml(m.member_name)} <span class="text-emerald-400">${escapeHtml(m.role_in_committee || '')}</span></div><div>${escapeHtml(m.member_type || '')} | ${escapeHtml(m.organization || '')} | ${escapeHtml(m.designation || '')}</div><div>${escapeHtml(m.phone || '-')} | ${escapeHtml(m.email || '-')}</div><div class="text-[10px] text-slate-600">Updated by ${escapeHtml(m.updated_by || '-')} on ${formatDate(m.updated_at)}</div>${canManage ? `<div class="mt-1 flex gap-3"><button data-member-edit="${m.id}" class="text-emerald-400 hover:text-emerald-300">Edit Member</button><button data-member-delete="${m.id}" class="text-rose-400 hover:text-rose-300">Delete Member</button></div>` : ''}`;
    membersBox.appendChild(row);
  });
  if (!(c.members || []).length) membersBox.innerHTML = '<p class="text-xs text-slate-500">No members recorded.</p>';

  node.querySelector('[data-action="edit"]').addEventListener('click', () => fillCommitteeForm(c));
  node.querySelector('[data-action="delete"]').addEventListener('click', async () => deleteCommittee(c.id));

  const memberForm = node.querySelector('.member-form');
  memberForm.committee_id.value = c.id;
  memberForm.dataset.editMemberId = '';
  memberForm.addEventListener('submit', async e => saveMember(e, c.id));

  committeeList.appendChild(node);

  document.querySelectorAll('[data-member-delete]').forEach(btn => btn.onclick = async e => deleteMember(e.target.dataset.memberDelete));
  document.querySelectorAll('[data-member-edit]').forEach(btn => btn.onclick = e => {
    const memberId = Number(e.target.dataset.memberEdit);
    const member = (c.members || []).find(item => Number(item.id) === memberId);
    if (member) fillMemberForm(memberForm, member);
  });
}

function fillCommitteeForm(c) {
  committeeForm.id.value = c.id;
  committeeForm.committee_name.value = c.committee_name || '';
  committeeForm.village_name.value = c.village_name || '';
  committeeForm.dsd_name.value = c.dsd_name || '';
  committeeForm.gnd_name.value = c.gnd_name || '';
  committeeForm.address.value = c.address || '';
  committeeForm.latitude.value = c.latitude || '';
  committeeForm.longitude.value = c.longitude || '';
  committeeForm.status.value = c.status || 'active';
  committeeForm.remarks.value = c.remarks || '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillMemberForm(form, m) {
  form.dataset.editMemberId = m.id;
  form.member_name.value = m.member_name || '';
  form.member_type.value = m.member_type || 'village_representative';
  form.organization.value = m.organization || '';
  form.designation.value = m.designation || '';
  form.phone.value = m.phone || '';
  form.email.value = m.email || '';
  form.role_in_committee.value = m.role_in_committee || '';
  showStatus('Member loaded for editing. Update details and click Save Member.');
}

committeeForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!canManage) return showStatus('You have view-only permission.', true);
  const body = Object.fromEntries(new FormData(committeeForm));
  const id = body.id;
  delete body.id;
  try {
    if (id) {
      await json(`/api/vwmc/committees/${id}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      showStatus('VWMC updated successfully.');
    } else {
      await json('/api/vwmc/committees', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      showStatus('VWMC created successfully.');
    }
    committeeForm.reset();
    await loadCommittees();
  } catch (error) { showStatus(error.message, true); }
});

async function saveMember(event, committeeId) {
  event.preventDefault();
  if (!canManage) return showStatus('You have view-only permission.', true);
  const form = event.target;
  const body = Object.fromEntries(new FormData(form));
  delete body.committee_id;
  const editMemberId = form.dataset.editMemberId;
  try {
    if (editMemberId) {
      await json(`/api/vwmc/members/${editMemberId}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      showStatus('Member updated successfully.');
    } else {
      await json(`/api/vwmc/committees/${committeeId}/members`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
      showStatus('Member added successfully.');
    }
    form.reset();
    form.dataset.editMemberId = '';
    await loadCommittees();
  } catch (error) { showStatus(error.message, true); }
}

async function deleteCommittee(id) {
  if (!canManage) return;
  if (!confirm('Delete this VWMC and all its members?')) return;
  try { await json(`/api/vwmc/committees/${id}`, { method: 'DELETE' }); showStatus('VWMC deleted.'); await loadCommittees(); } catch (e) { showStatus(e.message, true); }
}

async function deleteMember(id) {
  if (!canManage) return;
  if (!confirm('Delete this member?')) return;
  try { await json(`/api/vwmc/members/${id}`, { method: 'DELETE' }); showStatus('Member deleted.'); await loadCommittees(); } catch (e) { showStatus(e.message, true); }
}

document.getElementById('useLocationBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return showStatus('Geolocation is not available.', true);
  navigator.geolocation.getCurrentPosition(pos => {
    document.getElementById('latitudeInput').value = pos.coords.latitude.toFixed(7);
    document.getElementById('longitudeInput').value = pos.coords.longitude.toFixed(7);
    showStatus('Current location captured.');
  }, () => showStatus('Unable to capture current location.', true));
});

document.getElementById('resetCommitteeBtn').addEventListener('click', () => committeeForm.reset());
document.getElementById('refreshBtn').addEventListener('click', loadCommittees);
function formatDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
(async () => { await initSidebar(); applyPermissions(); await loadCommittees(); })().catch(e => showStatus(e.message, true));