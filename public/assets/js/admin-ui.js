/**
 * KRWMP Admin UI Helpers
 * Handles modal, sidebar fallback, and form value collection.
 */

window.KRWMP_ADMIN_UI = {
    setupSidebarActionsFallback() {
        const logoutButton =
            document.getElementById('sidebar-logout-btn') ||
            document.querySelector('button[onclick*="dispatchLogout"]');

        if (!logoutButton) return;

        logoutButton.removeAttribute('onclick');
        logoutButton.addEventListener('click', (event) => {
            event.preventDefault();

            if (window.KRWMP_ENGINE && window.KRWMP_ENGINE.dispatchLogout) {
                window.KRWMP_ENGINE.dispatchLogout();
            }
        });
    },

    toggleEditModal(show) {
        const modal = document.getElementById('inlineEditModal');
        if (modal) modal.classList.toggle('hidden', !show);
    },

    fillEditForm(user) {
        document.getElementById('editIdentifier').value = user.identifier || '';
        document.getElementById('editName').value = user.name || '';
        document.getElementById('editDesignation').value = user.designation || '';
        document.getElementById('editInitials').value = user.initials || '';

        this.toggleEditModal(true);
    },

    getRegistrationPayload() {
        return {
            name: document.getElementById('regName').value,
            identifier: document.getElementById('regIdentifier').value,
            initials: document.getElementById('regInitials').value,
            designation: document.getElementById('regDesignation').value,
            role_id: document.getElementById('regRoleId').value,
            password: document.getElementById('regPassword').value
        };
    },

    getEditPayload() {
        return {
            name: document.getElementById('editName').value,
            designation: document.getElementById('editDesignation').value,
            initials: document.getElementById('editInitials').value,
            identifier: document.getElementById('editIdentifier').value
        };
    },

    getResetPasswordPayload() {
        return {
            targetUserIdentifier: document.getElementById('resetIdentifier').value,
            newPassword: document.getElementById('resetPassword').value
        };
    },

    showSuccess(message) {
        alert(message);
    },

    showError(message) {
        alert(message);
    }
};

// Backward-compatible global function used by existing modal close buttons.
window.toggleEditModal = function (show) {
    window.KRWMP_ADMIN_UI.toggleEditModal(show);
};
