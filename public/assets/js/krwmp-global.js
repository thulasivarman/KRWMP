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
                console.log("🚀 KRWMP Database Context loaded successfully: ", this.Session.user.name);
            } else {
                throw new Error("Data payload invalid.");
            }
        } catch (error) {
            console.warn("⚠️ API fetch skipped. Falling back to persistence layer caches:", error);
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
                    visible_sections: ["data_layers", "spatial_analysis", "modeling_results", "implementations", "user_management"]
                };
                this.Session.isAuthenticated = false;
            }
        }
        this.syncProfileMetadata();
    },


    assembleInterfaceContext: async function (sidebarUrl = '/sidebar.html', sidebarContainerId = 'sidebar') {
        await this.initSession();
        const sidebarContainer = document.getElementById(sidebarContainerId);
        if (!sidebarContainer) return;

        try {
            const response = await fetch(sidebarUrl);
            if (!response.ok) throw new Error(`HTML fragment unresolved: ${sidebarUrl}`);
            sidebarContainer.innerHTML = await response.text();
            this.syncProfileMetadata();
        } catch (uiError) {
            console.error("UI contextual engine compile fault:", uiError);
        }
    },

    syncProfileMetadata: function () {
        const profile = this.Session.user;
        if (!profile) return;

        // 1. Synchronize UI Text Metrics Labels
        const elementsMap = {
            'userNameLabel': profile.name,
            'userDesignationLabel': `${profile.designation} (${profile.role_name.toUpperCase()})`,
            'userInitialsLabel': profile.initials
        };

        for (const [elementId, targetValue] of Object.entries(elementsMap)) {
            const domNode = document.getElementById(elementId);
            if (domNode) domNode.innerText = targetValue;
        }

        // 2. Map Portal Navigation Home Link Branding Anchor Adjustment
        const brandAnchor = document.getElementById('sidebar-brand-title') || document.querySelector('.sidebar-brand-container a') || document.querySelector('aside h1 a');
        if (brandAnchor) {
            brandAnchor.setAttribute('href', '/map.html');
            brandAnchor.classList.add('hover:text-emerald-400', 'transition-colors');
        }

        // 3. Dynamic Menu Composition with Admin Workspace Filtering Rules
        const isCurrentPageAdminWorkspace = window.location.pathname.endsWith('admin.html');

        const structuralSections = {
            'section-data-layers': 'data_layers',
            'section-spatial-analysis': 'spatial_analysis',
            'section-modeling-results': 'modeling_results',
            'section-implementations': 'implementations',
            'section-user-management': 'user_management'
        };

        let allowedSections = [];
        try {
            allowedSections = typeof profile.visible_sections === 'string' 
                ? JSON.parse(profile.visible_sections) 
                : profile.visible_sections || [];
        } catch(e) { 
            allowedSections = profile.visible_sections || []; 
        }

        for (const [domId, sectionKey] of Object.entries(structuralSections)) {
            const containerNode = document.getElementById(domId);
            if (containerNode) {
                // FILTER EXTENSION: If user is inside admin page, hide all map-specific control panels
                if (isCurrentPageAdminWorkspace && sectionKey !== 'user_management') {
                    containerNode.classList.add('hidden');
                } else if (allowedSections.includes(sectionKey)) {
                    containerNode.classList.remove('hidden');
                } else {
                    containerNode.classList.add('hidden');
                }
            }
        }
    },

    dispatchProfileEdit: function () {
        if (document.getElementById('krwmp-profile-modal')) return;

        const profile = this.Session.user;
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'krwmp-profile-modal';
        modalOverlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fade-in';
        
        modalOverlay.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl transform scale-100 transition-all text-xs">
                <div class="flex items-center justify-between pb-3 border-b border-slate-800">
                    <h3 class="text-sm font-bold tracking-wider text-slate-200 uppercase">Modify Planning Profile</h3>
                    <button id="close-profile-modal" class="text-slate-400 hover:text-white text-lg transition">&times;</button>
                </div>
                
                <form id="profile-edit-form" class="mt-4 space-y-4">
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                        <input type="text" id="input-profile-name" value="${profile.name || ''}" class="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/50" required>
                    </div>
                    <div>
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Professional Designation</label>
                        <input type="text" id="input-profile-desc" value="${profile.designation || ''}" class="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/50" required>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Avatar Initials</label>
                            <input type="text" id="input-profile-initials" value="${profile.initials || ''}" maxlength="3" class="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500/50 uppercase" required>
                        </div>
                        <div>
                            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">System Identifier</label>
                            <input type="text" id="input-profile-id" value="${profile.identifier || 'thulasi'}" class="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-slate-400 focus:outline-none border-dashed bg-slate-950/40 cursor-not-allowed select-none" readonly disabled>
                        </div>
                    </div>
                    <div class="pt-2 flex justify-end gap-2 font-medium">
                        <button type="button" id="cancel-profile-modal" class="bg-slate-800 hover:bg-slate-750 text-slate-300 px-4 py-2 rounded transition">Cancel</button>
                        <button type="submit" id="save-profile-btn" class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded transition shadow-lg shadow-emerald-950/20">Save Updates</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        const dropModal = () => modalOverlay.remove();
        document.getElementById('close-profile-modal').addEventListener('click', dropModal);
        document.getElementById('cancel-profile-modal').addEventListener('click', dropModal);

        document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('save-profile-btn');
            submitBtn.disabled = true;
            submitBtn.innerText = "Saving Fields...";

            const updatedName = document.getElementById('input-profile-name').value.trim();
            const updatedDesc = document.getElementById('input-profile-desc').value.trim();
            let updatedInitials = document.getElementById('input-profile-initials').value.trim().toUpperCase();

            if (updatedName && updatedDesc) {
                if (!updatedInitials) {
                    const initialsMatch = updatedName.match(/\b\w/g) || [];
                    updatedInitials = ((initialsMatch.shift() || '') + (initialsMatch.pop() || '')).toUpperCase();
                }

                const updatedDataPayload = {
                    name: updatedName,
                    designation: updatedDesc,
                    initials: updatedInitials,
                    identifier: profile.identifier || "thulasi"
                };

                try {
                    const res = await fetch('/api/auth/profile/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedDataPayload)
                    });
                    const result = await res.json();

                    if (res.ok && result.success) {
                        localStorage.setItem('krwmp_user', JSON.stringify(updatedDataPayload));
                        this.Session.user = { ...this.Session.user, ...updatedDataPayload };
                        this.syncProfileMetadata();
                        dropModal();
                        console.log("✏️ User identity properties fully persisted to database layers.");
                        if (window.location.pathname.endsWith('admin.html') && typeof window.refreshDirectoryData === 'function') {
                            window.refreshDirectoryData();
                        }
                    } else {
                        throw new Error(result.message || "Server verification refused updates.");
                    }
                } catch (err) {
                    console.error("Failed to commit profile updates:", err);
                    alert(`Failed to save adjustments: ${err.message}`);
                    submitBtn.disabled = false;
                    submitBtn.innerText = "Save Updates";
                }
            }
        });
    },

    dispatchLogout: function () {
        if (document.getElementById('krwmp-logout-modal')) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'krwmp-logout-modal';
        modalOverlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm animate-fade-in';
        
        modalOverlay.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 w-full max-w-sm shadow-2xl transform scale-100 transition-all flex flex-col items-center text-center">
                <div class="h-12 w-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
                    <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </div>
                <h3 class="text-sm font-bold tracking-wider text-slate-200 uppercase mb-1">Terminate Workspace Session</h3>
                <p class="text-xs text-slate-400 max-w-[260px] leading-relaxed mb-6">Are you sure you want to sign out? Any unsaved spatial analysis layer criteria changes will be reset.</p>
                <div class="flex items-center gap-2.5 w-full text-xs font-medium">
                    <button type="button" id="cancel-logout-modal" class="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 py-2.5 rounded transition">Cancel</button>
                    <button type="button" id="confirm-logout-modal" class="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-2.5 rounded transition shadow-lg shadow-rose-950/20">Sign Out</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        const dropModal = () => modalOverlay.remove();
        document.getElementById('cancel-logout-modal').addEventListener('click', dropModal);
        document.getElementById('confirm-logout-modal').addEventListener('click', () => {
            localStorage.removeItem('krwmp_user');
            dropModal();
            window.location.href = '/index.html';
        });
    }
};

// =====================================================
// Base Map Layers Initialization and Management
// =====================================================
window.KRWMP_BASEMAPS = {

    light: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',

    dark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',

    terrain: 'https://demotiles.maplibre.org/style.json',

    satellite: {
        version: 8,

        sources: {
            satellite: {
                type: 'raster',
                tiles: [
                    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                ],
                tileSize: 256,
                attribution: 'Esri'
            }
        },

        layers: [
            {
                id: 'satellite-layer',
                type: 'raster',
                source: 'satellite'
            }
        ]
    }
};