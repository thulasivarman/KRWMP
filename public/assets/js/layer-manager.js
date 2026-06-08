/**
 * KRWMP Layer Manager
 * Database-driven GIS layer manager plus admin uploaded GeoJSON layer loader.
 */

window.initializeSupabaseSpatialSources = function () {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    if (!layers.length) {
        console.warn('No dynamic GIS layers found. Check /api/layers and layer-registry.js.');
    }

    layers.forEach(layer => {
        if (!window.shouldLoadLayerGroup(layer.layer_key)) return;
        addDynamicSpatialLayer(layer);
    });

    bindAllLayerToggles();

    if (window.initializeUploadedVectorLayers) {
        window.initializeUploadedVectorLayers();
    }
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
// Admin uploaded vector layer loading
// =====================================================

window.initializeUploadedVectorLayers = async function () {
    if (!window.KRWMP_MAP) return;

    try {
        const response = await fetch('/data/layers-config.json', { cache: 'no-store' });
        if (!response.ok) return;

        const config = await response.json();
        const layers = Array.isArray(config.layers) ? config.layers : [];

        layers.forEach(layer => addUploadedVectorLayer(layer));
        renderUploadedVectorLayerControls(layers);
    } catch (error) {
        console.error('Failed to load uploaded vector layers:', error);
    }
};

function addUploadedVectorLayer(layer) {
    if (!window.KRWMP_MAP || !layer || !layer.id || !layer.url) return;

    const sourceId = `uploaded-source-${layer.id}`;
    const fillLayerId = `uploaded-fill-${layer.id}`;
    const lineLayerId = `uploaded-line-${layer.id}`;
    const circleLayerId = `uploaded-circle-${layer.id}`;
    const visibility = layer.visible ? 'visible' : 'none';
    const style = layer.style || {};

    if (!window.KRWMP_MAP.getSource(sourceId)) {
        window.KRWMP_MAP.addSource(sourceId, {
            type: 'geojson',
            data: layer.url,
            promoteId: 'id'
        });
    }

    if (!window.KRWMP_MAP.getLayer(fillLayerId)) {
        window.KRWMP_MAP.addLayer({
            id: fillLayerId,
            type: 'fill',
            source: sourceId,
            filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
            paint: {
                'fill-color': style.fillColor || style.color || '#3388ff',
                'fill-opacity': Number(style.fillOpacity ?? 0.2)
            },
            layout: { visibility }
        });
    }

    if (!window.KRWMP_MAP.getLayer(lineLayerId)) {
        window.KRWMP_MAP.addLayer({
            id: lineLayerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': style.color || '#3388ff',
                'line-width': Number(style.weight || 2),
                'line-opacity': Number(style.opacity ?? 1)
            },
            layout: { visibility }
        });
    }

    if (!window.KRWMP_MAP.getLayer(circleLayerId)) {
        window.KRWMP_MAP.addLayer({
            id: circleLayerId,
            type: 'circle',
            source: sourceId,
            filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
            paint: {
                'circle-color': style.fillColor || style.color || '#3388ff',
                'circle-radius': Number(style.radius || 6),
                'circle-stroke-color': style.color || '#1d4ed8',
                'circle-stroke-width': Number(style.weight || 2),
                'circle-opacity': Number(style.opacity ?? 1)
            },
            layout: { visibility }
        });
    }

    [fillLayerId, lineLayerId, circleLayerId].forEach(mapLayerId => {
        if (window.KRWMP_MAP.getLayer(mapLayerId)) {
            attachUploadedVectorPopup(mapLayerId, layer);
        }
    });

    window.KRWMP_MAP.once('idle', hideLayerLoading);
}

function attachUploadedVectorPopup(mapLayerId, layer) {
    if (!window.KRWMP_MAP || !mapLayerId) return;

    const eventKey = `popup-bound-${mapLayerId}`;
    if (window.KRWMP_MAP[eventKey]) return;
    window.KRWMP_MAP[eventKey] = true;

    window.KRWMP_MAP.on('click', mapLayerId, event => {
        const feature = event.features && event.features[0];
        const properties = feature?.properties || {};
        const html = buildUploadedVectorPopupHtml(properties, layer);

        new maplibregl.Popup()
            .setLngLat(event.lngLat)
            .setHTML(html)
            .addTo(window.KRWMP_MAP);
    });

    window.KRWMP_MAP.on('mouseenter', mapLayerId, () => {
        window.KRWMP_MAP.getCanvas().style.cursor = 'pointer';
    });

    window.KRWMP_MAP.on('mouseleave', mapLayerId, () => {
        window.KRWMP_MAP.getCanvas().style.cursor = '';
    });
}

function buildUploadedVectorPopupHtml(properties, layer) {
    const fields = Array.isArray(layer.popupFields) ? layer.popupFields : [];
    const entries = fields.length
        ? fields.map(field => [field, properties[field]])
        : Object.entries(properties).slice(0, 12);

    const rows = entries
        .map(([key, value]) => `<div><strong>${escapeHtml(key)}</strong>: ${escapeHtml(value ?? '')}</div>`)
        .join('');

    return `
        <div style="font-family: Arial, sans-serif; font-size: 12px; max-width: 260px;">
            <div style="font-weight: 700; margin-bottom: 6px;">${escapeHtml(layer.name || layer.id)}</div>
            ${rows || '<div>No attribute data</div>'}
        </div>
    `;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderUploadedVectorLayerControls(layers) {
    const panel = document.getElementById('data-layers-panel');
    if (!panel || !Array.isArray(layers) || !layers.length) return;

    const container = panel.querySelector('.space-y-3');
    if (!container || container.dataset.uploadedVectorControls === 'true') return;

    const title = document.createElement('div');
    title.className = 'pt-2 mt-2 border-t border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-bold';
    title.textContent = 'Uploaded Vector Layers';
    container.appendChild(title);

    layers.forEach(layer => {
        const checkboxId = `chk-uploaded-${layer.id}`;
        const label = document.createElement('label');
        label.className = 'flex items-center gap-3 bg-slate-950/40 p-2.5 rounded border border-slate-800/60 cursor-pointer hover:border-sky-500/30 transition';
        label.innerHTML = `
            <input type="checkbox" id="${checkboxId}" ${layer.visible ? 'checked' : ''} class="accent-sky-500 h-4 w-4 cursor-pointer flex-shrink-0">
            <div class="flex items-center justify-center w-8 flex-shrink-0">
                <span class="inline-block h-4 w-6 rounded-sm border-2" style="border-color:${escapeHtml(layer.style?.color || '#3388ff')};background:${escapeHtml(layer.style?.fillColor || '#3388ff')}33"></span>
            </div>
            <div class="min-w-0">
                <div class="font-semibold text-slate-300">${escapeHtml(layer.name || layer.id)}</div>
                <div class="text-[10px] text-slate-500">Admin uploaded GeoJSON</div>
            </div>
        `;
        container.appendChild(label);

        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', event => {
            const visibility = event.target.checked ? 'visible' : 'none';
            [`uploaded-fill-${layer.id}`, `uploaded-line-${layer.id}`, `uploaded-circle-${layer.id}`].forEach(layerId => {
                if (window.KRWMP_MAP.getLayer(layerId)) {
                    window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', visibility);
                }
            });
        });
    });

    container.dataset.uploadedVectorControls = 'true';
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
