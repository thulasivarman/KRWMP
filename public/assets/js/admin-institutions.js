window.KRWMP_ADMIN_INSTITUTIONS = {
    institutions: [],
    canManage: false,
    picker: null,

    async init() {
        await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
        this.canManage = this.isAdminUser();
        this.toggleManagementControls();
        this.bindEvents();
        this.initLocationPicker();
        await this.loadInstitutions();
    },

    isAdminUser() {
        const user = window.KRWMP_ENGINE?.Session?.user || {};
        const identifier = String(user.identifier || user.username || '').trim().toLowerCase();
        const roleName = String(user.role_name || user.role || '').trim().toLowerCase();
        return identifier === 'thulasi' || roleName === 'admin';
    },

    toggleManagementControls() {
        document.getElementById('institution-form-section')?.classList.toggle('hidden', !this.canManage);
        document.getElementById('btn-new-institution')?.classList.toggle('hidden', !this.canManage);
    },

    bindEvents() {
        document.getElementById('institutionForm')?.addEventListener('submit', event => this.saveInstitution(event));
        document.getElementById('btn-reset-institution-form')?.addEventListener('click', () => this.resetForm());
        document.getElementById('btn-cancel-institution-edit')?.addEventListener('click', () => this.resetForm());
        document.getElementById('btn-new-institution')?.addEventListener('click', () => this.resetForm(true));
        document.getElementById('showInactiveInstitutions')?.addEventListener('change', () => this.loadInstitutions());
        document.getElementById('institutionTableBody')?.addEventListener('click', event => this.handleTableAction(event));
    },

    initLocationPicker() {
        this.picker = new window.KRWMPLocationPicker({
            containerId: 'institution-location-picker',
            latitudeInput: '#institutionLatitude',
            longitudeInput: '#institutionLongitude',
            initialCenter: [80.2280810, 7.2334995],
            initialZoom: 10,
            onChange: location => this.identifyBoundary(location)
        });
    },

    async identifyBoundary(location) {
        const dsd = document.getElementById('institutionDsd');
        const gnd = document.getElementById('institutionGnd');
        if (!location || location.cleared) {
            if (dsd) dsd.value = '';
            if (gnd) gnd.value = '';
            return;
        }
        try {
            const url = `/api/spatial/identify?lat=${encodeURIComponent(location.latitude)}&lng=${encodeURIComponent(location.longitude)}`;
            const response = await fetch(url);
            const data = await response.json();
            if (!response.ok || data.success === false) throw new Error(data.message || 'Unable to identify location');
            if (dsd) dsd.value = data.dsd?.dsd_name || '';
            if (gnd) gnd.value = data.gnd?.gnd_name || '';
        } catch (error) {
            if (dsd) dsd.value = '';
            if (gnd) gnd.value = '';
            console.warn('Boundary auto-detection failed:', error.message);
        }
    },

    async loadInstitutions() {
        const tableBody = document.getElementById('institutionTableBody');
        const includeInactive = document.getElementById('showInactiveInstitutions')?.checked;
        try {
            const data = await window.KRWMP_ADMIN_API.request(`/api/interventions/lookups/institutions${includeInactive ? '?include_inactive=true' : ''}`);
            this.institutions = data.institutions || [];
            this.renderTable();
        } catch (error) {
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="py-8 text-center text-rose-400">${this.escapeHtml(error.message)}</td></tr>`;
        }
    },

    renderTable() {
        const tableBody = document.getElementById('institutionTableBody');
        if (!tableBody) return;
        if (!this.institutions.length) {
            tableBody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-xs text-slate-500">No institution records found.</td></tr>';
            return;
        }
        tableBody.innerHTML = this.institutions.map(row => this.renderRow(row)).join('');
    },

    renderRow(row) {
        const locationText = [row.gnd_name, row.dsd_name].filter(Boolean).join(', ') || 'No boundary assigned';
        const coordinates = row.latitude && row.longitude ? `${Number(row.latitude).toFixed(6)}, ${Number(row.longitude).toFixed(6)}` : 'No coordinates';
        const actionButtons = this.canManage ? `<button data-action="edit" data-id="${row.id}" class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-2.5 py-1 rounded transition text-[10px] font-semibold">Edit</button><button data-action="deactivate" data-id="${row.id}" class="bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/40 text-rose-400 px-2.5 py-1 rounded transition text-[10px] font-semibold">Deactivate</button>` : '<span class="text-[10px] text-slate-600">View only</span>';
        return `<tr class="border-b border-slate-800/30 text-xs text-slate-300 hover:bg-slate-900/40 transition"><td class="py-3.5 align-top"><div class="font-medium text-slate-200">${this.escapeHtml(row.institution_name)}</div><div class="text-[10px] text-slate-500 mt-1">${this.escapeHtml(row.institution_type || 'Type not specified')}</div><div class="text-[10px] text-slate-500 mt-1 max-w-xs">${this.escapeHtml(row.address || '')}</div></td><td class="py-3.5 align-top"><div>${this.escapeHtml(row.contact_person || '-')}</div><div class="text-[10px] text-slate-500 mt-1">${this.escapeHtml(row.contact_phone || '-')}</div><div class="text-[10px] text-slate-500 mt-1">${this.escapeHtml(row.contact_email || '-')}</div></td><td class="py-3.5 align-top"><div>${this.escapeHtml(locationText)}</div><div class="text-[10px] text-slate-500 mt-1 font-mono">${this.escapeHtml(coordinates)}</div></td><td class="py-3.5 align-top"><span class="inline-flex px-2 py-1 rounded-full text-[10px] border ${row.active ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}">${row.active ? 'Active' : 'Inactive'}</span></td><td class="py-3.5 align-top text-right space-x-1">${actionButtons}</td></tr>`;
    },

    handleTableAction(event) {
        const button = event.target.closest('button[data-action]');
        if (!button || !this.canManage) return;
        const institution = this.institutions.find(item => String(item.id) === String(button.dataset.id));
        if (!institution) return;
        if (button.dataset.action === 'edit') this.fillForm(institution);
        if (button.dataset.action === 'deactivate') this.deactivateInstitution(institution);
    },

    getPayload() {
        const payload = {
            institution_name: document.getElementById('institutionName').value.trim(),
            institution_type: document.getElementById('institutionType').value.trim() || null,
            contact_person: document.getElementById('contactPerson').value.trim() || null,
            contact_phone: document.getElementById('contactPhone').value.trim() || null,
            contact_email: document.getElementById('contactEmail').value.trim() || null,
            address: document.getElementById('institutionAddress').value.trim() || null,
            dsd_name: document.getElementById('institutionDsd').value.trim() || null,
            gnd_name: document.getElementById('institutionGnd').value.trim() || null,
            latitude: document.getElementById('institutionLatitude').value || null,
            longitude: document.getElementById('institutionLongitude').value || null,
            active: document.getElementById('institutionActive').value === 'true'
        };
        this.validatePayload(payload);
        return payload;
    },

    validatePayload(payload) {
        if (!payload.institution_name || payload.institution_name.length < 3) throw new Error('Institution name must contain at least 3 characters.');
        if (payload.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact_email)) throw new Error('Contact email format is invalid.');
        if (payload.contact_phone && !/^[0-9+()\-\s]{7,30}$/.test(payload.contact_phone)) throw new Error('Contact phone format is invalid.');
        if ((payload.latitude && !payload.longitude) || (!payload.latitude && payload.longitude)) throw new Error('Both latitude and longitude are required for location.');
    },

    async saveInstitution(event) {
        event.preventDefault();
        if (!this.canManage) return window.KRWMP_ADMIN_UI.showError('Only Admin users can manage institutions.');
        try {
            const id = document.getElementById('institutionId').value;
            const payload = this.getPayload();
            if (id) await window.KRWMP_ADMIN_API.updateInstitution(id, payload);
            else await window.KRWMP_ADMIN_API.createInstitution(payload);
            window.KRWMP_ADMIN_UI.showSuccess('Institution record saved successfully.');
            this.resetForm();
            await this.loadInstitutions();
        } catch (error) {
            window.KRWMP_ADMIN_UI.showError('Institution save failed: ' + error.message);
        }
    },

    fillForm(row) {
        document.getElementById('institutionId').value = row.id || '';
        document.getElementById('institutionName').value = row.institution_name || '';
        document.getElementById('institutionType').value = row.institution_type || '';
        document.getElementById('contactPerson').value = row.contact_person || '';
        document.getElementById('contactPhone').value = row.contact_phone || '';
        document.getElementById('contactEmail').value = row.contact_email || '';
        document.getElementById('institutionAddress').value = row.address || '';
        document.getElementById('institutionDsd').value = row.dsd_name || '';
        document.getElementById('institutionGnd').value = row.gnd_name || '';
        document.getElementById('institutionLatitude').value = row.latitude || '';
        document.getElementById('institutionLongitude').value = row.longitude || '';
        document.getElementById('institutionActive').value = String(row.active !== false);
        if (row.latitude && row.longitude && this.picker) this.picker.setLocation(row.latitude, row.longitude, true);
        document.getElementById('institution-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    resetForm(scroll = false) {
        document.getElementById('institutionForm')?.reset();
        document.getElementById('institutionId').value = '';
        document.getElementById('institutionDsd').value = '';
        document.getElementById('institutionGnd').value = '';
        document.getElementById('institutionLatitude').value = '';
        document.getElementById('institutionLongitude').value = '';
        document.getElementById('institutionActive').value = 'true';
        if (this.picker) this.picker.clear();
        if (scroll) document.getElementById('institution-form-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    async deactivateInstitution(row) {
        if (!confirm(`Deactivate institution: ${row.institution_name}?`)) return;
        try {
            await window.KRWMP_ADMIN_API.deleteInstitution(row.id);
            window.KRWMP_ADMIN_UI.showSuccess('Institution deactivated successfully.');
            await this.loadInstitutions();
        } catch (error) {
            window.KRWMP_ADMIN_UI.showError('Institution deactivation failed: ' + error.message);
        }
    },

    escapeHtml(value) {
        return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
    }
};

document.addEventListener('DOMContentLoaded', () => window.KRWMP_ADMIN_INSTITUTIONS.init());
