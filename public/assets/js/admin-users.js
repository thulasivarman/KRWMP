/**
 * KRWMP Admin User Management
 */
window.KRWMP_ADMIN_USERS = {
    roles: [],
    institutions: [],
    privileges: [],

    async refreshDirectoryData() {
        const tableBody = document.getElementById('userDirectoryTableBody');
        const selectRole = document.getElementById('regRoleId');
        const privRole = document.getElementById('privRoleId');
        const regInstitution = document.getElementById('regInstitutionId');
        const editInstitution = document.getElementById('editInstitutionId');

        try {
            const data = await window.KRWMP_ADMIN_API.getUsers();
            this.roles = data.roles || [];
            this.institutions = data.institutions || [];
            this.privileges = data.privileges || [];

            const roleOptions = this.roles.map(role => `<option value="${role.id}">${this.escapeHtml(String(role.role_name).toUpperCase())} - ${this.escapeHtml(role.description || '')}</option>`).join('');
            if (selectRole) selectRole.innerHTML = roleOptions;
            if (privRole) privRole.innerHTML = roleOptions;

            const institutionOptions = '<option value="">Select institution</option>' + this.institutions.map(i => `<option value="${i.id}">${this.escapeHtml(i.institution_name)}</option>`).join('');
            if (regInstitution) regInstitution.innerHTML = institutionOptions;
            if (editInstitution) editInstitution.innerHTML = institutionOptions;

            this.renderRoleList();
            if (!tableBody) return;

            const users = data.users || [];
            if (users.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="4" class="krwmp-table-empty">No users found.</td></tr>`;
                return;
            }
            tableBody.innerHTML = users.map(user => this.renderUserRow(user)).join('');
        } catch (error) {
            if (tableBody) tableBody.innerHTML = `<tr><td colspan="4" class="krwmp-table-empty text-rose-400">Failed to synchronize identity data matrix from database rows.</td></tr>`;
            console.error(error);
        }
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

        return `<tr><td><div class="flex items-center gap-2"><div class="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-emerald-400 uppercase">${safeInitials}</div><div><div class="text-slate-200 font-medium">${safeName}</div><div class="krwmp-status-label">${safeDesignation}</div></div></div></td><td class="text-slate-400 font-mono">${safeIdentifier}</td><td><div class="krwmp-status-label mb-1">${institutionName}</div><select multiple size="3" data-action="assign-role" data-identifier="${safeIdentifier}"  class="krwmp-select text-slate-300 px-1.5 py-0.5 text-[11px] font-medium cursor-pointer">${dropdownOptions}</select><div class="krwmp-status-label mt-1">${this.escapeHtml(roleText)}</div></td><td class="text-right"><div class="krwmp-table-actions"><button data-action="edit-user" data-identifier="${safeIdentifier}" data-name="${safeName}" data-designation="${safeDesignation}" data-initials="${safeInitials}" data-institution-id="${user.institution_id || ''}"  class="krwmp-btn krwmp-btn-secondary krwmp-btn-sm">Edit</button><button data-action="delete-user" data-identifier="${safeIdentifier}"  class="krwmp-btn krwmp-btn-danger krwmp-btn-sm ${isMasterUser ? 'opacity-30 cursor-not-allowed' : ''}" ${isMasterUser ? 'disabled' : ''}>Delete</button></div></td></tr>`;
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
                if (action === 'edit-user') window.KRWMP_ADMIN_UI.fillEditForm({ identifier, name: button.dataset.name, designation: button.dataset.designation, initials: button.dataset.initials, institution_id: button.dataset.institutionId });
                if (action === 'delete-user') await this.deleteUser(identifier);
            });
            tableBody.addEventListener('change', async (event) => {
                const select = event.target.closest('select[data-action="assign-role"]');
                if (!select) return;
                await this.assignRole(select.dataset.identifier, Array.from(select.selectedOptions).map(o => o.value));
            });
        }

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

        if (registrationForm) registrationForm.addEventListener('submit', async event => { event.preventDefault(); try { await window.KRWMP_ADMIN_API.registerUser(window.KRWMP_ADMIN_UI.getRegistrationPayload()); window.KRWMP_ADMIN_UI.showSuccess('Success: User identity provisioned within Supabase.'); registrationForm.reset(); await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Error: ' + error.message); } });
        if (editForm) editForm.addEventListener('submit', async event => { event.preventDefault(); try { await window.KRWMP_ADMIN_API.updateUser(window.KRWMP_ADMIN_UI.getEditPayload()); window.KRWMP_ADMIN_UI.showSuccess('Success: Database identity adjustments saved.'); window.KRWMP_ADMIN_UI.toggleEditModal(false); await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Error: ' + error.message); } });
        if (resetForm) resetForm.addEventListener('submit', async event => { event.preventDefault(); try { await window.KRWMP_ADMIN_API.resetPassword(window.KRWMP_ADMIN_UI.getResetPasswordPayload()); window.KRWMP_ADMIN_UI.showSuccess('Success: Passkey updated securely.'); resetForm.reset(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Error: ' + error.message); } });
        if (roleForm) roleForm.addEventListener('submit', async event => { event.preventDefault(); const id = document.getElementById('roleEditId').value; const payload = { role_name: document.getElementById('roleName').value, description: document.getElementById('roleDescription').value }; try { if (id) await window.KRWMP_ADMIN_API.updateRole(id, payload); else await window.KRWMP_ADMIN_API.createRole(payload); roleForm.reset(); document.getElementById('roleEditId').value = ''; await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Role save failed: ' + error.message); } });
        if (privilegeForm) privilegeForm.addEventListener('submit', async event => { event.preventDefault(); const payload = { role_id: document.getElementById('privRoleId').value, privilege_key: document.getElementById('privilegeKey').value, privilege_name: document.getElementById('privilegeName').value, can_view: document.getElementById('canView').checked, can_create: document.getElementById('canCreate').checked, can_update: document.getElementById('canUpdate').checked, can_delete: document.getElementById('canDelete').checked }; try { await window.KRWMP_ADMIN_API.savePrivilege(payload); privilegeForm.reset(); document.getElementById('canView').checked = true; await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Privilege save failed: ' + error.message); } });
    },

    async deleteUser(identifier) { if (identifier === 'thulasi') return; if (!confirm(`WARNING: Are you certain you want to delete user account [${identifier}] from the portal directory? This action cannot be undone.`)) return; try { await window.KRWMP_ADMIN_API.deleteUser(identifier); window.KRWMP_ADMIN_UI.showSuccess('Success: Identity row purged cleanly.'); await this.refreshDirectoryData(); } catch (error) { window.KRWMP_ADMIN_UI.showError('Deletion failed: ' + error.message); } },
    async assignRole(identifier, roleIds) { try { await window.KRWMP_ADMIN_API.assignRole(identifier, roleIds); } catch (error) { window.KRWMP_ADMIN_UI.showError('Mutation failed: ' + error.message); await this.refreshDirectoryData(); } },
    escapeHtml(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;'); }
};
