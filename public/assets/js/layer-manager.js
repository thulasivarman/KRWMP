/**
 * KRWMP Layer Manager
 * Database-driven GIS layer manager plus admin uploaded vector layer controls.
 */

window.initializeSupabaseSpatialSources = function () {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    if (!layers.length) {
        console.warn('No dynamic GIS layers found. Check /api/layers and layer-registry.js.');
    }

    renderDatabaseUploadedVectorLayerControls(layers.filter(layer => layer.category === 'uploaded_vector'));

    layers.forEach(layer => {
        if (!window.shouldLoadLayerGroup(layer.layer_key)) return;
        addDynamicSpatialLayer(layer);
    });

    bindAllLayerToggles();
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
            filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
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
            window.attachInteractivePopupHandshake(layer.fill_layer_id, layer.popup_type || layer.layer_key);
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

        if (window.attachInteractivePopupHandshake && layer.category === 'uploaded_vector') {
            window.attachInteractivePopupHandshake(layer.line_layer_id, layer.popup_type || layer.layer_key);
        }
    }

    window.KRWMP_MAP.once('idle', hideLayerLoading);
    window.setTimeout(hideLayerLoading, 3500);
}

function renderDatabaseUploadedVectorLayerControls(uploadedLayers) {
    const panel = document.getElementById('data-layers-panel');
    if (!panel || !Array.isArray(uploadedLayers) || !uploadedLayers.length) return;

    const container = panel.querySelector('.space-y-3');
    if (!container || container.dataset.databaseUploadedVectorControls === 'true') return;

    const title = document.createElement('div');
    title.className = 'pt-2 mt-2 border-t border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-bold';
    title.textContent = 'Uploaded Database Vector Layers';
    container.appendChild(title);

    uploadedLayers.forEach(layer => {
        const checkboxId = getCheckboxIdFromConfigKey(layer.layer_key);
        if (document.getElementById(checkboxId)) return;

        const label = document.createElement('label');
        label.className = 'flex items-center gap-3 bg-slate-950/40 p-2.5 rounded border border-slate-800/60 cursor-pointer hover:border-emerald-500/30 transition';
        label.innerHTML = `
            <input type="checkbox" id="${checkboxId}" ${isLayerDefaultVisible(layer) ? 'checked' : ''} class="accent-emerald-500 h-4 w-4 cursor-pointer flex-shrink-0">
            <div class="flex items-center justify-center w-8 flex-shrink-0">
                <span class="inline-block h-4 w-6 rounded-sm border-2" style="border-color:${escapeHtml(layer.line_color || '#10b981')};background:${escapeHtml(layer.fill_color || '#10b981')}33"></span>
            </div>
            <div class="min-w-0">
                <div class="font-semibold text-slate-300">${escapeHtml(layer.layer_name || layer.layer_key)}</div>
                <div class="text-[10px] text-slate-500">Supabase/PostGIS uploaded layer</div>
            </div>
        `;
        container.appendChild(label);
    });

    container.dataset.databaseUploadedVectorControls = 'true';
}

function bindAllLayerToggles() {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    layers.forEach(layer => {
        const checkboxId = getCheckboxIdFromConfigKey(layer.layer_key);
        const targetLayerIds = [layer.fill_layer_id, layer.line_layer_id].filter(Boolean);
        window.bindCheckboxVisibilityToggle(checkboxId, targetLayerIds);
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
                window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', visibility);
            }
        });
    });
};

window.getLayerInitialVisibility = function (layerKey) {
    const checkboxId = getCheckboxIdFromConfigKey(layerKey);
    const checkbox = document.getElementById(checkboxId);
    const layer = getLayerDefinitionByKey(layerKey);

    if (checkbox) {
        return checkbox.checked ? 'visible' : 'none';
    }

    if (isLayerDefaultVisible(layer)) return 'visible';

    return 'none';
};

window.shouldLoadLayerGroup = function (layerKey) {
    const checkboxId = getCheckboxIdFromConfigKey(layerKey);
    const checkbox = document.getElementById(checkboxId);
    const layer = getLayerDefinitionByKey(layerKey);

    if (checkbox) {
        return checkbox.checked;
    }

    return isLayerDefaultVisible(layer);
};

function isLayerDefaultVisible(layer) {
    return layer?.default_visible === true || layer?.default_visible === 'true';
}

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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
