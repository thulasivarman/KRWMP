const user = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const role = String(user?.role_name || user?.role || '').toLowerCase();
const canManage = role === 'admin' || role === 'officer' || role === 'officers';
const statusBox = document.getElementById('statusBox');
const form = document.getElementById('registryForm');
const list = document.getElementById('registryList');
const librarySelect = document.getElementById('librarySelect');
const dsdSelect = document.getElementById('dsdSelect');
const gndSelect = document.getElementById('gndSelect');
const institutionSelect = document.getElementById('institutionSelect');

function headers(extra = {}) { return { ...extra, 'X-KRWMP-User': user?.identifier || user?.username || user?.name || 'system', 'X-KRWMP-Role': user?.role_name || user?.role || '' }; }
function show(message, error = false) { statusBox.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`; statusBox.textContent = message; statusBox.classList.remove('hidden'); }
async function json(url, options = {}) { options.headers = headers(options.headers || {}); const r = await fetch(url, options); const d = await r.json().catch(() => ({})); if (!r.ok || d.success === false) throw new Error(d.message || 'Request failed'); return d; }
async function initSidebar() { if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html','sidebar'); document.querySelector('.krwmp-panel-section')?.classList.add('hidden'); document.getElementById('section-data-layers')?.classList.add('hidden'); document.getElementById('section-raster-layers')?.classList.add('hidden'); }
function applyPermissions() { if (canManage) document.getElementById('writePanel').classList.remove('hidden'); document.querySelectorAll('.manage-actions').forEach(el => el.classList.toggle('hidden', !canManage)); }

function applyDateFieldIcons() {
  document.querySelectorAll('input[type="date"]').forEach(input => {
    if (input.dataset.calendarIconApplied === 'true') return;
    input.dataset.calendarIconApplied = 'true';
    input.classList.add('calendar-date-input');
    if (!input.parentElement.classList.contains('calendar-field')) {
      const wrapper = document.createElement('span');
      wrapper.className = 'calendar-field block relative mt-1';
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
    }
  });
  if (!document.getElementById('calendarFieldStyle')) {
    const style = document.createElement('style');
    style.id = 'calendarFieldStyle';
    style.textContent = `.calendar-field::after{content:'📅';position:absolute;right:12px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:13px;opacity:.8}.calendar-date-input{padding-right:2.4rem!important;color-scheme:dark}.calendar-date-input::-webkit-calendar-picker-indicator{opacity:0;position:absolute;right:0;width:2.4rem;height:100%;cursor:pointer}`;
    document.head.appendChild(style);
  }
}

async function loadLibrary() { const data = await json('/api/interventions/library'); librarySelect.innerHTML = '<option value="">Select intervention type</option>'; (data.library || []).filter(i => i.active !== false).forEach(i => { const o = document.createElement('option'); o.value = i.id; o.textContent = i.intervention_name; librarySelect.appendChild(o); }); }
async function loadDsds(selected = '') { const data = await json('/api/interventions/lookups/dsds'); dsdSelect.innerHTML = '<option value="">Select DSD</option>'; (data.dsds || []).forEach(row => { const o = document.createElement('option'); o.value = row.dsd_name; o.textContent = row.dsd_name; if (row.dsd_name === selected) o.selected = true; dsdSelect.appendChild(o); }); }
async function loadGnds(dsdName = '', selected = '') { gndSelect.innerHTML = '<option value="">Loading GNDs...</option>'; const url = dsdName ? `/api/interventions/lookups/gnds?dsd_name=${encodeURIComponent(dsdName)}` : '/api/interventions/lookups/gnds'; const data = await json(url); gndSelect.innerHTML = '<option value="">Select GND</option>'; (data.gnds || []).forEach(row => { const o = document.createElement('option'); o.value = row.gnd_name; o.textContent = row.gnd_name; if (row.gnd_name === selected) o.selected = true; gndSelect.appendChild(o); }); }
async function loadInstitutions(selected = '') { const data = await json('/api/interventions/lookups/institutions'); institutionSelect.innerHTML = '<option value="">Select institution</option>'; (data.institutions || []).forEach(row => { const o = document.createElement('option'); o.value = row.institution_name; o.textContent = row.institution_name; if (row.institution_name === selected) o.selected = true; institutionSelect.appendChild(o); }); }

async function loadRegistry() { list.innerHTML = '<p class="text-sm text-slate-400">Loading interventions...</p>'; const data = await json('/api/interventions/registry'); list.innerHTML = ''; (data.interventions || []).forEach(renderIntervention); if (!list.children.length) list.innerHTML = '<p class="text-sm text-slate-400">No interventions registered.</p>'; applyPermissions(); applyDateFieldIcons(); }

function renderIntervention(item) {
  const card = document.createElement('article');
  card.className = 'bg-slate-950/60 border border-slate-800 rounded-lg p-4 space-y-4';
  const progress = Number(item.progress_percent || 0);
  card.innerHTML = `<div class="flex justify-between gap-4"><div><h3 class="font-bold text-slate-100">${escapeHtml(item.intervention_title)} (${escapeHtml(item.intervention_code)})</h3><p class="text-xs text-slate-500">${escapeHtml(item.library_name || '-')} · ${escapeHtml(item.status || '-')} · ${escapeHtml(item.priority || '-')} · ${escapeHtml(item.dsd_name || '-')} / ${escapeHtml(item.gnd_name || '-')}</p><p class="text-[10px] text-slate-600">Updated by ${escapeHtml(item.updated_by || '-')} on ${formatDate(item.updated_at)}</p></div><div class="manage-actions hidden flex gap-2"><button data-edit="${item.id}" class="bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded text-xs font-bold">Edit</button></div></div><div><div class="flex justify-between text-xs text-slate-400 mb-1"><span>Progress</span><strong>${progress}%</strong></div><div class="h-2 rounded bg-slate-800 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${Math.max(0, Math.min(100, progress))}%"></div></div></div><div class="grid grid-cols-1 lg:grid-cols-3 gap-4"><div><h4 class="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-2">Action Timeline</h4><div class="space-y-2">${timelineHtml(item.timeline || [])}</div></div><div><h4 class="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-2">Responsible Officers</h4><div class="space-y-2">${officerHtml(item.officers || [])}</div></div><div class="manage-actions hidden"><form class="action-officer-form bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2"><h4 class="text-xs uppercase tracking-widest text-emerald-400 font-bold">Action & Responsible Officer</h4><input type="date" name="action_date" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="action_title" required placeholder="Action title" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><textarea name="action_description" placeholder="Action details" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"></textarea><input name="progress_percent" type="number" min="0" max="100" placeholder="Progress %" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="officer_name" required placeholder="Responsible officer name" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="designation" placeholder="Designation" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><select name="institution" class="officer-institution-select w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm">${institutionOptions()}</select><input name="officer_contact" placeholder="Officer contact number" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><input name="responsibility" placeholder="Responsibility for this action" class="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm"><button class="w-full bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm font-bold">Save Action & Officer</button></form></div></div>`;
  list.appendChild(card);
  card.querySelector('[data-edit]')?.addEventListener('click', () => fillForm(item));
  card.querySelector('.action-officer-form')?.addEventListener('submit', e => saveActionWithOfficer(e, item.id));
}

function institutionOptions() { return Array.from(institutionSelect.options).map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.textContent)}</option>`).join(''); }
function timelineHtml(items) { if (!items.length) return '<p class="text-xs text-slate-500">No actions recorded.</p>'; return items.map(t => `<div class="bg-slate-900/70 border border-slate-800 rounded p-2 text-xs"><strong>${escapeHtml(t.action_title)}</strong><div>${escapeHtml(t.action_status || '')} · ${escapeHtml(t.progress_percent ?? '')}% · ${formatDate(t.action_date)}</div><div>${escapeHtml(t.action_description || '')}</div><div class="text-[10px] text-slate-500 mt-1">Officer: ${escapeHtml(t.officer_name || '-')} · ${escapeHtml(t.officer_contact || '-')}</div></div>`).join(''); }
function officerHtml(items) { if (!items.length) return '<p class="text-xs text-slate-500">No officers assigned.</p>'; return items.map(o => `<div class="bg-slate-900/70 border border-slate-800 rounded p-2 text-xs"><strong>${escapeHtml(o.officer_name)}</strong><div>${escapeHtml(o.designation || '')} · ${escapeHtml(o.institution || '')}</div><div>${escapeHtml(o.phone || '')} · ${escapeHtml(o.responsibility || '')}</div></div>`).join(''); }

async function fillForm(item) { form.id.value = item.id; form.library_id.value = item.library_id || ''; form.intervention_title.value = item.intervention_title || ''; form.location_name.value = item.location_name || ''; form.village_name.value = item.village_name || ''; await loadDsds(item.dsd_name || ''); await loadGnds(item.dsd_name || '', item.gnd_name || ''); form.latitude.value = item.latitude || ''; form.longitude.value = item.longitude || ''; form.priority.value = item.priority || 'medium'; form.status.value = item.status || 'planned'; form.progress_percent.value = item.progress_percent || 0; form.planned_start_date.value = item.planned_start_date || ''; form.planned_end_date.value = item.planned_end_date || ''; form.actual_start_date.value = item.actual_start_date || ''; form.actual_end_date.value = item.actual_end_date || ''; form.lead_officer_name.value = item.lead_officer_name || ''; form.lead_officer_contact.value = item.lead_officer_contact || ''; form.implementing_office.value = item.implementing_office || ''; form.remarks.value = item.remarks || ''; applyDateFieldIcons(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

form.addEventListener('submit', async e => { e.preventDefault(); if (!canManage) return show('Only officer/admin users can manage interventions.', true); const body = Object.fromEntries(new FormData(form)); const id = body.id; delete body.id; try { if (id) await json(`/api/interventions/registry/${id}`, { method: 'PUT', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); else await json('/api/interventions/registry', { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) }); form.reset(); await loadGnds(''); show('Intervention saved.'); await loadRegistry(); } catch (err) { show(err.message, true); } });

async function saveActionWithOfficer(e, id) {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  const officerName = body.officer_name || '';
  const officerContact = body.officer_contact || '';
  try {
    await json(`/api/interventions/registry/${id}/timeline`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        action_date: body.action_date,
        action_title: body.action_title,
        action_description: body.action_description,
        progress_percent: body.progress_percent,
        officer_name: officerName,
        officer_contact: officerContact,
        action_status: 'completed'
      })
    });
    await json(`/api/interventions/registry/${id}/officers`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        officer_name: officerName,
        designation: body.designation,
        institution: body.institution,
        phone: officerContact,
        responsibility: body.responsibility || body.action_title
      })
    });
    show('Action and responsible officer saved.');
    e.target.reset();
    await loadRegistry();
  } catch (err) { show(err.message, true); }
}

dsdSelect.addEventListener('change', () => loadGnds(dsdSelect.value));
document.getElementById('useLocationBtn').addEventListener('click', () => { if (!navigator.geolocation) return show('Geolocation is not available.', true); navigator.geolocation.getCurrentPosition(pos => { document.getElementById('latInput').value = pos.coords.latitude.toFixed(7); document.getElementById('lngInput').value = pos.coords.longitude.toFixed(7); show('Current location captured.'); }, () => show('Unable to capture location.', true)); });
document.getElementById('resetBtn').addEventListener('click', () => { form.reset(); loadGnds(''); applyDateFieldIcons(); }); document.getElementById('refreshBtn').addEventListener('click', loadRegistry);
function escapeHtml(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function formatDate(value) { if (!value) return '-'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString(); }
(async () => { await initSidebar(); await Promise.all([loadLibrary(), loadDsds(), loadInstitutions()]); await loadGnds(''); applyPermissions(); applyDateFieldIcons(); await loadRegistry(); })().catch(e => show(e.message, true));
