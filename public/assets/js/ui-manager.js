/**
 * KRWMP UI Manager
 * Responsible for sidebar, floating layer panel, URL actions,
 * basemap switching, and overlay restoration after style changes.
 */

window.initializeInterface = async function () {
    if (window.KRWMP_ENGINE) {
        await window.KRWMP_ENGINE.assembleInterfaceContext('/sidebar.html', 'sidebar');
    }

    window.bindSidebarInterfaceInteractions();
    window.bindLayerPanelCloseButton();
    window.handleUrlActions();
};

// =====================================================
// Layer panel behaviour
// =====================================================

window.bindLayerPanelCloseButton = function () {
    const closeButton = document.getElementById('btn-close-layer-panel');
    const panel = document.getElementById('data-layers-panel');

    if (!closeButton || !panel) return;

    closeButton.addEventListener('click', () => {
        panel.classList.add('hidden');
    });
};

window.bindSidebarInterfaceInteractions = function () {
    const dataLayersBtn =
        document.getElementById('menu-item-data-layers') ||
        document.querySelector('[id*="data-layers"]') ||
        document.querySelector('button[onclick*="Toggle"]');

    if (!dataLayersBtn) return;

    if (dataLayersBtn.dataset.krwmpBound === 'true') return;
    dataLayersBtn.dataset.krwmpBound = 'true';

    dataLayersBtn.removeAttribute('onclick');

    dataLayersBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const panel = document.getElementById('data-layers-panel');

        if (panel) {
            panel.classList.toggle('hidden');
        }
    });
};

window.handleUrlActions = function () {
    const urlParameters = new URLSearchParams(window.location.search);
    const panel = document.getElementById('data-layers-panel');

    if (urlParameters.get('action') === 'open_layers' && panel) {
        panel.classList.remove('hidden');
    }
};

// =====================================================
// Basemap switcher
// =====================================================

window.initializeBasemapSwitcher = function () {
    const selector = document.getElementById('basemap-selector');

    if (!selector) {
        console.warn('Basemap selector not found.');
        return;
    }

    if (selector.dataset.krwmpBound === 'true') return;
    selector.dataset.krwmpBound = 'true';

    selector.addEventListener('change', (e) => {
        const selected = e.target.value;
        window.switchBasemap(selected);
    });
};

window.switchBasemap = function (selected) {
    if (!window.KRWMP_MAP) {
        console.warn('KRWMP map is not initialized.');
        return;
    }

    const nextStyle = window.getBasemapStyle(selected);

    if (!nextStyle) {
        console.warn(`Basemap style not found: ${selected}`);
        return;
    }

    const currentView = {
        center: window.KRWMP_MAP.getCenter(),
        zoom: window.KRWMP_MAP.getZoom(),
        bearing: window.KRWMP_MAP.getBearing(),
        pitch: window.KRWMP_MAP.getPitch()
    };

    const layerVisibilityState = window.captureOverlayVisibilityState();

    window.KRWMP_MAP.setStyle(nextStyle);

    window.KRWMP_MAP.once('style.load', () => {
        window.KRWMP_MAP.jumpTo(currentView);

        if (window.initializeSupabaseSpatialSources) {
            window.initializeSupabaseSpatialSources();
        }

        window.restoreOverlayVisibilityState(layerVisibilityState);
    });
};

// =====================================================
// Basemap style definitions
// =====================================================

window.getBasemapStyle = function (selected) {
    if (selected === 'light') {
        return 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    }

    if (selected === 'dark') {
        return 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    }

    if (selected === 'satellite') {
        return {
            version: 8,
            sources: {
                'esri-satellite': {
                    type: 'raster',
                    tiles: [
                        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    attribution: 'Esri World Imagery'
                }
            },
            layers: [
                {
                    id: 'esri-satellite-layer',
                    type: 'raster',
                    source: 'esri-satellite'
                }
            ]
        };
    }

    if (selected === 'terrain') {
        return {
            version: 8,
            sources: {
                'esri-topo': {
                    type: 'raster',
                    tiles: [
                        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    attribution: 'Esri World Topographic Map'
                }
            },
            layers: [
                {
                    id: 'esri-topo-layer',
                    type: 'raster',
                    source: 'esri-topo'
                }
            ]
        };
    }

    if (selected === 'hillshade') {
        return {
            version: 8,
            sources: {
                'esri-shaded-relief': {
                    type: 'raster',
                    tiles: [
                        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    attribution: 'Esri World Shaded Relief'
                }
            },
            layers: [
                {
                    id: 'esri-shaded-relief-layer',
                    type: 'raster',
                    source: 'esri-shaded-relief'
                }
            ]
        };
    }

    return null;
};

// =====================================================
// Overlay visibility state management
// =====================================================

window.captureOverlayVisibilityState = function () {
    return {
        basin: document.getElementById('chk-layer-basin')?.checked || false,
        forest: document.getElementById('chk-layer-forest')?.checked || false,
        dsd: document.getElementById('chk-layer-dsd')?.checked || false,
        gnd: document.getElementById('chk-layer-gnd')?.checked || false
    };
};

window.restoreOverlayVisibilityState = function (state) {
    if (!state) return;

    const layerGroups = {
        basin: ['layer-basin-polygon', 'layer-basin-outline'],
        forest: ['layer-forest-polygon', 'layer-forest-outline'],
        dsd: ['layer-dsd-polygon', 'layer-dsd-outline'],
        gnd: ['layer-gnd-polygon', 'layer-gnd-outline']
    };

    Object.entries(layerGroups).forEach(([key, layerIds]) => {
        const visibility = state[key] ? 'visible' : 'none';

        layerIds.forEach(layerId => {
            if (window.KRWMP_MAP.getLayer(layerId)) {
                window.KRWMP_MAP.setLayoutProperty(
                    layerId,
                    'visibility',
                    visibility
                );
            }
        });
    });
};