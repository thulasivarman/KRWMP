/**
 * ===========================================================================
 * KRWMP MANAGEMENT PORTAL - CENTRALIZED GLOBAL RUNTIME ORCHESTRATOR
 * ===========================================================================
 */
window.KRWMP_UTILS = window.KRWMP_UTILS || (() => {
    const isPlainObject = value => Object.prototype.toString.call(value) === '[object Object]';

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeAttribute(value) {
        return escapeHtml(value);
    }

    function setText(element, value) {
        if (element) element.textContent = value ?? '';
    }

    function setHtml(element, html) {
        if (element) element.innerHTML = html || '';
    }

    function renderEmpty(element, message, className = 'text-sm text-slate-400') {
        setHtml(element, `<p class="${escapeAttribute(className)}">${escapeHtml(message)}</p>`);
    }

    function showStatus(element, message, error = false) {
        if (!element) return;
        element.className = `rounded-lg p-3 text-sm ${error ? 'bg-rose-500/10 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'}`;
        element.textContent = message || '';
        element.classList.remove('hidden');
    }

    function createOption({ value = '', label = '', selected = false } = {}) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = Boolean(selected);
        return option;
    }

    function resetSelect(select, placeholder, disabled = false) {
        if (!select) return;
        select.innerHTML = '';
        select.appendChild(createOption({ value: '', label: placeholder }));
        select.disabled = disabled;
    }

    async function parseResponse(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return response.json().catch(() => ({}));
        const text = await response.text().catch(() => '');
        return text ? { success: response.ok, data: text } : {};
    }

    async function apiRequest(url, options = {}) {
        const requestOptions = { cache: 'no-store', credentials: 'same-origin', ...options };
        const headers = { ...(options.headers || {}) };

        if (isPlainObject(options.body)) {
            requestOptions.body = JSON.stringify(options.body);
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        }

        if (Object.keys(headers).length) requestOptions.headers = headers;
        const response = await fetch(url, requestOptions);
        const data = await parseResponse(response);
        if (!response.ok || data.success === false) throw new Error(data.message || 'Request failed');
        return data;
    }

    return {
        apiRequest,
        request: apiRequest,
        escapeHtml,
        escapeAttribute,
        setText,
        setHtml,
        renderEmpty,
        showStatus,
        createOption,
        resetSelect,
    };
})();

window.KRWMP_ENGINE = {
    ZONING_TERMINOLOGY_TAMIL: "வலயம்",
    Session: { user: null, isAuthenticated: false },

    ensureMobileStylesheet: function () {
        if (document.getElementById('krwmp-mobile-fixes-css')) return;
        const link = document.createElement('link');
        link.id = 'krwmp-mobile-fixes-css';
        link.rel = 'stylesheet';
        link.href = '/assets/css/krwmp-mobile-fixes.css';
        document.head.appendChild(link);
    },

    initSession: async function () {
        try {
            localStorage.removeItem('krwmp_token');
            const data = await window.KRWMP_UTILS.apiRequest('/api/auth/profile');
            if (!data.user) throw new Error(data.message || 'Not authenticated');
            this.Session.user = data.user;
            this.Session.isAuthenticated = true;
            localStorage.setItem('krwmp_user', JSON.stringify(data.user));
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
        this.ensureMobileStylesheet();
        sidebarContainer.dataset.krwmpShellInstalled = 'true';
        sidebarContainer.classList.add('krwmp-sidebar');
        document.body.classList.add('krwmp-has-sidebar');
        document.body.classList.remove('krwmp-sidebar-collapsed', 'krwmp-mobile-sidebar-open');
        localStorage.removeItem('krwmp_sidebar_collapsed');

        const oldToggle = document.getElementById('krwmp-sidebar-toggle');
        if (oldToggle) oldToggle.remove();

        let mobileToggle = document.getElementById('krwmp-mobile-sidebar-btn');
        if (!mobileToggle) {
            mobileToggle = document.createElement('button');
            mobileToggle.id = 'krwmp-mobile-sidebar-btn';
            mobileToggle.type = 'button';
            mobileToggle.className = 'krwmp-mobile-sidebar-btn';
            mobileToggle.setAttribute('aria-label', 'Open navigation menu');
            mobileToggle.setAttribute('aria-expanded', 'false');
            mobileToggle.textContent = '☰';
            document.body.appendChild(mobileToggle);
        }

        let mobileScrim = document.getElementById('krwmp-mobile-sidebar-scrim');
        if (!mobileScrim) {
            mobileScrim = document.createElement('div');
            mobileScrim.id = 'krwmp-mobile-sidebar-scrim';
            mobileScrim.className = 'krwmp-mobile-sidebar-scrim';
            document.body.appendChild(mobileScrim);
        }

        const closeMobileSidebar = () => {
            document.body.classList.remove('krwmp-mobile-sidebar-open');
            mobileToggle.setAttribute('aria-expanded', 'false');
            mobileToggle.setAttribute('aria-label', 'Open navigation menu');
            mobileToggle.textContent = '☰';
        };

        const openMobileSidebar = () => {
            document.body.classList.add('krwmp-mobile-sidebar-open');
            mobileToggle.setAttribute('aria-expanded', 'true');
            mobileToggle.setAttribute('aria-label', 'Close navigation menu');
            mobileToggle.textContent = '×';
        };

        if (mobileToggle.dataset.krwmpBound !== 'true') {
            mobileToggle.dataset.krwmpBound = 'true';
            mobileToggle.addEventListener('click', () => {
                if (document.body.classList.contains('krwmp-mobile-sidebar-open')) closeMobileSidebar();
                else openMobileSidebar();
            });
        }

        if (mobileScrim.dataset.krwmpBound !== 'true') {
            mobileScrim.dataset.krwmpBound = 'true';
            mobileScrim.addEventListener('click', closeMobileSidebar);
        }

        if (document.body.dataset.krwmpSidebarEscapeBound !== 'true') {
            document.body.dataset.krwmpSidebarEscapeBound = 'true';
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') closeMobileSidebar();
            });
        }

        sidebarContainer.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobileSidebar));

        const brandToggle = document.getElementById('krwmp-sidebar-brand-toggle');
        if (brandToggle) {
            brandToggle.setAttribute('aria-expanded', 'true');
            brandToggle.setAttribute('aria-label', 'Watershed Intelligence System');
            brandToggle.setAttribute('title', 'Watershed Intelligence System');
            brandToggle.disabled = true;
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
            if (allowedSections.includes(sectionKey)) {
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
        window.location.href = '/admin.html?edit_profile=1';
    },

    dispatchLogout: async function () {
        try {
            await window.KRWMP_UTILS.apiRequest('/api/logout', { method: 'POST' });
        } catch (error) {}
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
