(function () {
    const utils = window.KRWMP_UTILS || {};
    const apiRequest = utils.apiRequest || utils.request;
    const escapeHtml = utils.escapeHtml || (value => String(value ?? ''));
    const escapeAttribute = utils.escapeAttribute || escapeHtml;

    if (!apiRequest) {
        console.warn('KRWMP person selector requires KRWMP_UTILS.apiRequest.');
    }

    function cleanText(value) {
        const text = String(value ?? '').trim();
        return text || '';
    }

    function resolveElement(elementOrSelector) {
        if (typeof elementOrSelector === 'string') return document.querySelector(elementOrSelector);
        return elementOrSelector || null;
    }

    function debounce(fn, delay = 280) {
        let timer = null;
        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        };
    }

    function personName(person = {}) {
        return cleanText(person.full_name || person.name || person.preferred_name) || 'Unnamed person';
    }

    function personMeta(person = {}) {
        return [
            cleanText(person.phone_number || person.phone),
            cleanText(person.email),
            [cleanText(person.gnd), cleanText(person.dsd)].filter(Boolean).join(', '),
        ].filter(Boolean).join(' | ');
    }

    function personRoles(person = {}) {
        const roles = person.existing_roles || person.roles || person.module_roles || person.links || [];
        if (!Array.isArray(roles) || !roles.length) return '';
        return roles.map(role => {
            if (typeof role === 'string') return role;
            return cleanText(role.role_name || role.relationship_type || role.module_name);
        }).filter(Boolean).join(', ');
    }

    function matchBadge(person = {}) {
        const score = Number(person.match_score || 0);
        if (!score) return '';
        const reasons = Array.isArray(person.match_reasons) ? person.match_reasons.join(', ') : '';
        return `<span class="krwmp-badge krwmp-badge-warning" title="${escapeAttribute(reasons)}">${escapeHtml(score)}% match</span>`;
    }

    async function searchPersons(query, options = {}) {
        const params = new URLSearchParams();
        if (cleanText(query)) params.set('q', cleanText(query));
        if (options.limit) params.set('limit', options.limit);
        const suffix = params.toString() ? `?${params.toString()}` : '';
        const data = await apiRequest(`/api/persons/search${suffix}`);
        return data.persons || [];
    }

    async function detectDuplicates(person = {}) {
        const data = await apiRequest('/api/persons/detect-duplicates', {
            method: 'POST',
            body: person,
        });
        return data.matches || [];
    }

    async function createPerson(person = {}) {
        const data = await apiRequest('/api/persons', {
            method: 'POST',
            body: person,
        });
        return data.person;
    }

    function statusHtml(message, error = false) {
        if (!message) return '';
        return `<div class="rounded-lg border p-3 text-sm ${error ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}">${escapeHtml(message)}</div>`;
    }

    function personRowHtml(person, action = 'select') {
        const roles = personRoles(person);
        return `
            <article class="krwmp-card p-3" data-person-row="${escapeAttribute(person.id || '')}">
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                            <strong class="text-sm text-slate-100">${escapeHtml(personName(person))}</strong>
                            ${matchBadge(person)}
                        </div>
                        <div class="form-helper mt-1">${escapeHtml(personMeta(person) || 'No contact/location details')}</div>
                        <div class="form-helper mt-1">NIC: ${escapeHtml(person.nic_number || '-')}</div>
                        <div class="form-helper mt-1">Existing roles: ${escapeHtml(roles || 'No linked roles recorded')}</div>
                    </div>
                    <button type="button" data-person-action="${escapeAttribute(action)}" data-person-id="${escapeAttribute(person.id || '')}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">
                        Select
                    </button>
                </div>
            </article>
        `;
    }

    function selectedPersonHtml(person) {
        if (!person) return '';
        return `
            <div class="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div class="text-sm font-semibold text-emerald-200">${escapeHtml(personName(person))}</div>
                        <div class="form-helper mt-1">${escapeHtml(personMeta(person) || 'Selected person')}</div>
                    </div>
                    <button type="button" data-person-action="clear" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Change</button>
                </div>
            </div>
        `;
    }

    function createFormHtml(options = {}) {
        const hidden = options.allowCreate === false || !options.startOpen ? 'hidden' : '';
        return `
            <section data-person-create-panel class="krwmp-card-muted p-3 ${hidden}">
                <div class="krwmp-cluster-between mb-3">
                    <h3 class="form-label">Create New Person</h3>
                    <button type="button" data-person-action="toggle-create" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Hide</button>
                </div>
                <div data-person-duplicate-warning class="mb-3 hidden"></div>
                <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label class="form-label">Full Name
                        <input name="full_name" data-person-create-field="full_name" class="form-input mt-1" required>
                    </label>
                    <label class="form-label">Preferred Name
                        <input name="preferred_name" data-person-create-field="preferred_name" class="form-input mt-1">
                    </label>
                    <label class="form-label">NIC
                        <input name="nic_number" data-person-create-field="nic_number" class="form-input mt-1">
                    </label>
                    <label class="form-label">Phone
                        <input name="phone_number" data-person-create-field="phone_number" class="form-input mt-1">
                    </label>
                    <label class="form-label">Email
                        <input name="email" data-person-create-field="email" type="email" class="form-input mt-1">
                    </label>
                    <label class="form-label">DSD
                        <input name="dsd" data-person-create-field="dsd" class="form-input mt-1">
                    </label>
                    <label class="form-label">GND
                        <input name="gnd" data-person-create-field="gnd" class="form-input mt-1">
                    </label>
                    <label class="form-label">Address
                        <input name="address" data-person-create-field="address" class="form-input mt-1">
                    </label>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                    <button type="button" data-person-action="create" class="krwmp-btn krwmp-btn-primary">Create Person</button>
                    <button type="button" data-person-action="reset-create" class="krwmp-btn krwmp-btn-secondary">Clear</button>
                </div>
            </section>
        `;
    }

    function collectCreatePayload(root) {
        const payload = {};
        root.querySelectorAll('[data-person-create-field]').forEach(field => {
            const value = cleanText(field.value);
            if (value) payload[field.dataset.personCreateField] = value;
        });
        return payload;
    }

    function mount(options = {}) {
        const container = resolveElement(options.container);
        if (!container) throw new Error('Person selector container is required.');
        if (!apiRequest) throw new Error('KRWMP_UTILS.apiRequest is required.');

        const valueInput = resolveElement(options.valueInput || options.personIdInput);
        const allowCreate = options.allowCreate !== false;
        const state = {
            selectedPerson: options.selectedPerson || null,
            results: [],
            duplicateMatches: [],
        };

        container.classList.add('krwmp-person-selector');
        container.innerHTML = `
            <div class="krwmp-stack-sm">
                <label class="form-label">${escapeHtml(options.label || 'Person')}
                    <input type="search" data-person-search class="form-input mt-1" placeholder="${escapeAttribute(options.placeholder || 'Search by name, phone, NIC, or email')}">
                    <span class="form-helper">${escapeHtml(options.helperText || 'Search the master person registry or create a new person if needed.')}</span>
                </label>
                <div data-person-status></div>
                <div data-person-selected>${selectedPersonHtml(state.selectedPerson)}</div>
                <div data-person-results class="space-y-2"></div>
                ${allowCreate ? '<button type="button" data-person-action="toggle-create" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Create New Person</button>' : ''}
                ${createFormHtml({ allowCreate, startOpen: options.startCreateOpen === true })}
            </div>
        `;

        const searchInput = container.querySelector('[data-person-search]');
        const statusNode = container.querySelector('[data-person-status]');
        const selectedNode = container.querySelector('[data-person-selected]');
        const resultsNode = container.querySelector('[data-person-results]');
        const createPanel = container.querySelector('[data-person-create-panel]');
        const duplicateNode = container.querySelector('[data-person-duplicate-warning]');

        function setStatus(message, error = false) {
            statusNode.innerHTML = statusHtml(message, error);
        }

        function syncValue(person) {
            state.selectedPerson = person || null;
            if (valueInput) valueInput.value = person?.id || '';
            selectedNode.innerHTML = selectedPersonHtml(state.selectedPerson);
            if (typeof options.onSelect === 'function') options.onSelect(state.selectedPerson);
            container.dispatchEvent(new CustomEvent('krwmp:person-selected', {
                bubbles: true,
                detail: { person: state.selectedPerson },
            }));
        }

        function renderResults(persons = []) {
            state.results = persons;
            if (!persons.length) {
                resultsNode.innerHTML = `<div class="krwmp-empty-state">${escapeHtml(allowCreate ? 'No matching persons found. You can create a new person.' : 'No matching persons found.')}</div>`;
                return;
            }
            resultsNode.innerHTML = persons.map(person => personRowHtml(person)).join('');
        }

        async function runSearch() {
            const query = cleanText(searchInput.value);
            setStatus('');
            if (!query || query.length < 2) {
                resultsNode.innerHTML = '';
                return;
            }
            resultsNode.innerHTML = '<div class="krwmp-loading-state">Searching persons...</div>';
            try {
                renderResults(await searchPersons(query, { limit: options.limit || 10 }));
            } catch (error) {
                resultsNode.innerHTML = '';
                setStatus(error.message || 'Unable to search persons.', true);
            }
        }

        async function runDuplicateCheck() {
            if (!allowCreate) return [];
            const payload = collectCreatePayload(container);
            if (!payload.full_name && !payload.nic_number && !payload.phone_number && !payload.email) {
                duplicateNode.classList.add('hidden');
                duplicateNode.innerHTML = '';
                return [];
            }
            try {
                const matches = await detectDuplicates(payload);
                state.duplicateMatches = matches;
                if (!matches.length) {
                    duplicateNode.classList.add('hidden');
                    duplicateNode.innerHTML = '';
                    return matches;
                }
                duplicateNode.classList.remove('hidden');
                duplicateNode.innerHTML = `
                    <div class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                        <div class="text-sm font-semibold text-amber-200">Possible duplicate person found</div>
                        <div class="mt-2 space-y-2">${matches.slice(0, 3).map(person => personRowHtml(person)).join('')}</div>
                    </div>
                `;
                return matches;
            } catch (error) {
                duplicateNode.classList.remove('hidden');
                duplicateNode.innerHTML = statusHtml(error.message || 'Unable to check duplicates.', true);
                return [];
            }
        }

        const debouncedSearch = debounce(runSearch, options.searchDelay || 280);
        const debouncedDuplicateCheck = debounce(runDuplicateCheck, options.duplicateDelay || 350);

        searchInput.addEventListener('input', debouncedSearch);
        searchInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                runSearch();
            }
        });
        createPanel?.addEventListener('input', debouncedDuplicateCheck);
        createPanel?.addEventListener('keydown', event => {
            if (event.key === 'Enter' && event.target?.matches?.('[data-person-create-field]')) {
                event.preventDefault();
            }
        });

        container.addEventListener('click', async event => {
            const actionButton = event.target.closest('[data-person-action]');
            if (!actionButton || !container.contains(actionButton)) return;
            const action = actionButton.dataset.personAction;

            if (action === 'select') {
                const personId = actionButton.dataset.personId;
                const person = [...state.results, ...state.duplicateMatches].find(row => String(row.id) === String(personId));
                if (person) {
                    syncValue(person);
                    setStatus('Person selected.');
                }
                return;
            }

            if (action === 'clear') {
                syncValue(null);
                setStatus('');
                return;
            }

            if (action === 'toggle-create') {
                createPanel?.classList.toggle('hidden');
                return;
            }

            if (action === 'reset-create') {
                createPanel?.querySelectorAll('[data-person-create-field]').forEach(field => { field.value = ''; });
                duplicateNode.classList.add('hidden');
                duplicateNode.innerHTML = '';
                return;
            }

            if (action === 'create') {
                const payload = collectCreatePayload(container);
                if (!payload.full_name || payload.full_name.length < 2) {
                    setStatus('Full name is required to create a person.', true);
                    createPanel?.querySelector('[data-person-create-field="full_name"]')?.focus();
                    return;
                }
                actionButton.disabled = true;
                setStatus('Creating person...');
                try {
                    await runDuplicateCheck();
                    const person = await createPerson(payload);
                    syncValue(person);
                    createPanel?.querySelectorAll('[data-person-create-field]').forEach(field => { field.value = ''; });
                    duplicateNode.classList.add('hidden');
                    duplicateNode.innerHTML = '';
                    setStatus('Person created and selected.');
                    if (typeof options.onCreate === 'function') options.onCreate(person);
                } catch (error) {
                    setStatus(error.message || 'Unable to create person.', true);
                } finally {
                    actionButton.disabled = false;
                }
            }
        });

        if (state.selectedPerson) syncValue(state.selectedPerson);

        return {
            search: runSearch,
            detectDuplicates: runDuplicateCheck,
            getSelectedPerson: () => state.selectedPerson,
            setSelectedPerson: syncValue,
            clear: () => syncValue(null),
            destroy: () => { container.innerHTML = ''; },
        };
    }

    window.KRWMP_PERSON_SELECTOR = {
        mount,
        searchPersons,
        detectDuplicates,
        createPerson,
    };
})();
