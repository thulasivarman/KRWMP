/**
 * ========================================================================== 
 * KRWMP MANAGEMENT PORTAL - CENTRALIZED GLOBAL RUNTIME ORCHESTRATOR
 * ========================================================================== 
 */

window.KRWMP_ENGINE = {
    ZONING_TERMINOLOGY_TAMIL: "வலயம்",
    Session: { user: null, isAuthenticated: false },

    initSession: async function () {
        try {
            const response = await fetch('/api/auth/profile');
            if (!response.ok) throw new Error(`Profile endpoint error code: ${response.status}`);
            const data = await response.json();

            if (data && data.success && data.user) {
                this.Session.user = data.user;
                this.Session.isAuthenticated = true;
            } else {
                throw new Error("Data payload invalid.");
            }
        } catch (error) {
            const cachedUser = localStorage.getItem('krwmp_user');
            if (cachedUser) {
                this.Session.user = JSON.parse(cachedUser);
                this.Session.isAuthenticated = true;
            } else {
                this.Session.user = {
                    name: "Kadampeswaran Thulasivarman",
                    designation: "Town Planner & Development Consultant",
                    initials: "KT",
                    identifier: "thulasi",
                    role_name: "admin",
                    visible_sections: ["data_layers", "raster_layers", "user_management"]
                };
                this.Session.isAuthenticated = false;
            }
        }
        this.normalizeMasterAdminSession();
        this.syncProfileMetadata();
    },

    normalizeMasterAdminSession: function () {
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
        const sidebarContainer = document.getElementById(sidebarContainerId);
        if (!sidebarContainer) return;

        try {
            const response = await fetch(sidebarUrl);
            if (!response.ok) throw new Error(`HTML fragment unresolved: ${sidebarUrl}`);
            sidebarContainer.innerHTML = await response.text();
            this.injectReportsLink();
            this.syncProfileMetadata();
        } catch (uiError) {
            console.error("UI contextual engine compile fault:", uiError);
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
        window.location.href = '/index.html';
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