/**
 * ========================================================================== 
 * KRWMP MANAGEMENT PORTAL - CENTRALIZED GLOBAL RUNTIME ORCHESTRATOR
 * ========================================================================== 
 */
(function installKrwmpAuthFetch() {
    if (window.__KRWMP_AUTH_FETCH_INSTALLED__) return;
    window.__KRWMP_AUTH_FETCH_INSTALLED__ = true;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init = {}) {
        const url = typeof input === 'string' ? input : input?.url || '';
        const isApiRequest = String(url).startsWith('/api/') || String(url).includes('/api/');
        if (!isApiRequest) return nativeFetch(input, init);
        const token = localStorage.getItem('krwmp_token');
        if (!token) return nativeFetch(input, init);
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : {}));
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        return nativeFetch(input, { ...init, headers });
    };
})();

window.KRWMP_ENGINE = {
    ZONING_TERMINOLOGY_TAMIL: "வலயம்",
    Session: { user: null, isAuthenticated: false },

    initSession: async function () {
        try {
            const cachedUser = localStorage.getItem('krwmp_user');
            const cachedToken = localStorage.getItem('krwmp_token');
            if (cachedUser && cachedToken) {
                this.Session.user = JSON.parse(cachedUser);
                this.Session.isAuthenticated = true;
            } else {
                this.Session.user = null;
                this.Session.isAuthenticated = false;
            }
        } catch (error) {
            this.Session.user = null;
            this.Session.isAuthenticated = false;
            localStorage.removeItem('krwmp_user');
            localStorage.removeItem('krwmp_token');
        }
        this.normalizeMasterAdminSession();
        this.syncProfileMetadata();
    },

    requireAuthenticatedSession: function () {
        if (!this.Session.isAuthenticated || !this.Session.user) {
            window.location.replace('/login.html');
            return false;
        }
        return true;
    },

    normalizeMasterAdminSession: function () {
        if (!this.Session.isAuthenticated || !this.Session.user) return;
        const profile = this.Session.user || {};
        const identifier = String(profile.identifier || profile.username || '').trim().toLowerCase();
        if (identifier === 'thulasi') {
            profile.role_name = 'admin';
            profile.visible_sections = Array.from(new Set([...(profile.visible_sections || []), 'data_layers', 'raster_layers', 'user_management']));
            this.Session.user = profile;
            localStorage.setItem('krwmp_user', JSON.stringify(profile));
        }
    },

    assembleInterfaceContext: async function (sidebarUrl = '/sidebar.html', sidebarContainerId = 'sidebar') {
        await this.initSession();
        if (!this.requireAuthenticatedSession()) return;
        const sidebarContainer = document.getElementById(sidebarContainerId);
        if (!sidebarContainer) return;

        try {
            const response = await fetch(sidebarUrl);
            if (!response.ok) throw new Error(`HTML fragment unresolved: ${sidebarUrl}`);
            sidebarContainer.innerHTML = await response.text();
            this.installSidebarShell(sidebarContainer);
            this.injectReportsLink();
            this.syncProfileMetadata();
            document.dispatchEvent(new CustomEvent('krwmp:sidebar-loaded'));
        } catch (uiError) {
            console.error("UI contextual engine compile fault:", uiError);
        }
    },

    installSidebarShell: function (sidebarContainer) {
        if (!sidebarContainer || sidebarContainer.dataset.krwmpShellInstalled === 'true') return;
        sidebarContainer.dataset.krwmpShellInstalled = 'true';
        sidebarContainer.classList.add('krwmp-sidebar');
        document.body.classList.add('krwmp-has-sidebar');

        const savedState = localStorage.getItem('krwmp_sidebar_collapsed');
        const shouldCollapse = savedState === 'true';
        document.body.classList.toggle('krwmp-sidebar-collapsed', shouldCollapse);

        let toggle = document.getElementById('krwmp-sidebar-toggle');
        if (!toggle) {
            toggle = document.createElement('button');
            toggle.id = 'krwmp-sidebar-toggle';
            toggle.type = 'button';
            toggle.className = 'krwmp-sidebar-toggle';
            toggle.setAttribute('aria-controls', sidebarContainer.id || 'sidebar');
            toggle.setAttribute('title', 'Show / hide sidebar');
            document.body.appendChild(toggle);
        }

        const syncToggle = () => {
            const collapsed = document.body.classList.contains('krwmp-sidebar-collapsed');
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.innerHTML = collapsed ? '&#9776;' : '&lsaquo;';
            toggle.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
        };

        syncToggle();

        if (toggle.dataset.krwmpBound !== 'true') {
            toggle.dataset.krwmpBound = 'true';
            toggle.addEventListener('click', () => {
                const collapsed = document.body.classList.toggle('krwmp-sidebar-collapsed');
                localStorage.setItem('krwmp_sidebar_collapsed', String(collapsed));
                syncToggle();
                window.setTimeout(() => window.dispatchEvent(new Event('resize')), 260);
            });
        }
    },

    injectReportsLink: function () {
        if (document.querySelector('a[href="/reports.html"]')) return;
        const homeLink = document.getElementById('sidebar-home-link');
        if (!homeLink || !homeLink.parentElement) return;
        const reportLink = document.createElement('a');
        reportLink.href = '/reports.html';
        reportLink.className = homeLink.className;
        reportLink.innerHTML = '<span>Reports</span>';
        homeLink.insertAdjacentElement('afterend', reportLink);
    },

    syncProfileMetadata: function () {
        const profile = this.Session.user;
        if (!profile) return;

        const identifier = String(profile.identifier || profile.username || '').trim().toLowerCase();
        const roleName = String(profile.role_name || profile.role || '').trim().toLowerCase();
        const isMasterAdmin = identifier === 'thulasi' || roleName === 'admin';

        const elementsMap = {
            'userNameLabel': profile.name,
            'userDesignationLabel': `${profile.designation || ''} (${isMasterAdmin ? 'ADMIN' : String(profile.role_name || '').toUpperCase()})`,
            'userInitialsLabel': profile.initials
        };

        for (const [elementId, targetValue] of Object.entries(elementsMap)) {
            const domNode = document.getElementById(elementId);
            if (domNode) domNode.innerText = targetValue || '';
        }

        const currentPath = window.location.pathname;
        const isCurrentPageAdminWorkspace =
            currentPath.endsWith('admin.html') ||
            currentPath.endsWith('admin-institutions.html') ||
            currentPath.endsWith('admin-vector-layers.html') ||
            currentPath.endsWith('admin-raster-layers.html');

        const structuralSections = {
            'section-data-layers': 'data_layers',
            'section-raster-layers': 'raster_layers',
            'section-user-management': 'user_management'
        };

        let allowedSections = [];
        try {
            allowedSections = typeof profile.visible_sections === 'string'
                ? JSON.parse(profile.visible_sections)
                : profile.visible_sections || [];
        } catch (e) {
            allowedSections = profile.visible_sections || [];
        }

        if (isMasterAdmin) {
            allowedSections = Array.from(new Set([...allowedSections, 'data_layers', 'raster_layers', 'user_management']));
        }

        for (const [domId, sectionKey] of Object.entries(structuralSections)) {
            const containerNode = document.getElementById(domId);
            if (!containerNode) continue;

            if (isCurrentPageAdminWorkspace && sectionKey !== 'user_management') {
                containerNode.classList.add('hidden');
            } else if (allowedSections.includes(sectionKey)) {
                containerNode.classList.remove('hidden');
            } else {
                containerNode.classList.add('hidden');
            }
        }

        if (isMasterAdmin) {
            const adminSection = document.getElementById('section-user-management');
            if (adminSection) adminSection.classList.remove('hidden');
        }

        const basemapSection = document.getElementById('basemap-selector')?.closest('.krwmp-panel-section');
        if (basemapSection && isCurrentPageAdminWorkspace) {
            basemapSection.classList.add('hidden');
        }
    },

    dispatchProfileEdit: function () {
        alert('Profile editing is available from the User Management module.');
    },

    dispatchLogout: function () {
        localStorage.removeItem('krwmp_user');
        localStorage.removeItem('krwmp_token');
        this.Session.user = null;
        this.Session.isAuthenticated = false;
        window.location.replace('/login.html');
    }
};

window.KRWMP_BASEMAPS = {
    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    terrain: 'https://demotiles.maplibre.org/style.json',
    satellite: {
        version: 8,
        sources: {
            satellite: {
                type: 'raster',
                tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256,
                attribution: 'Esri'
            }
        },
        layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite' }]
    }
};
