/**
 * KRWMP Layer Manager
 * Fully database-driven GIS layer manager.
 */

const POLLUTION_PRESSURE_SOURCE_ID = 'pollution-pressure-heatmap-source';
const POLLUTION_PRESSURE_LAYER_ID = 'pollution-pressure-heatmap-layer';
const POLLUTION_PRESSURE_API_URL = '/api/analytics/pollution-pressure/heatmap.geojson';

window.initializeSupabaseSpatialSources = function () {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    if (!layers.length) {
        console.warn('No dynamic GIS layers found. Check /api/layers and layer-registry.js.');
    } else {
        layers.forEach(layer => {
            if (!window.shouldLoadLayerGroup(layer.layer_key)) return;
            addDynamicSpatialLayer(layer);
        });
    }

    bindAllLayerToggles();
    bindPollutionPressureHeatmapToggle();
};

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

function addDynamicSpatialLayer(layer) {
    if (!window.KRWMP_MAP || !layer) return;
    showLayerLoading(`Loading ${layer.layer_name || layer.layer_key}...`);

    if (!window.KRWMP_MAP.getSource(layer.source_id)) {
        window.KRWMP_MAP.addSource(layer.source_id, { type: 'geojson', data: layer.api_url, promoteId: 'id' });
    }

    if (isPointLayer(layer) && layer.fill_layer_id && !window.KRWMP_MAP.getLayer(layer.fill_layer_id)) {
        window.KRWMP_MAP.addLayer({
            id: layer.fill_layer_id,
            type: 'circle',
            source: layer.source_id,
            filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),
            paint: getPointPaint(layer),
            layout: { visibility: window.getLayerInitialVisibility(layer.layer_key) }
        });
        if (window.attachInteractivePopupHandshake) window.attachInteractivePopupHandshake(layer.fill_layer_id, layer);
    }

    if (!isPointLayer(layer) && layer.fill_layer_id && !window.KRWMP_MAP.getLayer(layer.fill_layer_id)) {
        window.KRWMP_MAP.addLayer({
            id: layer.fill_layer_id,
            type: 'fill',
            source: layer.source_id,
            filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),
            paint: { 'fill-color': layer.fill_color || '#22c55e', 'fill-opacity': Number(layer.fill_opacity ?? 0.4) },
            layout: { visibility: window.getLayerInitialVisibility(layer.layer_key) }
        });
        if (window.attachInteractivePopupHandshake) window.attachInteractivePopupHandshake(layer.fill_layer_id, layer);
    }

    if (layer.line_layer_id && !window.KRWMP_MAP.getLayer(layer.line_layer_id)) {
        window.KRWMP_MAP.addLayer({
            id: layer.line_layer_id,
            type: 'line',
            source: layer.source_id,
            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),
            paint: { 'line-color': layer.line_color || '#166534', 'line-width': Number(layer.line_width || 1) },
            layout: { visibility: window.getLayerInitialVisibility(layer.layer_key) }
        });
        if (window.attachInteractivePopupHandshake) window.attachInteractivePopupHandshake(layer.line_layer_id, layer);
    }

    window.KRWMP_MAP.once('idle', hideLayerLoading);
}

// =====================================================
// Checkbox bindings
// =====================================================

function bindAllLayerToggles() {
    (window.KRWMP_DYNAMIC_LAYERS || []).forEach(layer => {
        window.bindCheckboxVisibilityToggle(getCheckboxIdFromConfigKey(layer.layer_key), [layer.fill_layer_id, layer.line_layer_id].filter(Boolean));
    });
}

window.bindCheckboxVisibilityToggle = function (checkboxId, targetLayerIds) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox || checkbox.dataset.krwmpBound === 'true') return;
    checkbox.dataset.krwmpBound = 'true';
    checkbox.addEventListener('change', (e) => {
        const visibility = e.target.checked ? 'visible' : 'none';
        const layer = getLayerDefinitionByKey(getConfigKeyFromCheckboxId(checkboxId));
        if (e.target.checked && layer) addDynamicSpatialLayer(layer);
        targetLayerIds.forEach(layerId => {
            if (window.KRWMP_MAP.getLayer(layerId)) window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', visibility);
        });
    });
};

window.getLayerInitialVisibility = function (layerKey) {
    const checkbox = document.getElementById(getCheckboxIdFromConfigKey(layerKey));
    const layer = getLayerDefinitionByKey(layerKey);
    if (checkbox) return checkbox.checked ? 'visible' : 'none';
    return isLayerDefaultVisible(layer) ? 'visible' : 'none';
};
window.shouldLoadLayerGroup = function (layerKey) {
    const checkbox = document.getElementById(getCheckboxIdFromConfigKey(layerKey));
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