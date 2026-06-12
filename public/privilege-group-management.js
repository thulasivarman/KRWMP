const currentUser = JSON.parse(localStorage.getItem('krwmp_user') || 'null');
const statusBox = document.getElementById('statusBox');
const roleSelect = document.getElementById('roleSelect');
const roleDescription = document.getElementById('roleDescription');
const privilegeGrid = document.getElementById('privilegeGrid');
const searchInput = document.getElementById('searchInput');
const saveBtn = document.getElementById('saveBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const selectAllViewBtn = document.getElementById('selectAllViewBtn');

let roles = [];
let availableKeys = [];
let privileges = [];
let selectedRoleId = '';

function headers(extra = {}) {
  return {
    ...extra,
    'X-KRWMP-User': currentUser?.identifier || currentUser?.username || 'admin',
    'X-KRWMP-Role': currentUser?.role_name || currentUser?.role || 'admin',
  };
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

async function loadMatrix() {
  privilegeGrid.innerHTML = '<p class="text-sm text-slate-400">Loading privileges...</p>';
  const data = await json('/api/admin/role-privileges/matrix');
  roles = data.roles || [];
  availableKeys = data.availableKeys || [];
  privileges = data.privileges || [];
  populateRoles();
  if (roles.length && !selectedRoleId) {
    selectedRoleId = String(roles[0].id);
    roleSelect.value = selectedRoleId;
  }
  renderPrivileges();
}

function populateRoles() {
  roleSelect.innerHTML = '<option value="">Select user group</option>';
  roles.forEach(role => {
    const option = document.createElement('option');
    option.value = role.id;
    option.textContent = role.role_name;
    roleSelect.appendChild(option);
  });
  if (selectedRoleId) roleSelect.value = selectedRoleId;
}

function currentRole() {
  return roles.find(role => String(role.id) === String(selectedRoleId));
}

function privilegeFor(roleId, key) {
  return privileges.find(item => String(item.role_id) === String(roleId) && item.privilege_key === key) || null;
}

function filteredKeys() {
  const q = String(searchInput.value || '').trim().toLowerCase();
  if (!q) return availableKeys;
  return availableKeys.filter(item => `${item.privilege_key} ${item.privilege_name}`.toLowerCase().includes(q));
}

function renderPrivileges() {
  const role = currentRole();
  roleDescription.textContent = role ? (role.description || `Editing permissions for ${role.role_name}`) : 'Select a user group to edit permissions.';
  privilegeGrid.innerHTML = '';

  if (!selectedRoleId) {
    privilegeGrid.innerHTML = '<p class="text-sm text-slate-400">Please select a user group.</p>';
    return;
  }

  const keys = filteredKeys();
  if (!keys.length) {
    privilegeGrid.innerHTML = '<p class="text-sm text-slate-400">No privilege keys match your search.</p>';
    return;
  }

  keys.forEach(item => {
    const existing = privilegeFor(selectedRoleId, item.privilege_key) || {};
    const card = document.createElement('article');
    card.className = 'privilege-card bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4';
    card.dataset.privilegeKey = item.privilege_key;
    card.dataset.privilegeName = item.privilege_name || item.privilege_key;
    card.innerHTML = `
      <div>
        <h3 class="font-bold text-slate-100">${escapeHtml(item.privilege_name || item.privilege_key)}</h3>
        <p class="text-xs text-slate-500 mt-1 font-mono">${escapeHtml(item.privilege_key)}</p>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        ${checkboxHtml('can_view', 'View', existing.can_view)}
        ${checkboxHtml('can_create', 'Add', existing.can_create)}
        ${checkboxHtml('can_update', 'Edit', existing.can_update)}
        ${checkboxHtml('can_delete', 'Delete', existing.can_delete)}
      </div>
    `;
    privilegeGrid.appendChild(card);
  });
}

function checkboxHtml(name, label, checked) {
  return `
    <label class="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
      <input type="checkbox" name="${name}" class="h-4 w-4 accent-emerald-500" ${checked ? 'checked' : ''}>
      <span>${label}</span>
    </label>
  `;
}

function collectPrivileges() {
  const allCards = [...document.querySelectorAll('.privilege-card')];
  const visibleMap = new Map();
  allCards.forEach(card => visibleMap.set(card.dataset.privilegeKey, card));

  return availableKeys.map(item => {
    const card = visibleMap.get(item.privilege_key);
    const existing = privilegeFor(selectedRoleId, item.privilege_key) || {};
    return {
      privilege_key: item.privilege_key,
      privilege_name: item.privilege_name || item.privilege_key,
      can_view: card ? card.querySelector('[name="can_view"]').checked : !!existing.can_view,
      can_create: card ? card.querySelector('[name="can_create"]').checked : !!existing.can_create,
      can_update: card ? card.querySelector('[name="can_update"]').checked : !!existing.can_update,
      can_delete: card ? card.querySelector('[name="can_delete"]').checked : !!existing.can_delete,
    };
  });
}

async function savePrivileges() {
  if (!selectedRoleId) return showStatus('Please select a user group before saving.', true);
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';
  try {
    await json('/api/admin/role-privileges/matrix', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ role_id: selectedRoleId, privileges: collectPrivileges() }),
    });
    showStatus('User group privileges saved successfully.');
    await loadMatrix();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

function setAllVisible(action) {
  document.querySelectorAll('.privilege-card').forEach(card => {
    card.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.checked = action === 'view' ? input.name === 'can_view' : false;
    });
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

roleSelect.addEventListener('change', () => {
  selectedRoleId = roleSelect.value;
  renderPrivileges();
});
searchInput.addEventListener('input', renderPrivileges);
saveBtn.addEventListener('click', savePrivileges);
clearAllBtn.addEventListener('click', () => setAllVisible('clear'));
selectAllViewBtn.addEventListener('click', () => setAllVisible('view'));

(async () => {
  await initSidebar();
  await loadMatrix();
})().catch(error => showStatus(error.message || 'Unable to load privilege group management.', true));
