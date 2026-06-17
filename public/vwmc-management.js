let canManage = false;
const statusBox = document.getElementById('statusBox');
const committeeForm = document.getElementById('committeeForm');
const committeeList = document.getElementById('committeeList');
const dsdSelect = document.getElementById('vwmcDsdSelect');
const gndSelect = document.getElementById('vwmcGndSelect');
let committees = [];
let currentPage = 1;
const pageSize = 5;
let vwmcLocationPicker = null;
let subWatershedIdInput = null;
let subWatershedNameInput = null;
let subWatershedDisplay = null;

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;
function showStatus(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
async function initSidebar() { if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar'); await window.KRWMP_PRIVILEGES.protectPage('vwmc_view', 'view'); canManage = window.KRWMP_PRIVILEGES.can('vwmc_management', 'create') || window.KRWMP_PRIVILEGES.can('vwmc_management', 'update') || window.KRWMP_PRIVILEGES.can('vwmc_management', 'delete'); document.querySelector('.krwmp-panel-section')?.classList.add('hidden'); document.getElementById('section-data-layers')?.classList.add('hidden'); document.getElementById('section-raster-layers')?.classList.add('hidden'); }
function applyPermissions() { if (canManage) document.getElementById('writePanel').classList.remove('hidden'); document.querySelectorAll('.manage-actions').forEach(el => el.classList.toggle('hidden', !canManage)); if (vwmcLocationPicker) vwmcLocationPicker.refresh(); }
function totalPages() { return Math.max(1, Math.ceil(committees.length / pageSize)); }
function visibleCommittees() { const start = (currentPage - 1) * pageSize; return committees.slice(start, start + pageSize); }

function ensureSpatialFields() {
  if (!committeeForm) return;
  subWatershedIdInput = committeeForm.querySelector('[name="sub_watershed_id"]') || document.createElement('input');
  subWatershedIdInput.type = 'hidden';
  subWatershedIdInput.name = 'sub_watershed_id';
  if (!subWatershedIdInput.parentElement) committeeForm.appendChild(subWatershedIdInput);
  subWatershedNameInput = committeeForm.querySelector('[name="sub_watershed_name"]') || document.createElement('input');
  subWatershedNameInput.type = 'hidden';
  subWatershedNameInput.name = 'sub_watershed_name';
  if (!subWatershedNameInput.parentElement) committeeForm.appendChild(subWatershedNameInput);
  const picker = document.getElementById('vwmcLocationPicker');
  if (picker && !document.getElementById('autoSpatialDisplay')) {
    const box = document.createElement('div');
    box.id = 'autoSpatialDisplay';
    box.className = 'grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 border-t border-slate-800 pt-3';
    box.innerHTML = '<div class="krwmp-identify-panel"><div class="krwmp-stat-label">DS Division</div><div id="autoDsdText" class="text-slate-200 mt-1">Not detected</div></div><div class="krwmp-identify-panel"><div class="krwmp-stat-label">GN Division</div><div id="autoGndText" class="text-slate-200 mt-1">Not detected</div></div><div class="krwmp-identify-panel"><div class="krwmp-stat-label">Sub Watershed</div><div id="autoSubText" class="text-slate-200 mt-1">Pending upload</div></div>';
    picker.appendChild(box);
  }
  subWatershedDisplay = document.getElementById('autoSubText');
}

function setSelectValue(select, value) {
  if (!select) return;
  const text = String(value || '').trim();
  if (!text) { select.value = ''; return; }
  let option = Array.from(select.options).find(o => o.value === text || o.textContent === text);
  if (!option) {
    option = document.createElement('option');
    option.value = text;
    option.textContent = text;
    select.appendChild(option);
  }
  select.value = option.value;
}

async function identifySelectedLocation(point) {
  if (!point || point.cleared) {
    setSelectValue(dsdSelect, '');
    setSelectValue(gndSelect, '');
    if (subWatershedIdInput) subWatershedIdInput.value = '';
    if (subWatershedNameInput) subWatershedNameInput.value = '';
    document.getElementById('autoDsdText').textContent = 'Not detected';
    document.getElementById('autoGndText').textContent = 'Not detected';
    if (subWatershedDisplay) subWatershedDisplay.textContent = 'Pending upload';
    return;
  }
  try {
    const data = await json(`/api/spatial/identify?lat=${encodeURIComponent(point.latitude)}&lng=${encodeURIComponent(point.longitude)}`);
    const dsdName = data.dsd?.dsd_name || '';
    const gndName = data.gnd?.gnd_name || '';
    if (dsdName) {
      await loadDsds(dsdName);
      await loadGnds(dsdName, gndName);
    }
    setSelectValue(dsdSelect, dsdName);
    setSelectValue(gndSelect, gndName);
    if (subWatershedIdInput) subWatershedIdInput.value = data.sub_watershed?.id || '';
    if (subWatershedNameInput) subWatershedNameInput.value = data.sub_watershed?.name || '';
    document.getElementById('autoDsdText').textContent = dsdName || 'Not detected';
    document.getElementById('autoGndText').textContent = gndName || 'Not detected';
    if (subWatershedDisplay) subWatershedDisplay.textContent = data.sub_watershed?.name || 'Pending upload';
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
  if (name.length < 5 || name.length > 150) errors.push('VWMC Name must be 5–150 characters.');
  if (!namePattern.test(name)) errors.push('VWMC Name contains unsupported characters.');
  if (village.length < 3) errors.push('Village name is required and must be at least 3 characters.');
  if (!committeeForm.dsd_name.value) errors.push('Please select a map location inside a DSD.');
  if (!committeeForm.gnd_name.value) errors.push('Please select a map location inside a GND.');
  if (!Number.isFinite(lat) || lat < 5 || lat > 10) errors.push('Please select a valid latitude on the map.');
  if (!Number.isFinite(lng) || lng < 78 || lng > 82) errors.push('Please select a valid longitude on the map.');
  if (errors.length) { showStatus(errors.join(' '), true); return false; }
  return true;
}

function validateMemberForm(form) {
  const errors = [];
  const name = form.member_name.value.trim();
  const phone = form.phone.value.trim();
  const email = form.email.value.trim();
  if (name.length < 3) errors.push('Member name must be at least 3 characters.');
  if (phone && !/^(?:\+94|0)?7[0-9]{8}$/.test(phone)) errors.push('Enter a valid Sri Lankan mobile number.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Enter a valid email address.');
  if (errors.length) { showStatus(errors.join(' '), true); return false; }
  return true;
}

async function loadDsds(selected = '') { const data = await json('/api/vwmc/lookups/dsds'); dsdSelect.innerHTML = '<option value="">Select DSD</option>'; (data.dsds || []).forEach(row => { const option = document.createElement('option'); option.value = row.dsd_name; option.textContent = row.dsd_name; if (row.dsd_name === selected) option.selected = true; dsdSelect.appendChild(option); }); }
async function loadGnds(dsdName = '', selected = '') { gndSelect.innerHTML = '<option value="">Loading GNDs...</option>'; const url = dsdName ? `/api/vwmc/lookups/gnds?dsd_name=${encodeURIComponent(dsdName)}` : '/api/vwmc/lookups/gnds'; const data = await json(url); gndSelect.innerHTML = '<option value="">Select GND</option>'; (data.gnds || []).forEach(row => { const option = document.createElement('option'); option.value = row.gnd_name; option.textContent = row.gnd_name; if (row.gnd_name === selected) option.selected = true; gndSelect.appendChild(option); }); }

async function loadCommittees() { committeeList.innerHTML = '<div class="krwmp-loading-state">Loading VWMC records...</div>'; const data = await json('/api/vwmc/committees'); committees = data.committees || []; if (currentPage > totalPages()) currentPage = totalPages(); renderCommittees(); }
function renderCommittees() { committeeList.innerHTML = ''; if (!committees.length) { committeeList.innerHTML = '<div class="krwmp-empty-state">No VWMC records found.</div>'; return; } visibleCommittees().forEach(renderCommittee); renderPagination(); applyPermissions(); }
function renderCommittee(c) { const article = document.createElement('article'); article.className = 'krwmp-card overflow-hidden p-0'; const locationText = c.latitude && c.longitude ? `${Number(c.latitude).toFixed(6)}, ${Number(c.longitude).toFixed(6)}` : 'No location'; const watershedText = c.sub_watershed_name ? ` | Sub Watershed: ${escapeHtml(c.sub_watershed_name)}` : ''; const membersHtml = (c.members || []).length ? (c.members || []).map(m => `<div class="krwmp-card-muted p-2 text-xs text-slate-300"><div class="font-bold text-slate-100">${escapeHtml(m.member_name)} <span class="text-emerald-400">${escapeHtml(m.role_in_committee || '')}</span></div><div>${escapeHtml(m.member_type || '')} | ${escapeHtml(m.organization || '')} | ${escapeHtml(m.designation || '')}</div><div>${escapeHtml(m.phone || '-')} | ${escapeHtml(m.email || '-')}</div><div class="text-[10px] text-slate-600">Updated by ${escapeHtml(m.updated_by || '-')} on ${formatDate(m.updated_at)}</div>${canManage ? `<div class="mt-1 krwmp-table-actions"><button data-member-edit="${m.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit Member</button><button data-member-delete="${m.id}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm">Delete Member</button></div>` : ''}</div>`).join('') : '<div class="krwmp-empty-state">No members recorded.</div>'; article.innerHTML = `<button type="button" class="accordion-toggle w-full text-left p-4 flex justify-between gap-4 hover:bg-slate-900/70 transition"><div class="min-w-0"><h3 class="font-bold text-slate-100 truncate">${escapeHtml(c.committee_name)} (${escapeHtml(c.committee_code)})</h3><p class="text-xs text-slate-500 mt-1">${escapeHtml(c.village_name || '-')} | ${escapeHtml(c.gnd_name || '-')} | ${escapeHtml(c.dsd_name || '-')} | Members: ${(c.members || []).length} | ${escapeHtml(c.status || '-')}${watershedText}</p><p class="text-[10px] text-slate-600 mt-1">Location: ${escapeHtml(locationText)} | Created by ${escapeHtml(c.created_by || '-')} on ${formatDate(c.created_at)} | Updated by ${escapeHtml(c.updated_by || '-')} on ${formatDate(c.updated_at)}</p></div><span class="text-slate-500 text-lg accordion-icon">+</span></button><div class="accordion-body hidden border-t border-slate-800 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div><h4 class="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-2">Members</h4><div class="space-y-2 members-box">${membersHtml}</div><div class="manage-actions hidden mt-3 krwmp-table-actions"><button data-action="edit"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit Committee</button><button data-action="delete"  class="krwmp-btn krwmp-btn-danger krwmp-btn-sm">Delete Committee</button></div></div><form class="member-form manage-actions hidden krwmp-card-muted p-3 grid grid-cols-1 md:grid-cols-2 gap-2"><input type="hidden" name="committee_id" value="${c.id}"><input name="member_name" required minlength="3" placeholder="Member name"  class="krwmp-input"><select name="member_type"  class="krwmp-select"><option value="government_representative">Government Representative</option><option value="village_representative">Village Representative</option></select><input name="organization" placeholder="Institute / Organization"  class="krwmp-input"><input name="designation" placeholder="Designation"  class="krwmp-input"><input name="phone" placeholder="Contact No"  class="krwmp-input"><input name="email" type="email" placeholder="Email"  class="krwmp-input"><input name="role_in_committee" placeholder="Committee role"  class="krwmp-input"><button  class="krwmp-btn krwmp-btn-primary">Save Member</button></form></div>`; committeeList.appendChild(article); const body = article.querySelector('.accordion-body'); const icon = article.querySelector('.accordion-icon'); article.querySelector('.accordion-toggle').addEventListener('click', () => { body.classList.toggle('hidden'); icon.textContent = body.classList.contains('hidden') ? '+' : '−'; }); article.querySelector('[data-action="edit"]')?.addEventListener('click', () => fillCommitteeForm(c)); article.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteCommittee(c.id)); const memberForm = article.querySelector('.member-form'); memberForm.dataset.editMemberId = ''; memberForm.addEventListener('submit', e => saveMember(e, c.id)); article.querySelectorAll('[data-member-delete]').forEach(btn => btn.addEventListener('click', e => deleteMember(e.target.dataset.memberDelete))); article.querySelectorAll('[data-member-edit]').forEach(btn => btn.addEventListener('click', e => { const member = (c.members || []).find(item => String(item.id) === String(e.target.dataset.memberEdit)); if (member) fillMemberForm(memberForm, member); })); }
function renderPagination() { const total = totalPages(); const pager = document.createElement('div'); pager.className = 'krwmp-pagination'; pager.innerHTML = `<span class="krwmp-pagination-meta">Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, committees.length)} of ${committees.length} VWMC records</span><div class="krwmp-pagination-controls"><button id="prevVwmcPage"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${total}</span><button id="nextVwmcPage"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${currentPage === total ? 'disabled' : ''}>Next</button></div>`; committeeList.appendChild(pager); pager.querySelector('#prevVwmcPage')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderCommittees(); }); pager.querySelector('#nextVwmcPage')?.addEventListener('click', () => { currentPage = Math.min(total, currentPage + 1); renderCommittees(); }); }
async function fillCommitteeForm(c) { committeeForm.id.value = c.id; committeeForm.committee_name.value = c.committee_name || ''; committeeForm.village_name.value = c.village_name || ''; await loadDsds(c.dsd_name || ''); await loadGnds(c.dsd_name || '', c.gnd_name || ''); committeeForm.address.value = c.address || ''; committeeForm.latitude.value = c.latitude || ''; committeeForm.longitude.value = c.longitude || ''; if (subWatershedIdInput) subWatershedIdInput.value = c.sub_watershed_id || ''; if (subWatershedNameInput) subWatershedNameInput.value = c.sub_watershed_name || ''; if (subWatershedDisplay) subWatershedDisplay.textContent = c.sub_watershed_name || 'Pending upload'; if (vwmcLocationPicker && c.latitude && c.longitude) vwmcLocationPicker.setLocation(c.latitude, c.longitude, true); committeeForm.status.value = c.status || 'active'; committeeForm.remarks.value = c.remarks || ''; window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => vwmcLocationPicker?.refresh(), 250); }
function fillMemberForm(form, m) { form.dataset.editMemberId = m.id; form.member_name.value = m.member_name || ''; form.member_type.value = m.member_type || 'village_representative'; form.organization.value = m.organization || ''; form.designation.value = m.designation || ''; form.phone.value = m.phone || ''; form.email.value = m.email || ''; form.role_in_committee.value = m.role_in_committee || ''; showStatus('Member loaded for editing. Update details and click Save Member.'); }
committeeForm.addEventListener('submit', async e => { e.preventDefault(); if (!validateCommitteeForm()) return; const body = Object.fromEntries(new FormData(committeeForm)); const id = body.id; delete body.id; if (id && !window.KRWMP_PRIVILEGES.can('vwmc_management','update')) return showStatus('You do not have update access for VWMC records.', true); if (!id && !window.KRWMP_PRIVILEGES.can('vwmc_management','create')) return showStatus('You do not have create access for VWMC records.', true); try { if (id) { await json(`/api/vwmc/committees/${id}`, { method: 'PUT', body }); showStatus('VWMC updated successfully.'); } else { await json('/api/vwmc/committees', { method: 'POST', body }); showStatus('VWMC created successfully.'); } committeeForm.reset(); vwmcLocationPicker?.clear(); await loadGnds(''); await loadCommittees(); } catch (error) { showStatus(error.message, true); } });
async function saveMember(event, committeeId) { event.preventDefault(); const form = event.target; if (!validateMemberForm(form)) return; const body = Object.fromEntries(new FormData(form)); delete body.committee_id; const editMemberId = form.dataset.editMemberId; if (editMemberId && !window.KRWMP_PRIVILEGES.can('vwmc_management','update')) return showStatus('You do not have update access for VWMC members.', true); if (!editMemberId && !window.KRWMP_PRIVILEGES.can('vwmc_management','create')) return showStatus('You do not have create access for VWMC members.', true); try { if (editMemberId) { await json(`/api/vwmc/members/${editMemberId}`, { method: 'PUT', body }); showStatus('Member updated successfully.'); } else { await json(`/api/vwmc/committees/${committeeId}/members`, { method: 'POST', body }); showStatus('Member added successfully.'); } form.reset(); form.dataset.editMemberId = ''; await loadCommittees(); } catch (error) { showStatus(error.message, true); } }
async function deleteCommittee(id) { if (!window.KRWMP_PRIVILEGES.can('vwmc_management','delete')) return showStatus('You do not have delete access for VWMC records.', true); if (!confirm('Delete this VWMC and all its members?')) return; try { await json(`/api/vwmc/committees/${id}`, { method: 'DELETE' }); showStatus('VWMC deleted.'); await loadCommittees(); } catch (e) { showStatus(e.message, true); } }
async function deleteMember(id) { if (!window.KRWMP_PRIVILEGES.can('vwmc_management','delete')) return showStatus('You do not have delete access for VWMC members.', true); if (!confirm('Delete this member?')) return; try { await json(`/api/vwmc/members/${id}`, { method: 'DELETE' }); showStatus('Member deleted.'); await loadCommittees(); } catch (e) { showStatus(e.message, true); } }
dsdSelect.addEventListener('change', () => loadGnds(dsdSelect.value));
document.getElementById('resetCommitteeBtn').addEventListener('click', () => { committeeForm.reset(); vwmcLocationPicker?.clear(); loadGnds(''); });
document.getElementById('refreshBtn').addEventListener('click', loadCommittees);
function formatDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(); }
(async () => { await initSidebar(); ensureSpatialFields(); vwmcLocationPicker = new KRWMPLocationPicker({ containerId: 'vwmcLocationPicker', latitudeInput: '#latitudeInput', longitudeInput: '#longitudeInput', initialCenter: [80.2280810, 7.2334995], initialZoom: 11, onChange: identifySelectedLocation }); await loadDsds(); await loadGnds(''); applyPermissions(); await loadCommittees(); })().catch(e => showStatus(e.message, true));
