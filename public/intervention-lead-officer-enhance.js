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

  function applyLeadOfficer(person = null) {
    if (personIdInput) personIdInput.value = person?.id || '';
    if (officerNameInput) officerNameInput.value = person?.full_name || person?.name || person?.preferred_name || '';
    if (officerContactInput) officerContactInput.value = person ? firstContact(person) : '';
  }

  function mountLeadOfficerSelector() {
    leadOfficerSelector?.destroy?.();
    leadOfficerSelector = window.KRWMP_PERSON_SELECTOR.mount({
      container: selectorContainer,
      valueInput: '#leadOfficerPersonId',
      label: 'Search Lead Officer',
      helperText: 'Select the lead officer from the master person registry. Use Create New Person only when the officer is not available.',
      allowCreate: true,
      selectedPerson: selectedPersonFromForm(),
      onSelect: applyLeadOfficer,
      onCreate: applyLeadOfficer,
    });
  }

  function clearLeadOfficerIfFormCleared() {
    window.setTimeout(() => {
      if (!officerNameInput?.value && !officerContactInput?.value && !personIdInput?.value) {
        leadOfficerSelector?.clear?.();
      }
    }, 0);
  }

  mountLeadOfficerSelector();

  document.getElementById('resetBtn')?.addEventListener('click', () => {
    if (personIdInput) personIdInput.value = '';
    if (officerNameInput) officerNameInput.value = '';
    if (officerContactInput) officerContactInput.value = '';
    leadOfficerSelector?.clear?.();
  });

  form.addEventListener('reset', clearLeadOfficerIfFormCleared);
})();
