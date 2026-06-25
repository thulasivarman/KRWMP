/**
 * KRWMP Admin User Management
 */
window.KRWMP_ADMIN_USERS = {
    roles: [],
    institutions: [],
    jurisdictions: [],
    privileges: [],
    users: [],
    filteredUsers: [],
    currentPage: 1,
    pageSize: 10,

    ensureJurisdictionControls() {
        const regInstitution = document.getElementById('regInstitutionId');
        if (regInstitution && !document.getElementById('regJurisdictionIds')) {
            const label = document.createElement('label');
            label.className = 'form-label md:col-span-2';
            label.innerHTML = 'Jurisdiction / Working Area<select id="regJurisdictionIds" multiple size="6" class="form-select text-emerald-300 cursor-pointer"></select><span class="form-helper">Select one or more GND-based jurisdictions. Leave empty only for unrestricted admin users.</span>';
            regInstitution.closest('label')?.insertAdjacentElement('afterend', label);
        }
        const editInstitution = document.getElementById('editInstitutionId');
        if (editInstitution && !document.getElementById('editJurisdictionIds')) {
            const label = document.createElement('label');
            label.className = 'form-label';
            label.innerHTML = 'Jurisdiction / Working Area<select id="editJurisdictionIds" multiple size="6" class="form-select text-emerald-300 cursor-pointer"></select><span class="form-helper">Assign one or more GND-based jurisdictions.</span>';
            editInstitution.closest('label')?.insertAdjacentElement('afterend', label);
        }
    },

    jurisdictionOptions(selectedIds = []) {
        const selected = new Set((selectedIds || []).map(id => String(id)));
        return this.jurisdictions.map(j => {
            const label = `${j.jurisdiction_type || 'CUSTOM'} - ${j.jurisdiction_name || ''}${j.gnd_count ? ` (${j.gnd_count} GNDs)` : ''}`;
            return `<option value="${j.id}" ${selected.has(String(j.id)) ? 'selected' : ''}>${this.escapeHtml(label)}</option>`;
        }).join('');
    },

    populateJurisdictionSelects() {
        this.ensureJurisdictionControls();
        const options = this.jurisdictionOptions();
        const reg = document.getElementById('regJurisdictionIds');
        const edit = document.getElementById('editJurisdictionIds');
        if (reg) reg.innerHTML = options || '<option disabled>No jurisdictions configured</option>';
        if (edit) edit.innerHTML = options || '<option disabled>No jurisdictions configured</option>';
    },

    async refreshDirectoryData() {
        const tableBody = document.getElementById('userDirectoryTableBody');
        const selectRole = document.getElementById('regRoleId');
        const privRole = document.getElementById('privRoleId');
        const regInstitution = document.getElementById('regInstitutionId');
        const editInstitution = document.getElementById('editInstitutionId');
        const roleFilter = document.getElementById('userRoleFilter');
        const institutionFilter = document.getElementById('userInstitutionFilter');

        try {
            const data = await window.KRWMP_ADMIN_API.getUsers();
            this.roles = data.roles || [];
            this.institutions = data.institutions || [];
            this.jurisdictions = data.jurisdictions || [];
            this.privileges = data.privileges || [];
            this.users = data.users || [];

            const roleOptions = this.roles.map(role => `<option value="${role.id}">${this.escapeHtml(String(role.role_name).toUpperCase())} - ${this.escapeHtml(role.description || '')}</option>`).join('');
            if (selectRole) selectRole.innerHTML = roleOptions;
            if (privRole) privRole.innerHTML = roleOptions;
            if (roleFilter) roleFilter.innerHTML = '<option value="">All groups</option>' + this.roles.map(role => `<option value="${role.id}">${this.escapeHtml(String(role.role_name).toUpperCase())}</option>`).join('');

            const institutionOptions = '<option value="">Select institution</option>' + this.institutions.map(i => `<option value="${i.id}">${this.escapeHtml(i.institution_name)}</option>`).join('');
            if (regInstitution) regInstitution.innerHTML = institutionOptions;
            if (editInstitution) editInstitution.innerHTML = institutionOptions;
            if (institutionFilter) institutionFilter.innerHTML = '<option value="">All institutions</option>' + this.institutions.map(i => `<option value="${i.id}">${this.escapeHtml(i.institution_name)}</option>`).join('');
            this.populateJurisdictionSelects();

            this.renderRoleList();
            if (!tableBody) return;
            this.currentPage = 1;
            this.applyDirectoryFilters();
        } catch (error) {
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="5" class="krwmp-table-empty text-rose-400">Failed to synchronize identity data matrix from database rows.</td></tr>`;
            console.error(error);
        }
    },

    applyDirectoryFilters() {
        const query = String(document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
        const roleId = String(document.getElementById('userRoleFilter')?.value || '');
        const institutionId = String(document.getElementById('userInstitutionFilter')?.value || '');
        this.pageSize = Number(document.getElementById('userPageSize')?.value || this.pageSize || 10);

        this.filteredUsers = this.users.filter(user => {
            const roleIds = (user.roles || []).map(role => String(role.id));
            if (user.role_id) roleIds.push(String(user.role_id));
            const roleMatch = !roleId || roleIds.includes(roleId);
            const institutionMatch = !institutionId || String(user.institution_id || '') === institutionId;
            const roleText = (user.roles || []).map(r => r.role_name).join(' ');
            const jurisdictionText = (user.jurisdictions || []).map(j => `${j.jurisdiction_type} ${j.jurisdiction_name}`).join(' ');
            const text = [user.name, user.identifier, user.designation, user.phone_number, user.email, user.institution_name, user.role_name, roleText, jurisdictionText].join(' ').toLowerCase();
            const searchMatch = !query || text.includes(query);
            return roleMatch && institutionMatch && searchMatch;
        });

        const totalPages = Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        if (this.currentPage < 1) this.currentPage = 1;
        this.renderDirectoryPage();
    },

    renderDirectoryPage() {
        const tableBody = document.getElementById('userDirectoryTableBody');
        const meta = document.getElementById('userDirectoryMeta');
        if (!tableBody) return;

        if (!this.filteredUsers.length) {
            tableBody.innerHTML = `<tr><td colspan="5" class="krwmp-table-empty">No users match the current search/filter.</td></tr>`;
            if (meta) meta.textContent = `Showing 0 of ${this.users.length} users`;
            this.renderPagination();
            return;
        }

        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageUsers = this.filteredUsers.slice(start, end);
        tableBody.innerHTML = pageUsers.map(user => this.renderUserRow(user)).join('');
        if (meta) meta.textContent = `Showing ${start + 1}-${Math.min(end, this.filteredUsers.length)} of ${this.filteredUsers.length} users`;
        this.renderPagination();
    },

    renderPagination() {
        const container = document.getElementById('userDirectoryPagination');
        if (!container) return;
        const totalPages = Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
        container.innerHTML = `<span class="krwmp-pagination-meta">Page ${this.currentPage} of ${totalPages}</span><div class="krwmp-pagination-controls"><button id="userPrevPageBtn" type="button" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</button><button id="userNextPageBtn" type="button" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm" ${this.currentPage === totalPages ? 'disabled' : ''}>Next</button></div>`;
        container.querySelector('#userPrevPageBtn')?.addEventListener('click', () => { this.currentPage = Math.max(1, this.currentPage - 1); this.renderDirectoryPage(); });
        container.querySelector('#userNextPageBtn')?.addEventListener('click', () => { this.currentPage = Math.min(totalPages, this.currentPage + 1); this.renderDirectoryPage(); });
    },

    renderUserRow(user) {
        const assigned = (user.roles || []).map(r => Number(r.id));
        const dropdownOptions = this.roles.map(role => `<option value="${role.id}" ${assigned.includes(Number(role.id)) || Number(role.id) === Number(user.role_id) ? 'selected' : ''}>${this.escapeHtml(String(role.role_name).toUpperCase())}</option>`).join('');
        const safeIdentifier = this.escapeHtml(user.identifier || '');
        const safeName = this.escapeHtml(user.name || '');
        const safeDesignation = this.escapeHtml(user.designation || '');
        const safeInitials = this.escapeHtml(user.initials || 'KT');
        const isMasterUser = safeIdentifier === 'thulasi';
        const institutionName = this.escapeHtml(user.institution_name || 'No institution');
        const roleText = (user.roles || []).map(r => String(r.role_name).toUpperCase()).join(', ') || this.escapeHtml(user.role_name || '-');
        const jurisdictionText = (user.jurisdictions || []).map(j => `${j.jurisdiction_type}: ${j.jurisdiction_name}`).join(', ') || 'No jurisdiction assigned';
        const safeJurisdictionIds = this.escapeHtml(JSON.stringify(user.jurisdiction_ids || []));
        const safeEmail = this.escapeHtml(user.email || '');
        const safePhoneNumber = this.escapeHtml(user.phone_number || '');
        const email = safeEmail || '-';
        const phoneNumber = safePhoneNumber || '-';

        return `<tr><td><div class="flex items-center gap-2"><div class="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-emerald-400 uppercase">${safeInitials}</div><div><div class="text-slate-200 font-medium">${safeName}</div><div class="krwmp-status-label">${safeDesignation}</div></div></div></td><td class="text-slate-400 font-mono">${safeIdentifier}</td><td><div class="krwmp-status-label">${phoneNumber}</div><div class="krwmp-status-label">${email}</div></td><td><div class="krwmp-status-label mb-1">${institutionName}</div><select multiple size="3" data-action="assign-role" data-identifier="${safeIdentifier}"  class="form-select text-slate-300 px-1.5 py-0.5 text-[11px] font-medium cursor-pointer">${dropdownOptions}</select><div class="krwmp-status-label mt-1">${this.escapeHtml(roleText)}</div><div class="krwmp-status-label mt-1 text-emerald-300">${this.escapeHtml(jurisdictionText)}</div></td><td class="text-right"><div class="krwmp-table-actions"><button data-action="edit-user" data-identifier="${safeIdentifier}" data-name="${safeName}" data-designation="${safeDesignation}" data-initials="${safeInitials}" data-phone-number="${safePhoneNumber}" data-email="${safeEmail}" data-institution-id="${user.institution_id || ''}" data-jurisdiction-ids="${safeJurisdictionIds}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit</button><button data-action="delete-user" data-identifier="${safeIdentifier}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${isMasterUser ? 'opacity-30 cursor-not-allowed' : ''}" ${isMasterUser ? 'disabled' : ''}>Delete</button></div></td></tr>`;
    },

    renderRoleList() {
        const box = document.getElementById('roleList');
        if (!box) return;
        box.innerHTML = this.roles.map(role => {
            const privileges = this.privileges.filter(p => Number(p.role_id) === Number(role.id));
            return `<div class="krwmp-card"><div class="flex justify-between gap-2"><div><div class="font-bold text-slate-200">${this.escapeHtml(role.role_name)}</div><div class="krwmp-status-label">${this.escapeHtml(role.description || '')}</div></div><div class="krwmp-table-actions"><button data-role-edit="${role.id}" class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit</button><button data-role-delete="${role.id}" class="krwmp-btn krwmp-btn-danger krwmp-btn-sm">Delete</button></div></div><div class="mt-2 space-y-1">${privileges.map(p => `<div class="krwmp-status-label">${this.escapeHtml(p.privilege_name)}: V${p.can_view?'✓':'-'} C${p.can_create?'✓':'-'} U${p.can_update?'✓':'-'} D${p.can_delete?'✓':'-'}</div>`).join('') || '<div class="krwmp-empty-state">No privileges configured.</div>'}</div></div>`;
        }).join('');
    },

    bindDirectoryActions() {
        const tableBody = document.getElementById('userDirectoryTableBody');
        if (tableBody) {
            tableBody.addEventListener('click', async (event) => {
                const button = event.target.closest('button[data-action]');
                if (!button) return;
                const action = button.dataset.action;
                const identifier = button.dataset.identifier;
                if (action === 'edit-user') {
                    let jurisdiction_ids = [];
                    try { jurisdiction_ids = JSON.parse(button.dataset.jurisdictionIds || '[]'); } catch (_) {}
                    window.KRWMP_ADMIN_UI.fillEditForm({ identifier, name: button.dataset.name, designation: button.dataset.designation, initials: button.dataset.initials, phone_number: button.dataset.phoneNumber, email: button.dataset.email, institution_id: button.dataset.institutionId, jurisdiction_ids });
                }
                if (action === 'delete-user') await this.deleteUser(identifier);
            });
            tableBody.addEventListener('change', async (event) => {
                const select = event.target.closest('select[data-action="assign-role"]');
                if (!select) return;
                await this.assignRole(select.dataset.identifier, Array.from(select.selectedOptions).map(o => o.value));
            });
        }

        document.getElementById('openRegistrationModalBtn')?.addEventListener('click', () => { this.populateJurisdictionSelects(); window.KRWMP_ADMIN_UI.toggleRegistrationModal(true); });
        document.getElementById('userSearchInput')?.addEventListener('input', () => { this.currentPage = 1; this.applyDirectoryFilters(); });
        document.getElementById('userRoleFilter')?.addEventListener('change', () => { this.currentPage = 1; this.applyDirectoryFilters(); });
        document.getElementById('userInstitutionFilter')?.addEventListener('change', () => { this.currentPage = 1; this.applyDirectoryFilters(); });
        document.getElementById('userPageSize')?.addEventListener('change', () => { this.currentPage = 1; this.applyDirectoryFilters(); });

        document.getElementById('roleList')?.addEventListener('click', async event => {
            const edit = event.target.closest('[data-role-edit]');
            const del = event.target.closest('[data-role-delete]');
            if (edit) {
                const role = this.roles.find(r => String(r.id) === String(edit.dataset.roleEdit));
                if (role) { document.getElementById('roleEditId').value = role.id; document.getElementById('roleName').value = role.role_name; document.getElementById('roleDescription').value = role.description || ''; }
            }
            if (del && confirm('Delete this role?')) { await window.KRWMP_ADMIN_API.deleteRole(del.dataset.roleDelete); await this.refreshDirectoryData(); }
        });
    },

    bindForms() {
        const registrationForm = document.getElementById('registrationForm');
        const editForm = document.getElementById('inlineEditForm');
        const resetForm = document.getElementById('resetForm');
        const roleForm = document.getElementById('roleForm');
        const privilegeForm = document.getElementById('privilegeForm');

        if (registrationForm) registrationForm.addEventListener('submit', async event => { event.preventDefault(); if (!registrationForm.reportValidity()) return; try { await window.KRWMP_ADMIN_API.registerUser(window.KRWMP_ADMIN_UI.getRegistrationPayload()); window.KRWMP_ADMIN_UI.showSuccess('Success: User identity provisioned with jurisdiction access.'); registrationForm.reset(); window.KRWMP_ADMIN_UI.toggleRegistrationModal(false); await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Error: ' + error.message); } });
        if (editForm) editForm.addEventListener('submit', async event => { event.preventDefault(); if (!editForm.reportValidity()) return; try { await window.KRWMP_ADMIN_API.updateUser(window.KRWMP_ADMIN_UI.getEditPayload()); window.KRWMP_ADMIN_UI.showSuccess('Success: Database identity and jurisdiction access saved.'); window.KRWMP_ADMIN_UI.toggleEditModal(false); await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Error: ' + error.message); } });
        if (resetForm) resetForm.addEventListener('submit', async event => { event.preventDefault(); try { await window.KRWMP_ADMIN_API.resetPassword(window.KRWMP_ADMIN_UI.getResetPasswordPayload()); window.KRWMP_ADMIN_UI.showSuccess('Success: Passkey updated securely.'); resetForm.reset(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Error: ' + error.message); } });
        if (roleForm) roleForm.addEventListener('submit', async event => { event.preventDefault(); const id = document.getElementById('roleEditId').value; const payload = { role_name: document.getElementById('roleName').value, description: document.getElementById('roleDescription').value }; try { if (id) await window.KRWMP_ADMIN_API.updateRole(id, payload); else await window.KRWMP_ADMIN_API.createRole(payload); roleForm.reset(); document.getElementById('roleEditId').value = ''; await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Role save failed: ' + error.message); } });
        if (privilegeForm) privilegeForm.addEventListener('submit', async event => { event.preventDefault(); const payload = { role_id: document.getElementById('privRoleId').value, privilege_key: document.getElementById('privilegeKey').value, privilege_name: document.getElementById('privilegeName').value, can_view: document.getElementById('canView').checked, can_create: document.getElementById('canCreate').checked, can_update: document.getElementById('canUpdate').checked, can_delete: document.getElementById('canDelete').checked }; try { await window.KRWMP_ADMIN_API.savePrivilege(payload); privilegeForm.reset(); document.getElementById('canView').checked = true; await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Privilege save failed: ' + error.message); } });
    },

    async deleteUser(identifier) { if (identifier === 'thulasi') return; if (!confirm(`WARNING: Are you certain you want to delete user account [${identifier}] from the portal directory? This action cannot be undone.`)) return; try { await window.KRWMP_ADMIN_API.deleteUser(identifier); window.KRWMP_ADMIN_UI.showSuccess('Success: Identity row purged cleanly.'); await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Deletion failed: ' + error.message); } },
    async assignRole(identifier, roleIds) { try { await window.KRWMP_ADMIN_API.assignRole(identifier, roleIds); } catch (error) { window.KRWMP_ADMIN_UI.showError('Mutation failed: ' + error.message); await this.refreshDirectoryData(); } },
    escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
};