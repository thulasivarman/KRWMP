/**
 * KRWMP Layer Manager
 * Database-driven GIS layer manager.
 * Loads layer definitions from /api/layers through window.KRWMP_DYNAMIC_LAYERS.
 */

window.initializeSupabaseSpatialSources = function () {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    if (!layers.length) {
        console.warn('No dynamic GIS layers found. Check /api/layers and layer-registry.js.');
        return;
    }

    layers.forEach(layer => {
        if (!window.shouldLoadLayerGroup(layer.layer_key)) return;
        addDynamicSpatialLayer(layer);
    });

    bindAllLayerToggles();
};

// =====================================================
// Loading indicator
// =====================================================

function showLayerLoading(message = 'Loading layer...') {
    const el = document.getElementById('map-loading-indicator');
    if (!el) return;

    el.textContent = message;
    el.classList.remove('hidden');
}

function hideLayerLoading() {
    const el = document.getElementById('map-loading-indicator');
    if (!el) return;

    el.classList.add('hidden');
}

// =====================================================
// Dynamic source and layer loading
// =====================================================

function addDynamicSpatialLayer(layer) {
    if (!window.KRWMP_MAP || !layer) return;

    showLayerLoading(`Loading ${layer.layer_name || layer.layer_key}...`);

    if (!window.KRWMP_MAP.getSource(layer.source_id)) {
        window.KRWMP_MAP.addSource(layer.source_id, {
            type: 'geojson',
            data: layer.api_url,
            promoteId: 'id'
        });
    }

    if (layer.fill_layer_id && !window.KRWMP_MAP.getLayer(layer.fill_layer_id)) {
        window.KRWMP_MAP.addLayer({
            id: layer.fill_layer_id,
            type: 'fill',
            source: layer.source_id,

            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),

            paint: {
                'fill-color': layer.fill_color || '#22c55e',
                'fill-opacity': Number(layer.fill_opacity ?? 0.4)
            },

            layout: {
                visibility: window.getLayerInitialVisibility(layer.layer_key)
            }
        });

        if (window.attachInteractivePopupHandshake) {
            window.attachInteractivePopupHandshake(
                layer.fill_layer_id,
                layer.popup_type || layer.layer_key
            );
        }
    }

    if (layer.line_layer_id && !window.KRWMP_MAP.getLayer(layer.line_layer_id)) {
        window.KRWMP_MAP.addLayer({
            id: layer.line_layer_id,
            type: 'line',
            source: layer.source_id,

            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),

            paint: {
                'line-color': layer.line_color || '#166534',
                'line-width': Number(layer.line_width || 1)
            },

            layout: {
                visibility: window.getLayerInitialVisibility(layer.layer_key)
            }
        });
    }

    window.KRWMP_MAP.once('idle', hideLayerLoading);
}

// =====================================================
// Checkbox bindings
// =====================================================

function bindAllLayerToggles() {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    layers.forEach(layer => {
        const checkboxId = getCheckboxIdFromConfigKey(layer.layer_key);
        const targetLayerIds = [
            layer.fill_layer_id,
            layer.line_layer_id
        ].filter(Boolean);

        window.bindCheckboxVisibilityToggle(
            checkboxId,
            targetLayerIds
        );
    });
}

window.bindCheckboxVisibilityToggle = function (checkboxId, targetLayerIds) {
    const checkbox = document.getElementById(checkboxId);

    if (!checkbox) {
        console.warn(`Checkbox not found: ${checkboxId}`);
        return;
    }

    if (checkbox.dataset.krwmpBound === 'true') return;

    checkbox.dataset.krwmpBound = 'true';

    checkbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibility = checked ? 'visible' : 'none';

        const layerKey = getConfigKeyFromCheckboxId(checkboxId);
        const layer = getLayerDefinitionByKey(layerKey);

        if (checked && layer) {
            addDynamicSpatialLayer(layer);
        }

        targetLayerIds.forEach(layerId => {
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

// =====================================================
// Visibility state helpers
// =====================================================

window.getLayerInitialVisibility = function (layerKey) {
    const checkboxId = getCheckboxIdFromConfigKey(layerKey);
    const checkbox = document.getElementById(checkboxId);
    const layer = getLayerDefinitionByKey(layerKey);

    if (checkbox) {
        return checkbox.checked ? 'visible' : 'none';
    }

    if (layer && layer.default_visible === true) {
        return 'visible';
    }

    if (layer && layer.default_visible === 'true') {
        return 'visible';
    }

    return 'none';
};

window.shouldLoadLayerGroup = function (layerKey) {
    const checkboxId = getCheckboxIdFromConfigKey(layerKey);
    const checkbox = document.getElementById(checkboxId);
    const layer = getLayerDefinitionByKey(layerKey);

    if (checkbox) {
        return checkbox.checked;
    }

    return layer?.default_visible === true || layer?.default_visible === 'true';
};

// =====================================================
// Mapping helpers
// =====================================================

function getCheckboxIdFromConfigKey(layerKey) {
    return `chk-layer-${layerKey}`;
}

function getConfigKeyFromCheckboxId(checkboxId) {
    return checkboxId.replace('chk-layer-', '');
}

function getLayerDefinitionByKey(layerKey) {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];
    return layers.find(layer => layer.layer_key === layerKey);
}