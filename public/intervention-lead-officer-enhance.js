(function () {
  const form = document.getElementById('registryForm');
  const selectorContainer = document.getElementById('leadOfficerPersonSelector');
  const personIdInput = document.getElementById('leadOfficerPersonId');
  const officerNameInput = document.getElementById('leadOfficerName') || form?.elements?.lead_officer_name;
  const officerContactInput = document.getElementById('leadOfficerContact') || form?.elements?.lead_officer_contact;

  if (!form || !selectorContainer || !window.KRWMP_PERSON_SELECTOR) return;

  let leadOfficerSelector = null;

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

  function setSelectorSelectionMode(selected) {
    const resultsNode = selectorContainer.querySelector('[data-person-results]');
    const searchInput = selectorContainer.querySelector('[data-person-search]');
    const createPanel = selectorContainer.querySelector('[data-person-create-panel]');
    const createToggleButtons = selectorContainer.querySelectorAll('[data-person-action="toggle-create"]');

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
})();
