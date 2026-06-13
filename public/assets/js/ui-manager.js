/**
 * KRWMP UI Manager
 * Responsible for sidebar, floating layer panels, URL actions,
 * basemap switching, panel accessibility, mobile navigation, and map utility controls.
 */
window.initializeInterface = async function () {
    if (window.KRWMP_ENGINE) await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
    window.bindSidebarInterfaceInteractions();
    window.bindLayerPanelCloseButton();
    window.bindMobileSidebarToggle();
    window.bindMapUtilityControls();
    window.handleUrlActions();
};

window.bindLayerPanelCloseButton = function () {
    const vectorCloseButton = document.getElementById('btn-close-layer-panel');
    const vectorPanel = document.getElementById('data-layers-panel');
    if (vectorCloseButton && vectorPanel) vectorCloseButton.addEventListener('click', () => setPanelVisibility(vectorPanel, false));

    const rasterCloseButton = document.getElementById('btn-close-raster-layer-panel');
    const rasterPanel = document.getElementById('raster-layers-panel');
    if (rasterCloseButton && rasterPanel) rasterCloseButton.addEventListener('click', () => setPanelVisibility(rasterPanel, false));

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        [vectorPanel, rasterPanel].forEach((panel) => panel && setPanelVisibility(panel, false));
    });
};

window.bindSidebarInterfaceInteractions = function () {
    bindPanelButton('menu-item-data-layers', 'data-layers-panel', 'raster-layers-panel');
    bindPanelButton('menu-item-raster-layers', 'raster-layers-panel', 'data-layers-panel');
    bindPanelButton('floating-data-layers-btn', 'data-layers-panel', 'raster-layers-panel');
    bindPanelButton('floating-raster-layers-btn', 'raster-layers-panel', 'data-layers-panel');
};

function bindPanelButton(buttonId, panelId, otherPanelId) {
    const button = document.getElementById(buttonId);
    if (!button || button.dataset.krwmpBound === 'true') return;
    button.dataset.krwmpBound = 'true';
    button.removeAttribute('onclick');
    button.addEventListener('click', (e) => {
        e.preventDefault();
        const panel = document.getElementById(panelId);
        const otherPanel = document.getElementById(otherPanelId);
        if (otherPanel) setPanelVisibility(otherPanel, false);
        if (panel) setPanelVisibility(panel, panel.classList.contains('hidden'));
    });
}

function setPanelVisibility(panel, shouldShow) {
    if (!panel) return;
    panel.classList.toggle('hidden', !shouldShow);
    const trigger = document.querySelector(`[aria-controls="${panel.id}"]`);
    if (trigger) trigger.setAttribute('aria-expanded', String(shouldShow));
    if (shouldShow) {
        const focusTarget = panel.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
}

window.bindMobileSidebarToggle = function () {
    const toggle = document.getElementById('mobile-sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (!toggle || !sidebar || toggle.dataset.krwmpBound === 'true') return;
    toggle.dataset.krwmpBound = 'true';

    const closeOnNavigation = (event) => {
        if (event.target.closest('a')) {
            sidebar.classList.remove('krwmp-sidebar-open');
            toggle.setAttribute('aria-expanded', 'false');
        }
    };

    toggle.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('krwmp-sidebar-open');
        toggle.setAttribute('aria-expanded', String(isOpen));
    });
    sidebar.addEventListener('click', closeOnNavigation);
};

window.bindMapUtilityControls = function () {
    const zoomBasinButton = document.getElementById('btn-zoom-basin');
    if (zoomBasinButton && zoomBasinButton.dataset.krwmpBound !== 'true') {
        zoomBasinButton.dataset.krwmpBound = 'true';
        zoomBasinButton.addEventListener('click', () => {
            if (!window.KRWMP_MAP) return;
            // Default Kelani watershed operational view. Refine bounds after official basin bounds are finalized.
            window.KRWMP_MAP.flyTo({ center: [80.2280810, 7.2334995], zoom: 9, essential: true });
        });
    }

    const clearButton = document.getElementById('btn-clear-map-selection');
    if (clearButton && clearButton.dataset.krwmpBound !== 'true') {
        clearButton.dataset.krwmpBound = 'true';
        clearButton.addEventListener('click', () => {
            document.querySelectorAll('.maplibregl-popup').forEach((popup) => popup.remove());
            if (window.KRWMP_ENGINE?.showToast) window.KRWMP_ENGINE.showToast('Map selections cleared.', 'info');
        });
    }
};

window.handleUrlActions = function () {
    const urlParameters = new URLSearchParams(window.location.search);
    const vectorPanel = document.getElementById('data-layers-panel');
    const rasterPanel = document.getElementById('raster-layers-panel');
    if (urlParameters.get('action') === 'open_layers' && vectorPanel) setPanelVisibility(vectorPanel, true);
    if (urlParameters.get('action') === 'open_raster_layers' && rasterPanel) setPanelVisibility(rasterPanel, true);
};

window.initializeBasemapSwitcher = function () {
    const selector = document.getElementById('basemap-selector');
    if (!selector || selector.dataset.krwmpBound === 'true') return;
    selector.dataset.krwmpBound = 'true';
    selector.addEventListener('change', (e) => window.switchBasemap(e.target.value));
};

window.switchBasemap = function (selected) {
    if (!window.KRWMP_MAP) return;
    const nextStyle = window.getBasemapStyle(selected);
    if (!nextStyle) return;
    const currentView = { center: window.KRWMP_MAP.getCenter(), zoom: window.KRWMP_MAP.getZoom(), bearing: window.KRWMP_MAP.getBearing(), pitch: window.KRWMP_MAP.getPitch() };
    const loadingIndicator = document.getElementById('map-loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.textContent = 'Switching basemap...';
        loadingIndicator.classList.remove('hidden');
    }
    window.KRWMP_MAP.setStyle(nextStyle);
    window.KRWMP_MAP.once('style.load', () => {
        window.KRWMP_MAP.jumpTo(currentView);
        if (window.initializeSupabaseSpatialSources) window.initializeSupabaseSpatialSources();
        if (window.initializeRasterLayerControls) window.initializeRasterLayerControls();
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    });
};

window.getBasemapStyle = function (selected) {
    if (selected === 'light') return 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    if (selected === 'dark') return 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    if (selected === 'satellite') return { version: 8, sources: { 'esri-satellite': { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri World Imagery' } }, layers: [{ id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite' }] };
    if (selected === 'terrain') return { version: 8, sources: { 'esri-topo': { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri World Topographic Map' } }, layers: [{ id: 'esri-topo-layer', type: 'raster', source: 'esri-topo' }] };
    if (selected === 'hillshade') return { version: 8, sources: { 'esri-shaded-relief': { type: 'raster', tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri World Shaded Relief' } }, layers: [{ id: 'esri-shaded-relief-layer', type: 'raster', source: 'esri-shaded-relief' }] };
    return null;
};
window.captureOverlayVisibilityState = function () { return {}; };
window.restoreOverlayVisibilityState = function () { return; };
