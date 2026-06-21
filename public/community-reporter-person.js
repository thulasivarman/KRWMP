(function () {
  const utils = window.KRWMP_UTILS || {};
  const api = utils.apiRequest || utils.request;
  const esc = utils.escapeHtml || (value => String(value ?? ''));
  const escAttr = utils.escapeAttribute || esc;

  const form = document.getElementById('communityReportForm');
  const section = document.getElementById('reporterPersonSection');
  const helper = document.getElementById('reporterPersonHelper');
  const summary = document.getElementById('reporterPersonSummary');
  const personIdInput = document.getElementById('reporterPersonId');
  const nameInput = document.getElementById('reporterNameInput');
  const contactInput = document.getElementById('reporterContactInput');
  const emailInput = document.getElementById('reporterEmailInput');
  const dsdInput = document.getElementById('dsdNameInput');
  const gndInput = document.getElementById('gndNameInput');
  const locationInput = document.querySelector('[name="location_description"]');
  const searchBtn = document.getElementById('searchReporterBtn');
  const addBtn = document.getElementById('addReporterBtn');
  const searchModal = document.getElementById('reporterSearchModal');
  const createModal = document.getElementById('reporterCreateModal');
  const searchInput = document.getElementById('reporterSearchInput');
  const searchStatus = document.getElementById('reporterSearchStatus');
  const searchResults = document.getElementById('reporterSearchResults');
  const createStatus = document.getElementById('reporterCreateStatus');
  const createSaveBtn = document.getElementById('reporterCreateSaveBtn');

  if (!api || !form || !personIdInput || !nameInput || !contactInput) return;

  const state = {
    results: [],
    selectedPerson: null,
    loggedInAutoLinked: false,
  };

  function clean(value) { return String(value ?? '').trim(); }
  function phone(person = {}) { return clean(person.phone_number || person.phone || person.mobile || ''); }
  function name(person = {}) { return clean(person.full_name || person.name || person.preferred_name || 'Unnamed person'); }
  function meta(person = {}) {
    return [phone(person), clean(person.email), [clean(person.gnd), clean(person.dsd)].filter(Boolean).join(', ')].filter(Boolean).join(' | ') || 'No contact/location details';
  }
  function currentUser() {
    try { return JSON.parse(localStorage.getItem('krwmp_user') || 'null') || {}; }
    catch (_) { return {}; }
  }

  function statusHtml(target, message, error = false) {
    if (!target) return;
    target.innerHTML = message ? `<div class="rounded-lg border p-3 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}">${esc(message)}</div>` : '';
  }

  function renderSummary() {
    if (!summary) return;
    if (!state.selectedPerson) {
      summary.className = 'krwmp-empty-state py-3';
      summary.innerHTML = 'No reporter contact linked yet.';
      return;
    }
    summary.className = 'rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3';
    summary.innerHTML = `
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div class="text-sm font-semibold text-emerald-200">${esc(name(state.selectedPerson))}</div>
          <div class="form-helper mt-1">${esc(meta(state.selectedPerson))}</div>
        </div>
        ${state.loggedInAutoLinked ? '' : '<button type="button" id="clearReporterBtn" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Change Contact</button>'}
      </div>`;
    document.getElementById('clearReporterBtn')?.addEventListener('click', () => {
      state.loggedInAutoLinked = false;
      setReporter(null);
    });
  }

  function setReporter(person = null, options = {}) {
    state.selectedPerson = person || null;
    personIdInput.value = person?.id || '';
    nameInput.value = person ? name(person) : '';
    contactInput.value = person ? phone(person) : '';
    emailInput.value = person?.email || '';
    if (person && helper) {
      helper.textContent = options.autoLinked ? 'Reporter contact linked automatically from your login profile.' : 'Reporter contact linked to the selected person record.';
    } else if (helper) {
      helper.textContent = 'Link your contact details before submitting the report.';
    }
    renderSummary();
  }

  function debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }

  function personCard(person) {
    return `
      <article class="krwmp-card p-3">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0">
            <strong class="text-sm text-slate-100">${esc(name(person))}</strong>
            <div class="form-helper mt-1">${esc(meta(person))}</div>
            <div class="form-helper mt-1">NIC: ${esc(person.nic_number || '-')}</div>
          </div>
          <button type="button" data-reporter-select="${escAttr(person.id || '')}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Select</button>
        </div>
      </article>`;
  }

  async function searchPersons(query) {
    const q = clean(query);
    if (q.length < 3) {
      state.results = [];
      if (searchResults) searchResults.innerHTML = '<div class="krwmp-empty-state">Type at least 3 characters to search.</div>';
      return [];
    }
    statusHtml(searchStatus, 'Searching...');
    const data = await api(`/api/public/persons/search?q=${encodeURIComponent(q)}&limit=10`);
    const persons = data.persons || [];
    state.results = persons;
    statusHtml(searchStatus, persons.length ? `${persons.length} matching contact(s) found.` : 'No matching contact found. Use Add Your Contact Details.', !persons.length);
    if (searchResults) searchResults.innerHTML = persons.length ? persons.map(personCard).join('') : '<div class="krwmp-empty-state">No matching contact found.</div>';
    return persons;
  }

  function openModal(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', 'open');
  }

  function closeModal(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function collectCreatePayload() {
    return {
      full_name: clean(document.getElementById('reporterCreateName')?.value),
      phone_number: clean(document.getElementById('reporterCreatePhone')?.value),
      email: clean(document.getElementById('reporterCreateEmail')?.value),
      nic_number: clean(document.getElementById('reporterCreateNic')?.value),
      dsd: clean(document.getElementById('reporterCreateDsd')?.value) || clean(dsdInput?.value),
      gnd: clean(document.getElementById('reporterCreateGnd')?.value) || clean(gndInput?.value),
      address: clean(locationInput?.value),
    };
  }

  async function createPerson() {
    const payload = collectCreatePayload();
    if (!payload.full_name || payload.full_name.length < 2) return statusHtml(createStatus, 'Full name is required.', true);
    if (!payload.phone_number || payload.phone_number.length < 7) return statusHtml(createStatus, 'Contact number is required.', true);
    statusHtml(createStatus, 'Registering contact details...');
    const data = await api('/api/public/persons', { method: 'POST', body: payload });
    setReporter(data.person || null);
    statusHtml(createStatus, 'Contact details registered and linked.');
    closeModal(createModal);
  }

  async function autoLinkLoggedInUser() {
    if (!window.KRWMP_ENGINE?.Session?.isAuthenticated) return;
    const user = currentUser();
    const q = clean(user.email || user.username || user.name || user.full_name || user.identifier);
    if (q.length < 3) return;
    try {
      const data = await api(`/api/public/persons/search?q=${encodeURIComponent(q)}&limit=10`);
      const persons = data.persons || [];
      const match = persons.find(p => clean(p.email).toLowerCase() === clean(user.email).toLowerCase()) || persons[0];
      if (match) {
        state.loggedInAutoLinked = true;
        setReporter(match, { autoLinked: true });
        section?.classList.add('border', 'border-emerald-500/30');
      }
    } catch (_) {}
  }

  function validateReporterBeforeSubmit(event) {
    if (personIdInput.value && nameInput.value && contactInput.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    statusHtml(searchStatus, 'Please search/select or add your contact details before submitting.', true);
    section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function bind() {
    searchBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (searchResults) searchResults.innerHTML = '<div class="krwmp-empty-state">Type at least 3 characters to search.</div>';
      statusHtml(searchStatus, '');
      openModal(searchModal);
      setTimeout(() => searchInput?.focus(), 100);
    });
    addBtn?.addEventListener('click', () => {
      statusHtml(createStatus, '');
      document.getElementById('reporterCreateDsd').value = clean(dsdInput?.value);
      document.getElementById('reporterCreateGnd').value = clean(gndInput?.value);
      openModal(createModal);
      setTimeout(() => document.getElementById('reporterCreateName')?.focus(), 100);
    });
    document.querySelectorAll('[data-reporter-modal-close]').forEach(button => {
      button.addEventListener('click', () => closeModal(document.getElementById(button.dataset.reporterModalClose)));
    });
    searchInput?.addEventListener('input', debounce(event => {
      searchPersons(event.target.value).catch(error => statusHtml(searchStatus, error.message || 'Unable to search contacts.', true));
    }, 300));
    searchResults?.addEventListener('click', event => {
      const button = event.target.closest('[data-reporter-select]');
      if (!button) return;
      const person = state.results.find(row => String(row.id) === String(button.dataset.reporterSelect));
      if (!person) return;
      state.loggedInAutoLinked = false;
      setReporter(person);
      closeModal(searchModal);
    });
    createSaveBtn?.addEventListener('click', () => createPerson().catch(error => statusHtml(createStatus, error.message || 'Unable to register contact.', true)));
    form.addEventListener('submit', validateReporterBeforeSubmit, true);
  }

  setReporter(null);
  bind();
  window.KRWMP_REPORTER_PERSON = { setReporter, searchPersons };
  window.addEventListener('krwmp:session-ready', autoLinkLoggedInUser);
  setTimeout(autoLinkLoggedInUser, 500);
})();
