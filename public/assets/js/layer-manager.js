/**
 * KRWMP Layer Manager
 * Fully database-driven GIS layer manager with MVT/vector-tile support.
 */

const POLLUTION_PRESSURE_SOURCE_ID = 'pollution-pressure-heatmap-source';
const POLLUTION_PRESSURE_LAYER_ID = 'pollution-pressure-heatmap-layer';
const POLLUTION_PRESSURE_API_URL = '/api/analytics/pollution-pressure/heatmap.geojson';

function gisUrl(url) {
    return window.KRWMP_UTILS.withGisApiBase(url);
}

window.initializeSupabaseSpatialSources = function () {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    renderDynamicLayerToggles(layers);

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

function getMvtLayerName(layer) {
    return String(layer?.mvt_layer || layer?.layer_key || 'layer')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || 'layer';
}

function hasVectorTileSource(layer) {
    return Boolean(layer?.tile_url || layer?.source_type === 'vector');
}

function addDynamicSpatialLayer(layer) {
    if (!window.KRWMP_MAP || !layer || !layer.source_id || (!layer.api_url && !layer.tile_url)) return;
    showLayerLoading(`Loading ${layer.layer_name || layer.layer_key}...`);

    const sourceLayer = getMvtLayerName(layer);

    if (!window.KRWMP_MAP.getSource(layer.source_id)) {
        if (hasVectorTileSource(layer)) {
            const tileUrl = layer.tile_url || `/api/tiles/layers/${encodeURIComponent(layer.layer_key)}/{z}/{x}/{y}.pbf`;
            window.KRWMP_MAP.addSource(layer.source_id, {
                type: 'vector',
                tiles: [gisUrl(tileUrl)],
                minzoom: Number(layer.min_zoom || 0),
                maxzoom: Number(layer.max_zoom || 22),
                promoteId: 'id'
            });
        } else {
            window.KRWMP_MAP.addSource(layer.source_id, {
                type: 'geojson',
                data: gisUrl(layer.api_url),
                promoteId: 'id'
            });
        }
    }

    const baseLayer = {
        source: layer.source_id,
        minzoom: Number(layer.min_zoom || 0),
        maxzoom: Number(layer.max_zoom || 22),
        layout: { visibility: window.getLayerInitialVisibility(layer.layer_key) }
    };
    if (hasVectorTileSource(layer)) baseLayer['source-layer'] = sourceLayer;

    if (isPointLayer(layer) && layer.fill_layer_id && !window.KRWMP_MAP.getLayer(layer.fill_layer_id)) {
        window.KRWMP_MAP.addLayer({
            ...baseLayer,
            id: layer.fill_layer_id,
            type: 'circle',
            filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
            paint: getPointPaint(layer)
        });
        if (window.attachInteractivePopupHandshake) window.attachInteractivePopupHandshake(layer.fill_layer_id, layer);
    }

    if (!isPointLayer(layer) && layer.fill_layer_id && !window.KRWMP_MAP.getLayer(layer.fill_layer_id)) {
        window.KRWMP_MAP.addLayer({
            ...baseLayer,
            id: layer.fill_layer_id,
            type: 'fill',
            filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
            paint: {
                'fill-color': layer.fill_color || '#22c55e',
                'fill-opacity': Number(layer.fill_opacity ?? 0.4)
            }
        });
        if (window.attachInteractivePopupHandshake) window.attachInteractivePopupHandshake(layer.fill_layer_id, layer);
    }

    if (layer.line_layer_id && !window.KRWMP_MAP.getLayer(layer.line_layer_id)) {
        window.KRWMP_MAP.addLayer({
            ...baseLayer,
            id: layer.line_layer_id,
            type: 'line',
            paint: {
                'line-color': layer.line_color || '#166534',
                'line-width': Number(layer.line_width || 1)
            }
        });
        if (window.attachInteractivePopupHandshake) window.attachInteractivePopupHandshake(layer.line_layer_id, layer);
    }

    window.KRWMP_MAP.once('idle', hideLayerLoading);
}

// =====================================================
// Dynamic checkbox rendering
// =====================================================

function renderDynamicLayerToggles(layers) {
    const list = document.getElementById('vector-layer-control-list');
    if (!list || !Array.isArray(layers)) return;

    layers.forEach(layer => {
        if (!layer || !layer.layer_key) return;

        const checkboxId = getCheckboxIdFromConfigKey(layer.layer_key);
        if (document.getElementById(checkboxId)) return;

        const label = document.createElement('label');
        label.className = 'flex items-center gap-3 bg-slate-950/40 p-2.5 rounded border border-slate-800/60 cursor-pointer hover:border-cyan-500/30 transition';
        label.dataset.dynamicLayerKey = layer.layer_key;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = checkboxId;
        checkbox.className = 'accent-cyan-500 h-4 w-4 cursor-pointer flex-shrink-0';
        checkbox.checked = isLayerDefaultVisible(layer);

        const symbol = document.createElement('div');
        symbol.className = 'flex items-center justify-center w-8 flex-shrink-0';
        symbol.title = layer.layer_name || layer.layer_key;
        symbol.innerHTML = getLayerLegendSymbol(layer);

        const textWrap = document.createElement('div');
        textWrap.className = 'min-w-0';

        const title = document.createElement('div');
        title.className = 'font-semibold text-slate-300 truncate';
        title.textContent = layer.layer_name || prettifyKey(layer.layer_key);

        const subtitle = document.createElement('div');
        subtitle.className = 'text-[10px] text-slate-500 truncate';
        subtitle.textContent = `${layer.category || getLayerTypeLabel(layer)}${hasVectorTileSource(layer) ? ' · MVT' : ''}`;

        textWrap.appendChild(title);
        textWrap.appendChild(subtitle);

        label.appendChild(checkbox);
        label.appendChild(symbol);
        label.appendChild(textWrap);
        list.appendChild(label);
    });
}

function getLayerLegendSymbol(layer) {
    const fill = layer.fill_color || layer.point_color || '#22c55e';
    const line = layer.line_color || '#ffffff';

    if (isPointLayer(layer)) {
        return `<span class="inline-block h-4 w-4 rounded-full" style="background:${escapeAttr(fill)}; border:2px solid ${escapeAttr(line)}"></span>`;
    }

    return `<span class="inline-block h-4 w-6 rounded-sm" style="background:${escapeAttr(fill)}33; border:2px solid ${escapeAttr(line)}"></span>`;
}

function getLayerTypeLabel(layer) {
    if (isPointLayer(layer)) return 'Operational point layer';
    if (layer.line_layer_id && !layer.fill_layer_id) return 'Boundary / line layer';
    return 'GIS vector layer';
}

// =====================================================
// Pollution Pressure Heatmap
// =====================================================

function bindPollutionPressureHeatmapToggle() {
    const checkbox = document.getElementById('chk-layer-pollution-pressure-heatmap');
    if (!checkbox || checkbox.dataset.krwmpBound === 'true') return;

    checkbox.dataset.krwmpBound = 'true';

    checkbox.addEventListener('change', async (event) => {
        if (event.target.checked) {
            await addPollutionPressureHeatmapLayer();
            setLayerVisibility(POLLUTION_PRESSURE_LAYER_ID, 'visible');
        } else {
            setLayerVisibility(POLLUTION_PRESSURE_LAYER_ID, 'none');
        }
    });

    if (checkbox.checked) {
        addPollutionPressureHeatmapLayer();
    }
}

async function addPollutionPressureHeatmapLayer() {
    if (!window.KRWMP_MAP) return;

    showLayerLoading('Loading pollution pressure heatmap...');

    if (!window.KRWMP_MAP.getSource(POLLUTION_PRESSURE_SOURCE_ID)) {
        window.KRWMP_MAP.addSource(POLLUTION_PRESSURE_SOURCE_ID, {
            type: 'geojson',
            data: gisUrl(POLLUTION_PRESSURE_API_URL)
        });
    } else {
        const source = window.KRWMP_MAP.getSource(POLLUTION_PRESSURE_SOURCE_ID);
        if (source && typeof source.setData === 'function') {
            source.setData(gisUrl(`${POLLUTION_PRESSURE_API_URL}?_=${Date.now()}`));
        }
    }

    if (!window.KRWMP_MAP.getLayer(POLLUTION_PRESSURE_LAYER_ID)) {
        window.KRWMP_MAP.addLayer({
            id: POLLUTION_PRESSURE_LAYER_ID,
            type: 'heatmap',
            source: POLLUTION_PRESSURE_SOURCE_ID,
            maxzoom: 17,
            paint: {
                'heatmap-weight': [
                    'interpolate',
                    ['linear'],
                    ['get', 'intensity_normalized'],
                    0, 0,
                    1, 1
                ],
                'heatmap-intensity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 1,
                    12, 2,
                    17, 3
                ],
                'heatmap-radius': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    0, 10,
                    9, 24,
                    14, 38,
                    17, 55
                ],
                'heatmap-opacity': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    7, 0.80,
                    17, 0.60
                ],
                'heatmap-color': [
                    'interpolate',
                    ['linear'],
                    ['heatmap-density'],
                    0, 'rgba(34,197,94,0)',
                    0.20, 'rgb(34,197,94)',
                    0.40, 'rgb(163,230,53)',
                    0.60, 'rgb(250,204,21)',
                    0.80, 'rgb(249,115,22)',
                    1, 'rgb(220,38,38)'
                ]
            },
            layout: { visibility: 'visible' }
        });
    }

    window.KRWMP_MAP.once('idle', hideLayerLoading);
}

function setLayerVisibility(layerId, visibility) {
    if (!window.KRWMP_MAP || !window.KRWMP_MAP.getLayer(layerId)) return;
    window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', visibility);
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

        if (e.target.checked && layer) {
            addDynamicSpatialLayer(layer);
        }

        targetLayerIds.forEach(layerId => {
            if (window.KRWMP_MAP.getLayer(layerId)) {
                window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', visibility);
            }
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

    return isLayerDefaultVisible(layer);
};
