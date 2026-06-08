/**
 * KRWMP Admin User Management
 * Handles directory rendering and user mutations.
 */

window.KRWMP_ADMIN_USERS = {
    roles: [],

    async refreshDirectoryData() {
        const tableBody = document.getElementById('userDirectoryTableBody');
        const selectRole = document.getElementById('regRoleId');

        try {
            const data = await window.KRWMP_ADMIN_API.getUsers();

            this.roles = data.roles || [];

            if (selectRole) {
                selectRole.innerHTML = this.roles.map((role) => {
                    return `<option value="${role.id}">${String(role.role_name).toUpperCase()} - ${role.description || ''}</option>`;
                }).join('');
            }

            if (!tableBody) return;

            const users = data.users || [];

            if (users.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-8 text-center text-xs text-slate-500">
                            No users found.
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = users.map((user) => this.renderUserRow(user)).join('');

        } catch (error) {
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="4" class="py-4 text-center text-rose-500 font-medium">
                            Failed to synchronize identity data matrix from database rows.
                        </td>
                    </tr>
                `;
            }

            console.error(error);
        }
    },

    renderUserRow(user) {
        const dropdownOptions = this.roles.map((role) => {
            const selected = Number(role.id) === Number(user.role_id) ? 'selected' : '';
            return `<option value="${role.id}" ${selected}>${String(role.role_name).toUpperCase()}</option>`;
        }).join('');

        const safeIdentifier = this.escapeHtml(user.identifier || '');
        const safeName = this.escapeHtml(user.name || '');
        const safeDesignation = this.escapeHtml(user.designation || '');
        const safeInitials = this.escapeHtml(user.initials || 'KT');
        const isMasterUser = safeIdentifier === 'thulasi';

        return `
            <tr class="border-b border-slate-800/30 text-xs text-slate-300 hover:bg-slate-900/40 transition">
                <td class="py-3.5">
                    <div class="flex items-center gap-2">
                        <div class="h-7 w-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-emerald-400 uppercase">
                            ${safeInitials}
                        </div>
                        <div>
                            <div class="text-slate-200 font-medium">${safeName}</div>
                            <div class="text-[10px] text-slate-500 font-normal">${safeDesignation}</div>
                        </div>
                    </div>
                </td>
                <td class="py-3.5 text-slate-400 font-mono">${safeIdentifier}</td>
                <td class="py-3.5">
                    <select
                        data-action="assign-role"
                        data-identifier="${safeIdentifier}"
                        class="bg-slate-950 border border-slate-800 text-slate-300 rounded px-1.5 py-0.5 text-[11px] font-medium cursor-pointer focus:outline-none">
                        ${dropdownOptions}
                    </select>
                </td>
                <td class="py-3.5 text-right space-x-1">
                    <button
                        data-action="edit-user"
                        data-identifier="${safeIdentifier}"
                        data-name="${safeName}"
                        data-designation="${safeDesignation}"
                        data-initials="${safeInitials}"
                        class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-2.5 py-1 rounded transition text-[10px] font-semibold">
                        Edit
                    </button>

                    <button
                        data-action="delete-user"
                        data-identifier="${safeIdentifier}"
                        class="bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/40 text-rose-400 px-2.5 py-1 rounded transition text-[10px] font-semibold ${isMasterUser ? 'opacity-30 cursor-not-allowed' : ''}"
                        ${isMasterUser ? 'disabled' : ''}>
                        Delete
                    </button>
                </td>
            </tr>
        `;
    },

    bindDirectoryActions() {
        const tableBody = document.getElementById('userDirectoryTableBody');
        if (!tableBody) return;

        tableBody.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            const identifier = button.dataset.identifier;

            if (action === 'edit-user') {
                window.KRWMP_ADMIN_UI.fillEditForm({
                    identifier,
                    name: button.dataset.name,
                    designation: button.dataset.designation,
                    initials: button.dataset.initials
                });
            }

            if (action === 'delete-user') {
                await this.deleteUser(identifier);
            }
        });

        tableBody.addEventListener('change', async (event) => {
            const select = event.target.closest('select[data-action="assign-role"]');
            if (!select) return;

            await this.assignRole(select.dataset.identifier, select.value);
        });
    },

    bindForms() {
        const registrationForm = document.getElementById('registrationForm');
        const editForm = document.getElementById('inlineEditForm');
        const resetForm = document.getElementById('resetForm');

        if (registrationForm) {
            registrationForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                try {
                    await window.KRWMP_ADMIN_API.registerUser(
                        window.KRWMP_ADMIN_UI.getRegistrationPayload()
                    );

                    window.KRWMP_ADMIN_UI.showSuccess('Success: User identity provisioned within Supabase.');
                    registrationForm.reset();
                    await this.refreshDirectoryData();

                } catch (error) {
                    window.KRWMP_ADMIN_UI.showError('Error: ' + error.message);
                }
            });
        }

        if (editForm) {
            editForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                try {
                    await window.KRWMP_ADMIN_API.updateUser(
                        window.KRWMP_ADMIN_UI.getEditPayload()
                    );

                    window.KRWMP_ADMIN_UI.showSuccess('Success: Database identity adjustments saved.');
                    window.KRWMP_ADMIN_UI.toggleEditModal(false);
                    await this.refreshDirectoryData();

                } catch (error) {
                    window.KRWMP_ADMIN_UI.showError('Error: ' + error.message);
                }
            });
        }

        if (resetForm) {
            resetForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                try {
                    await window.KRWMP_ADMIN_API.resetPassword(
                        window.KRWMP_ADMIN_UI.getResetPasswordPayload()
                    );

                    window.KRWMP_ADMIN_UI.showSuccess('Success: Passkey updated securely.');
                    resetForm.reset();

                } catch (error) {
                    window.KRWMP_ADMIN_UI.showError('Error: ' + error.message);
                }
            });
        }
    },

    async deleteUser(identifier) {
        if (identifier === 'thulasi') return;

        const confirmed = confirm(
            `WARNING: Are you certain you want to delete user account [${identifier}] from the portal directory? This action cannot be undone.`
        );

        if (!confirmed) return;

        try {
            await window.KRWMP_ADMIN_API.deleteUser(identifier);
            window.KRWMP_ADMIN_UI.showSuccess('Success: Identity row purged cleanly.');
            await this.refreshDirectoryData();

        } catch (error) {
            window.KRWMP_ADMIN_UI.showError('Deletion failed: ' + error.message);
        }
    },

    async assignRole(identifier, newRoleId) {
        try {
            await window.KRWMP_ADMIN_API.assignRole(identifier, newRoleId);

        } catch (error) {
            window.KRWMP_ADMIN_UI.showError('Mutation failed: ' + error.message);
            await this.refreshDirectoryData();
        }
    },

    escapeHtml(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
};
