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

function showStatus(message, error = false) {
  window.KRWMP_UTILS.showStatus(statusBox, message, error);
}

const { apiRequest: json, escapeHtml } = window.KRWMP_UTILS;

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('user_management_settings', 'view');
  document.querySelector('.krwmp-panel-section')?.classList.add('hidden');
  document.getElementById('section-data-layers')?.classList.add('hidden');
  document.getElementById('section-raster-layers')?.classList.add('hidden');
}

async function loadMatrix() {
  privilegeGrid.innerHTML = '<div class="p-5 text-sm text-slate-400">Loading privileges...</div>';
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
  return availableKeys.filter(item => `${item.privilege_key} ${item.privilege_name} ${item.group_name} ${item.description}`.toLowerCase().includes(q));
}

function groupedKeys(keys) {
  return keys.reduce((groups, item) => {
    const groupName = item.group_name || 'Other';
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push(item);
    return groups;
  }, {});
}

function renderPrivileges() {
  const role = currentRole();
  roleDescription.textContent = role ? (role.description || `Editing permissions for ${role.role_name}`) : 'Select a user group to edit permissions.';
  privilegeGrid.innerHTML = '';

  if (!selectedRoleId) {
    privilegeGrid.innerHTML = '<div class="p-5 text-sm text-slate-400">Please select a user group.</div>';
    return;
  }

  const keys = filteredKeys();
  if (!keys.length) {
    privilegeGrid.innerHTML = '<div class="p-5 text-sm text-slate-400">No access keys match your search.</div>';
    return;
  }

  const groups = groupedKeys(keys);
  Object.entries(groups).forEach(([groupName, items]) => {
    const groupHeader = document.createElement('div');
    groupHeader.className = 'bg-slate-950/50 px-4 py-2 text-[11px] uppercase tracking-widest text-emerald-400 font-bold';
    groupHeader.textContent = groupName;
    privilegeGrid.appendChild(groupHeader);

    items.forEach(item => {
      const existing = privilegeFor(selectedRoleId, item.privilege_key) || {};
      const row = document.createElement('article');
      row.className = 'privilege-card grid grid-cols-1 lg:grid-cols-[1.5fr_repeat(4,110px)] gap-3 lg:gap-0 items-center p-4 hover:bg-slate-800/30 transition';
      row.dataset.privilegeKey = item.privilege_key;
      row.dataset.privilegeName = item.privilege_name || item.privilege_key;
      row.innerHTML = `
        <div class="space-y-1">
          <h3 class="font-semibold text-slate-100">${escapeHtml(item.privilege_name || item.privilege_key)}</h3>
          <p class="text-xs text-slate-500">${escapeHtml(item.description || '')}</p>
          <p class="text-[11px] text-slate-600 font-mono">${escapeHtml(item.privilege_key)}</p>
        </div>
        ${checkboxHtml('can_view', 'View', existing.can_view)}
        ${checkboxHtml('can_create', 'Add', existing.can_create)}
        ${checkboxHtml('can_update', 'Edit', existing.can_update)}
        ${checkboxHtml('can_delete', 'Delete', existing.can_delete)}
      `;
      privilegeGrid.appendChild(row);
    });
  });
}

function checkboxHtml(name, label, checked) {
  return `
    <label  class="form-label flex lg:justify-center items-center gap-2 bg-slate-950/50 lg:bg-transparent border border-slate-800 lg:border-0 rounded-lg px-3 py-2 lg:p-0">
      <span class="lg:hidden w-14">${label}</span>
      <input type="checkbox" name="${name}"  class="h-5 w-5 accent-emerald-500" ${checked ? 'checked' : ''}>
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
      body: { role_id: selectedRoleId, privileges: collectPrivileges() },
    });
    showStatus('User group privileges saved successfully.');
    await loadMatrix();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }
}

function setAllVisible(action) {
  document.querySelectorAll('.privilege-card').forEach(card => {
    card.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.checked = action === 'view' ? input.name === 'can_view' : false;
    });
  });
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
