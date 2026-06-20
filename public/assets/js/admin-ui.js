/**
 * KRWMP Admin UI Helpers
 */
window.KRWMP_ADMIN_UI = {
    setupSidebarActionsFallback() {
        const logoutButton = document.getElementById('sidebar-logout-btn') || document.querySelector('button[onclick*="dispatchLogout"]');
        if (!logoutButton) return;
        logoutButton.removeAttribute('onclick');
        logoutButton.addEventListener('click', (event) => {
            event.preventDefault();
            if (window.KRWMP_ENGINE && window.KRWMP_ENGINE.dispatchLogout) window.KRWMP_ENGINE.dispatchLogout();
        });
    },
    toggleEditModal(show) { const modal = document.getElementById('inlineEditModal'); if (modal) modal.classList.toggle('hidden', !show); },
    fillEditForm(user) {
        document.getElementById('editIdentifier').value = user.identifier || '';
        document.getElementById('editName').value = user.name || '';
        document.getElementById('editDesignation').value = user.designation || '';
        document.getElementById('editInitials').value = user.initials || '';
        if (document.getElementById('editPhoneNumber')) document.getElementById('editPhoneNumber').value = user.phone_number || '';
        if (document.getElementById('editEmail')) document.getElementById('editEmail').value = user.email || '';
        if (document.getElementById('editInstitutionId')) document.getElementById('editInstitutionId').value = user.institution_id || '';
        this.toggleEditModal(true);
    },
    selectedValues(selectId) { return Array.from(document.getElementById(selectId)?.selectedOptions || []).map(o => o.value).filter(Boolean); },
    getRegistrationPayload() {
        const roleIds = this.selectedValues('regRoleId');
        return {
            name: document.getElementById('regName').value,
            identifier: document.getElementById('regIdentifier').value,
            initials: document.getElementById('regInitials').value,
            designation: document.getElementById('regDesignation').value,
            phone_number: document.getElementById('regPhoneNumber')?.value || '',
            email: document.getElementById('regEmail')?.value || '',
            role_id: roleIds[0],
            role_ids: roleIds,
            institution_id: document.getElementById('regInstitutionId')?.value || null,
            password: document.getElementById('regPassword').value
        };
    },
    getEditPayload() {
        return {
            name: document.getElementById('editName').value,
            designation: document.getElementById('editDesignation').value,
            initials: document.getElementById('editInitials').value,
            phone_number: document.getElementById('editPhoneNumber')?.value || '',
            email: document.getElementById('editEmail')?.value || '',
            identifier: document.getElementById('editIdentifier').value,
            institution_id: document.getElementById('editInstitutionId')?.value || null
        };
    },
    getResetPasswordPayload() { return { targetUserIdentifier: document.getElementById('resetIdentifier').value, newPassword: document.getElementById('resetPassword').value }; },
    showSuccess(message) { alert(message); },
    showError(message) { alert(message); }
};
window.toggleEditModal = function (show) { window.KRWMP_ADMIN_UI.toggleEditModal(show); };
