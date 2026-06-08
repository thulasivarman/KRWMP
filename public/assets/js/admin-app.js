/**
 * KRWMP Admin App Initializer
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (window.KRWMP_ENGINE) {
        await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
        window.KRWMP_ADMIN_UI.setupSidebarActionsFallback();
    }

    window.KRWMP_ADMIN_USERS.bindDirectoryActions();
    window.KRWMP_ADMIN_USERS.bindForms();

    await window.KRWMP_ADMIN_USERS.refreshDirectoryData();
});
