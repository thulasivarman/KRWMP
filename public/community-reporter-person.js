(function () {
  const utils = window.KRWMP_UTILS || {};
  const api = utils.apiRequest || utils.request;
  const esc = utils.escapeHtml || (value => String(value ?? ''));
  const escAttr = utils.escapeAttribute || esc;

  const form = document.getElementById('communityReportForm');
  const section = document.getElementById('reporterPersonSection');
  const container = document.getElementById('reporterPersonSelector');
  const helper = document.getElementById('reporterPersonHelper');
  const personIdInput = document.getElementById('reporterPersonId');
  const nameInput = document.getElementById('reporterNameInput');
  const contactInput = document.getElementById('reporterContactInput');
  const emailInput = document.getElementById('reporterEmailInput');
  const dsdInput = document.getElementById('dsdNameInput');
  const gndInput = document.getElementById('gndNameInput');
  const locationInput = document.querySelector('[name="location_description"]');

  if (!api || !form || !container || !personIdInput || !nameInput || !contactInput) return;

  const state = {
    results: [],
    selectedPerson: null,
    loggedInAutoLinked: false,
  };

  function clean(value) {
    return String(value ?? '').trim();
  }

  function phone(person = {}) {
    return clean(person.phone_number || person.phone || person.mobile || '');
  }

  function name(person = {}) {
    return clean(person.full_name || person.name || person.preferred_name || 'Unnamed person');
  }

  function meta(person = {}) {
    return [phone(person), clean(person.email), [clean(person.gnd), clean(person.dsd)].filter(Boolean).join(', ')].filter(Boolean).join(' | ') || 'No contact/location details';
  }

  function currentUser() {
    try { return JSON.parse(localStorage.getItem('krwmp_user') || 'null') || {}; }
    catch (_) { return {}; }
  }

  function setReporter(person = null, options = {}) {
    state.selectedPerson = person || null;
    personIdInput.value = person?.id || '';
    nameInput.value = person ? name(person) : '';
    contactInput.value = person ? phone(person) : '';
    emailInput.value = person?.email || '';

    if (person && helper) {
      helper.textContent = options.autoLinked
        ? 'Reporter details were linked automatically from your logged-in user profile.'
        : 'Reporter details are linked to the selected person record.';
    } else if (helper) {
      helper.textContent = 'Search your name, phone number, NIC or email. Select an existing person, or register your details before submitting.';
    }

    renderSelected();
  }

  function selectedHtml() {
    if (!state.selectedPerson) return '';
    return `
      <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div class="text-sm font-semibold text-emerald-200">${esc(name(state.selectedPerson))}</div>
            <div class="form-helper mt-1">${esc(meta(state.selectedPerson))}</div>
          </div>
          ${state.loggedInAutoLinked ? '' : '<button type="button" data-reporter-action="clear" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Change</button>'}
        </div>
      </div>
    `;
  }

  function personCard(person) {
    return `
      <article class="krwmp-card p-3" data-person-id="${escAttr(person.id || '')}">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0">
            <strong class="text-sm text-slate-100">${esc(name(person))}</strong>
            <div class="form-helper mt-1">${esc(meta(person))}</div>
            <div class="form-helper mt-1">NIC: ${esc(person.nic_number || '-')}</div>
          </div>
          <button type="button" data-reporter-action="select" data-person-id="${escAttr(person.id || '')}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Select</button>
        </div>
      </article>
    `;
  }

  function renderResults(persons = []) {
    const resultBox = container.querySelector('[data-reporter-results]');
    if (!resultBox) return;
    state.results = persons;
    if (!persons.length) {
      resultBox.innerHTML = '<div class="krwmp-empty-state">No matching person found. Register details below.</div>';
      return;
    }
    resultBox.innerHTML = persons.map(personCard).join('');
  }

  function renderSelected() {
    const selectedBox = container.querySelector('[data-reporter-selected]');
    if (selectedBox) selectedBox.innerHTML = selectedHtml();
  }

  function setStatus(message, error = false) {
    const statusBox = container.querySelector('[data-reporter-status]');
    if (!statusBox) return;
    statusBox.innerHTML = message ? `<div class="rounded-lg border p-3 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}">${esc(message)}</div>` : '';
  }

  function debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  async function searchPersons(query) {
    const q = clean(query);
    if (q.length < 3) {
      renderResults([]);
      return [];
    }
    const data = await api(`/api/public/persons/search?q=${encodeURIComponent(q)}&limit=10`);
    const persons = data.persons || [];
    renderResults(persons);
    return persons;
  }

  function collectCreatePayload() {
    const payload = {};
    container.querySelectorAll('[data-reporter-create-field]').forEach(field => {
      const value = clean(field.value);
      if (value) payload[field.dataset.reporterCreateField] = value;
    });
    payload.dsd = payload.dsd || clean(dsdInput?.value);
    payload.gnd = payload.gnd || clean(gndInput?.value);
    payload.address = payload.address || clean(locationInput?.value);
    return payload;
  }

  async function createPerson() {
    const payload = collectCreatePayload();
    if (!payload.full_name || payload.full_name.length < 2) {
      setStatus('Full name is required to register reporter details.', true);
      return;
    }
    if (!payload.phone_number || payload.phone_number.length < 7) {
      setStatus('Contact number is required to register reporter details.', true);
      return;
    }
    setStatus('Registering reporter details...');
    const data = await api('/api/public/persons', { method: 'POST', body: payload });
    setReporter(data.person || null);
    container.querySelectorAll('[data-reporter-create-field]').forEach(field => { field.value = ''; });
    setStatus('Reporter details registered and linked.');
  }

  function render() {
    container.innerHTML = `
      <div class="krwmp-stack-sm">
        <div data-reporter-selected></div>
        <label class="form-label">Search Existing Person
          <input type="search" data-reporter-search class="form-input mt-1" placeholder="Search by name, phone, NIC, or email">
          <span class="form-helper">Existing matching persons will be shown for selection.</span>
        </label>
        <div data-reporter-status></div>
        <div data-reporter-results class="space-y-2"></div>
        <section data-reporter-create-panel class="krwmp-card-muted p-3">
          <h3 class="form-label mb-3">Register Reporter Details</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="form-label">Full Name
              <input data-reporter-create-field="full_name" class="form-input mt-1" required>
            </label>
            <label class="form-label">Contact Number
              <input data-reporter-create-field="phone_number" class="form-input mt-1" required>
            </label>
            <label class="form-label">Email
              <input data-reporter-create-field="email" type="email" class="form-input mt-1">
            </label>
            <label class="form-label">NIC
              <input data-reporter-create-field="nic_number" class="form-input mt-1">
            </label>
            <label class="form-label">DSD
              <input data-reporter-create-field="dsd" class="form-input mt-1">
            </label>
            <label class="form-label">GND
              <input data-reporter-create-field="gnd" class="form-input mt-1">
            </label>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" data-reporter-action="create" class="krwmp-btn krwmp-btn-primary">Register and Link</button>
            <button type="button" data-reporter-action="clear" class="krwmp-btn krwmp-btn-secondary">Clear Selection</button>
          </div>
        </section>
      </div>
    `;
    renderSelected();
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
    } catch (_) {
      // Keep the manual reporter selector available.
    }
  }

  function validateReporterBeforeSubmit(event) {
    if (personIdInput.value && nameInput.value && contactInput.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setStatus('Please select an existing person or register reporter details before submitting the report.', true);
    section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function bind() {
    const debouncedSearch = debounce(event => {
      searchPersons(event.target.value).catch(error => setStatus(error.message || 'Unable to search persons.', true));
    }, 300);

    container.addEventListener('input', event => {
      if (event.target.matches('[data-reporter-search]')) debouncedSearch(event);
    });

    container.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('[data-reporter-search],[data-reporter-create-field]')) {
        event.preventDefault();
      }
    });

    container.addEventListener('click', event => {
      const button = event.target.closest('[data-reporter-action]');
      if (!button) return;
      const action = button.dataset.reporterAction;
      if (action === 'select') {
        const person = state.results.find(row => String(row.id) === String(button.dataset.personId));
        setReporter(person || null);
        setStatus(person ? 'Reporter details linked.' : '', !person);
      }
      if (action === 'clear') {
        state.loggedInAutoLinked = false;
        setReporter(null);
        setStatus('');
      }
      if (action === 'create') {
        createPerson().catch(error => setStatus(error.message || 'Unable to register reporter details.', true));
      }
    });

    form.addEventListener('submit', validateReporterBeforeSubmit, true);
  }

  render();
  bind();
  window.KRWMP_REPORTER_PERSON = { setReporter, searchPersons };
  window.addEventListener('krwmp:session-ready', autoLinkLoggedInUser);
  setTimeout(autoLinkLoggedInUser, 500);
})();
