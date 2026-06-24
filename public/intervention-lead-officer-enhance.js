(function () {
  const form = document.getElementById('registryForm');
  const selectorContainer = document.getElementById('leadOfficerPersonSelector');
  const personIdInput = document.getElementById('leadOfficerPersonId');
  const officerNameInput = document.getElementById('leadOfficerName') || form?.elements?.lead_officer_name;
  const officerContactInput = document.getElementById('leadOfficerContact') || form?.elements?.lead_officer_contact;
  const statusBox = document.getElementById('statusBox');
  const writePanel = document.getElementById('writePanel');

  if (!form || !selectorContainer || !window.KRWMP_PERSON_SELECTOR) return;

  let leadOfficerSelector = null;
  let savingRegistry = false;

  function firstContact(person = {}) {
    return person.phone_number || person.phone || person.mobile || person.email || '';
  }

  function selectedPersonFromForm() {
    const id = personIdInput?.value || '';
    const fullName = officerNameInput?.value || '';
    const phoneNumber = officerContactInput?.value || '';
    if (!id && !fullName) return null;
    return {
      id,
      full_name: fullName,
      phone_number: phoneNumber,
    };
  }

  function disableNativeCreateValidation() {
    selectorContainer.querySelectorAll('[data-person-create-field]').forEach(field => {
      field.removeAttribute('required');
      field.removeAttribute('pattern');
    });
  }

  function setSelectorSelectionMode(selected) {
    const resultsNode = selectorContainer.querySelector('[data-person-results]');
    const searchInput = selectorContainer.querySelector('[data-person-search]');
    const createPanel = selectorContainer.querySelector('[data-person-create-panel]');
    const createToggleButtons = selectorContainer.querySelectorAll('[data-person-action="toggle-create"]');

    disableNativeCreateValidation();
    if (resultsNode) resultsNode.classList.toggle('hidden', Boolean(selected));
    createPanel?.classList.add('hidden');
    createToggleButtons.forEach(button => button.classList.toggle('hidden', Boolean(selected)));

    if (selected && searchInput) {
      searchInput.value = '';
      searchInput.blur();
    }
  }

  function applyLeadOfficer(person = null) {
    if (personIdInput) personIdInput.value = person?.id || '';
    if (officerNameInput) officerNameInput.value = person?.full_name || person?.name || person?.preferred_name || '';
    if (officerContactInput) officerContactInput.value = person ? firstContact(person) : '';
    window.setTimeout(() => setSelectorSelectionMode(Boolean(person)), 0);
  }

  function mountLeadOfficerSelector() {
    leadOfficerSelector?.destroy?.();
    leadOfficerSelector = window.KRWMP_PERSON_SELECTOR.mount({
      container: selectorContainer,
      valueInput: '#leadOfficerPersonId',
      label: 'Search Lead Officer',
      helperText: 'Search and select the lead officer from the master person registry. If the officer is not found, use Create New Person.',
      allowCreate: true,
      selectedPerson: selectedPersonFromForm(),
      onSelect: applyLeadOfficer,
      onCreate: applyLeadOfficer,
    });
    disableNativeCreateValidation();
    setSelectorSelectionMode(Boolean(selectedPersonFromForm()));
  }

  function clearLeadOfficerIfFormCleared() {
    window.setTimeout(() => {
      if (!officerNameInput?.value && !officerContactInput?.value && !personIdInput?.value) {
        leadOfficerSelector?.clear?.();
        setSelectorSelectionMode(false);
      }
    }, 0);
  }

  function showStatus(message, error = false) {
    if (!statusBox || !window.KRWMP_UTILS?.showStatus) return;
    window.KRWMP_UTILS.showStatus(statusBox, message, error);
  }

  function normalizeRegistryPayload() {
    const body = Object.fromEntries(new FormData(form));
    const id = body.id || '';
    delete body.id;
    delete body.progress_percent;
    delete body.lead_officer_person_id;

    Object.keys(body).forEach(key => {
      if (typeof body[key] === 'string') body[key] = body[key].trim();
      if (body[key] === '') body[key] = null;
    });

    return { id, body };
  }

  async function submitRegistrySafely(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (savingRegistry) return;

    disableNativeCreateValidation();
    const { id, body } = normalizeRegistryPayload();
    if (!body.intervention_title || body.intervention_title.length < 2) {
      showStatus('Intervention title is required before saving.', true);
      form.elements.intervention_title?.focus();
      return;
    }

    const submitButton = form.querySelector('button[type="submit"], button:not([type])');
    savingRegistry = true;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.dataset.originalText = submitButton.textContent;
      submitButton.textContent = 'Saving...';
    }

    try {
      const result = id
        ? await window.KRWMP_UTILS.apiRequest(`/api/interventions/registry/${id}`, { method: 'PUT', body })
        : await window.KRWMP_UTILS.apiRequest('/api/interventions/registry', { method: 'POST', body });

      const savedId = id || result.intervention?.id;
      try {
        if (typeof window.linkSelectedComplaints === 'function') await window.linkSelectedComplaints(savedId);
      } catch (linkError) {
        console.warn('Intervention saved, but complaint linking failed:', linkError);
      }

      writePanel?.close();
      showStatus('Intervention saved.');
      if (typeof window.loadRegistry === 'function') await window.loadRegistry();
      else window.location.reload();
    } catch (error) {
      showStatus(error.message || 'Unable to save intervention.', true);
    } finally {
      savingRegistry = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = submitButton.dataset.originalText || 'Save Intervention';
        delete submitButton.dataset.originalText;
      }
    }
  }

  mountLeadOfficerSelector();

  selectorContainer.addEventListener('click', event => {
    const clearButton = event.target.closest('[data-person-action="clear"]');
    if (clearButton) window.setTimeout(() => setSelectorSelectionMode(false), 0);
  });

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (personIdInput) personIdInput.value = '';
    if (officerNameInput) officerNameInput.value = '';
    if (officerContactInput) officerContactInput.value = '';
    leadOfficerSelector?.clear?.();
    setSelectorSelectionMode(false);
  });

  form.addEventListener('reset', clearLeadOfficerIfFormCleared);
  form.addEventListener('submit', submitRegistrySafely, true);
})();
