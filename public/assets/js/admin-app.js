/**
 * KRWMP Admin App Initializer
 */

function loadAdminScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.KRWMP_ENGINE) {
        await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
        await window.KRWMP_PRIVILEGES.protectPage('user_management_settings', 'view');
        window.KRWMP_ADMIN_UI.setupSidebarActionsFallback();
    }

    await loadAdminScript('/assets/js/admin-jurisdiction-builder.js');
    window.KRWMP_JURISDICTION_BUILDER?.patchApi();
    window.KRWMP_JURISDICTION_BUILDER?.patchUsers();

    window.KRWMP_ADMIN_USERS.bindDirectoryActions();
    window.KRWMP_ADMIN_USERS.bindForms();

    await window.KRWMP_ADMIN_USERS.refreshDirectoryData();
});