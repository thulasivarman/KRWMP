const currentUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const currentRole = String(currentUser?.role_name || currentUser?.role || '').toLowerCase();
const canManage = currentRole === 'admin' || currentRole === 'data_collectors' || currentRole === 'data_collector';
const statusBox = document.getElementById('statusBox');
const committeeForm = document.getElementById('committeeForm');
const committeeList = document.getElementById('committeeList');
let committees = [];
let currentPage = 1;
const pageSize = 5;

function headers(extra = {}) { return { ...extra, 'X-KRWMP-User': currentUser?.identifier || currentUser?.username || currentUser?.name || 'system', 'X-KRWMP-Role': currentUser?.role_name || currentUser?.role || '' }; }
function showStatus(message, error = false) { statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`; statusBox.textContent = message; statusBox.classList.remove('hidden'); }
async function json(url, options = {}) { options.headers = headers(options.headers || {}); const response = await fetch(url, options); const data = await response.json().catch(() => ({})); if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed'); return data; }
async function initSidebar() { if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar'); document.querySelector('.krwmp-panel-section')?.classList.add('hidden'); document.getElementById('section-data-layers')?.classList.add('hidden'); document.getElementById('section-raster-layers')?.classList.add('hidden'); }
function applyPermissions() { if (canManage) document.getElementById('writePanel').classList.remove('hidden'); document.querySelectorAll('.manage-actions').forEach(el => el.classList.toggle('hidden', !canManage)); }
function totalPages() { return Math.max(1, Math.ceil(committees.length / pageSize)); }
function visibleCommittees() { const start = (currentPage - 1) * pageSize; return committees.slice(start, start + pageSize); }

async function loadCommittees() {
  committeeList.innerHTML = '<p class="text-sm text-slate-400">Loading VWMC records...</p>';
  const data = await json('/api/vwmc/committees');
  committees = data.committees || [];
  if (currentPage > totalPages()) currentPage = totalPages();
  renderCommittees();
}

function renderCommittees() {
  committeeList.innerHTML = '';
  if (!committees.length) { committeeList.innerHTML = '<p class="text-sm text-slate-400">No VWMC records found.</p>'; return; }
  visibleCommittees().forEach(renderCommittee);
  renderPagination();
  applyPermissions();
}

function renderCommittee(c) {
  const article = document.createElement('article');
  article.className = 'bg-slate-950/60 border border-slate-800 rounded-lg overflow-hidden';
  const membersHtml = (c.members || []).length ? (c.members || []).map(m => `<div class="bg-slate-900/70 border border-slate-800 rounded p-2 text-xs text-slate-300"><div class="font-bold text-slate-100">${escapeHtml(m.member_name)} <span class="text-emerald-400">${escapeHtml(m.role_in_committee || '')}</span></div><div>${escapeHtml(m.member_type || '')} | ${escapeHtml(m.organization || '')} | ${escapeHtml(m.designation || '')}</div><div>${escapeHtml(m.phone || '-')} | ${escapeHtml(m.email || '-')}</div><div class="text-[10px] text-slate-600">Updated by ${escapeHtml(m.updated_by || '-')} on ${formatDate(m.updated_at)}</div>${canManage ? `<div class="mt-1 flex gap-3"><button data-member-edit="${m.id}" class="text-emerald-400 hover:text-emerald-300">Edit Member</button><button data-member-delete="${m.id}" class="text-rose-400 hover:text-rose-300">Delete Member</button></div>` : ''}</div>`).join('') : '<p class="text-xs text-slate-500">No members recorded.</p>';
  article.innerHTML = `<button type="button" class="accordion-toggle w-full text-left p-4 flex justify-between gap-4 hover:bg-slate-900/70 transition"><div class="min-w-0"><h3 class="font-bold text-slate-100 truncate">${escapeHtml(c.committee_name)} (${escapeHtml(c.committee_code)})</h3><p class="text-xs text-slate-500 mt-1">${escapeHtml(c.village_name || '-')} | ${escapeHtml(c.gnd_name || '-')} | ${escapeHtml(c.dsd_name || '-')} | Members: ${(c.members || []).length} | ${escapeHtml(c.status || '-')}</p><p class="text-[10px] text-slate-600 mt-1">Created by ${escapeHtml(c.created_by || '-')} on ${formatDate(c.created_at)} | Updated by ${escapeHtml(c.updated_by || '-')} on ${formatDate(c.updated_at)}</p></div><span class="text-slate-500 text-lg accordion-icon">+</span></button><div class="accordion-body hidden border-t border-slate-800 p-4 grid grid-cols-1 lg:grid-cols-2 gap-4"><div><h4 class="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-2">Members</h4><div class="space-y-2 members-box">${membersHtml}</div><div class="manage-actions hidden mt-3 flex gap-2"><button data-action="edit" class="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-xs font-bold">Edit Committee</button><button data-action="delete" class="bg-rose-700 hover:bg-rose-600 px-3 py-1.5 rounded text-xs font-bold">Delete Committee</button></div></div><form class="member-form manage-actions hidden bg-slate-900/70 border border-slate-800 rounded-lg p-3 grid grid-cols-1 md:grid-cols-2 gap-2"><input type="hidden" name="committee_id" value="${c.id}"><input name="member_name" required placeholder="Member name" class="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><select name="member_type" class="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><option value="government_representative">Government Representative</option><option value="village_representative">Village Representative</option></select><input name="organization" placeholder="Institute / Organization" class="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="designation" placeholder="Designation" class="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="phone" placeholder="Contact No" class="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="email" placeholder="Email" class="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="role_in_committee" placeholder="Committee role" class="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><button class="bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm font-bold">Save Member</button></form></div>`;
  committeeList.appendChild(article);
  const body = article.querySelector('.accordion-body');
  const icon = article.querySelector('.accordion-icon');
  article.querySelector('.accordion-toggle').addEventListener('click', () => { body.classList.toggle('hidden'); icon.textContent = body.classList.contains('hidden') ? '+' : '−'; });
  article.querySelector('[data-action="edit"]')?.addEventListener('click', () => fillCommitteeForm(c));
  article.querySelector('[data-action="delete"]')?.addEventListener('click', () => deleteCommittee(c.id));
  const memberForm = article.querySelector('.member-form');
  memberForm.dataset.editMemberId = '';
  memberForm.addEventListener('submit', e => saveMember(e, c.id));
  article.querySelectorAll('[data-member-delete]').forEach(btn => btn.addEventListener('click', e => deleteMember(e.target.dataset.memberDelete)));
  article.querySelectorAll('[data-member-edit]').forEach(btn => btn.addEventListener('click', e => { const member = (c.members || []).find(item => String(item.id) === String(e.target.dataset.memberEdit)); if (member) fillMemberForm(memberForm, member); }));
}

function renderPagination() {
  const total = totalPages();
  const pager = document.createElement('div');
  pager.className = 'flex items-center justify-between border-t border-slate-800 pt-4 mt-4 text-xs text-slate-400';
  pager.innerHTML = `<div>Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, committees.length)} of ${committees.length} VWMC records</div><div class="flex items-center gap-2"><button id="prevVwmcPage" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${currentPage} of ${total}</span><button id="nextVwmcPage" class="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-3 py-1.5 rounded font-bold" ${currentPage === total ? 'disabled' : ''}>Next</button></div>`;
  committeeList.appendChild(pager);
  pager.querySelector('#prevVwmcPage')?.addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderCommittees(); });
  pager.querySelector('#nextVwmcPage')?.addEventListener('click', () => { currentPage = Math.min(total, currentPage + 1); renderCommittees(); });
}

function fillCommitteeForm(c) { committeeForm.id.value = c.id; committeeForm.committee_name.value = c.committee_name || ''; committeeForm.village_name.value = c.village_name || ''; committeeForm.dsd_name.value = c.dsd_name || ''; committeeForm.gnd_name.value = c.gnd_name || ''; committeeForm.address.value = c.address || ''; committeeForm.latitude.value = c.latitude || ''; committeeForm.longitude.value = c.longitude || ''; committeeForm.status.value = c.status || 'active'; committeeForm.remarks.value = c.remarks || ''; window.scrollTo({ top: 0, behavior: 'smooth' }); }
function fillMemberForm(form, m) { form.dataset.editMemberId = m.id; form.member_name.value = m.member_name || ''; form.member_type.value = m.member_type || 'village_representative'; form.organization.value = m.organization || ''; form.designation.value = m.designation || ''; form.phone.value = m.phone || ''; form.email.value = m.email || ''; form.role_in_committee.value = m.role_in_committee || ''; showStatus('Member loaded for editing. Update details and click Save Member.'); }

committeeForm.addEventListener('submit', async e => { e.preventDefault(); if (!canManage) return showStatus('You have view-only permission.', true); const body = Object.fromEntries(new FormData(committeeForm)); const id = body.id; delete body.id; try { if (id) { await json(`/api/vwmc/committees/${id}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); showStatus('VWMC updated successfully.'); } else { await json('/api/vwmc/committees', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); showStatus('VWMC created successfully.'); } committeeForm.reset(); await loadCommittees(); } catch (error) { showStatus(error.message, true); } });
async function saveMember(event, committeeId) { event.preventDefault(); if (!canManage) return showStatus('You have view-only permission.', true); const form = event.target; const body = Object.fromEntries(new FormData(form)); delete body.committee_id; const editMemberId = form.dataset.editMemberId; try { if (editMemberId) { await json(`/api/vwmc/members/${editMemberId}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); showStatus('Member updated successfully.'); } else { await json(`/api/vwmc/committees/${committeeId}/members`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); showStatus('Member added successfully.'); } form.reset(); form.dataset.editMemberId = ''; await loadCommittees(); } catch (error) { showStatus(error.message, true); } }
async function deleteCommittee(id) { if (!canManage) return; if (!confirm('Delete this VWMC and all its members?')) return; try { await json(`/api/vwmc/committees/${id}`, { method: 'DELETE' }); showStatus('VWMC deleted.'); await loadCommittees(); } catch (e) { showStatus(e.message, true); } }
async function deleteMember(id) { if (!canManage) return; if (!confirm('Delete this member?')) return; try { await json(`/api/vwmc/members/${id}`, { method: 'DELETE' }); showStatus('Member deleted.'); await loadCommittees(); } catch (e) { showStatus(e.message, true); } }

document.getElementById('useLocationBtn').addEventListener('click', () => { if (!navigator.geolocation) return showStatus('Geolocation is not available.', true); navigator.geolocation.getCurrentPosition(pos => { document.getElementById('latitudeInput').value = pos.coords.latitude.toFixed(7); document.getElementById('longitudeInput').value = pos.coords.longitude.toFixed(7); showStatus('Current location captured.'); }, () => showStatus('Unable to capture current location.', true)); });
document.getElementById('resetCommitteeBtn').addEventListener('click', () => committeeForm.reset());
document.getElementById('refreshBtn').addEventListener('click', loadCommittees);
function formatDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString(); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
(async () => { await initSidebar(); applyPermissions(); await loadCommittees(); })().catch(e => showStatus(e.message, true));