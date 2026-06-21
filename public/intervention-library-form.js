const statusBox = document.getElementById('statusBox');
const form = document.getElementById('libraryForm');
const pageTitle = document.getElementById('pageTitle');
const { apiRequest: json } = window.KRWMP_UTILS;
const params = new URLSearchParams(window.location.search);
const itemId = params.get('id');
let canCreateLibrary = false;
let canUpdateLibrary = false;

function show(message, error = false) { window.KRWMP_UTILS.showStatus(statusBox, message, error); }
function backToList() { window.location.href = '/intervention-library.html'; }

async function initSidebar() {
  if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
  await window.KRWMP_PRIVILEGES.protectPage('intervention_library_manage', itemId ? 'update' : 'create');
  canCreateLibrary = window.KRWMP_PRIVILEGES.can('intervention_library_manage', 'create');
  canUpdateLibrary = window.KRWMP_PRIVILEGES.can('intervention_library_manage', 'update');
}

function fillForm(item = {}) {
  form.id.value = item.id || '';
  form.intervention_name.value = item.intervention_name || '';
  form.intervention_category.value = item.intervention_category || '';
  form.default_priority.value = item.default_priority || 'medium';
  form.description.value = item.description || '';
  form.standard_actions.value = item.standard_actions || '';
  form.expected_outputs.value = item.expected_outputs || '';
  form.responsible_institution.value = item.responsible_institution || '';
  form.active.checked = item.active !== false;
}

async function loadItem() {
  if (!itemId) return;
  pageTitle.textContent = 'Edit Library Item';
  const data = await json(`/api/interventions/library/${encodeURIComponent(itemId)}`);
  fillForm(data.item || {});
}

async function saveItem(event) {
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  body.active = form.active.checked;
  const id = body.id || itemId;
  delete body.id;
  if (id && !canUpdateLibrary) return show('You do not have update access for Intervention Library.', true);
  if (!id && !canCreateLibrary) return show('You do not have create access for Intervention Library.', true);
  try {
    if (id) await json(`/api/interventions/library/${encodeURIComponent(id)}`, { method: 'PUT', body });
    else await json('/api/interventions/library', { method: 'POST', body });
    show('Intervention library item saved.');
    setTimeout(backToList, 700);
  } catch (error) {
    show(error.message, true);
  }
}

function bindEvents() {
  form.addEventListener('submit', saveItem);
  document.getElementById('resetBtn').addEventListener('click', () => {
    form.reset();
    form.active.checked = true;
    if (itemId) loadItem().catch(error => show(error.message, true));
  });
}

(async () => { await initSidebar(); bindEvents(); await loadItem(); })().catch(error => show(error.message, true));
