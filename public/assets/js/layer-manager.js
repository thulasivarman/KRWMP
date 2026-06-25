/**
 * KRWMP Layer Manager
 * Fully database-driven GIS layer manager.
 */

window.initializeSupabaseSpatialSources = function () {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];
    if (!layers.length) console.warn('No dynamic GIS layers found. Check /api/layers and layer-registry.js.');
    renderDatabaseLayerControls(layers);
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
    window.setTimeout(hideLayerLoading, 3500);
}

function getPointPaint(layer) {
    if (layer.layer_key === 'community_complaints') {
        return {
            'circle-radius': ['match', ['downcase', ['coalesce', ['get', 'severity_level'], 'medium']], 'high', 9, 'medium', 7, 'low', 6, 7],
            'circle-color': ['match', ['downcase', ['coalesce', ['get', 'severity_level'], 'medium']], 'high', '#ef4444', 'medium', '#f59e0b', 'low', '#22c55e', '#38bdf8'],
            'circle-stroke-color': layer.line_color || '#ffffff',
            'circle-stroke-width': Number(layer.line_width || 1.5),
            'circle-opacity': Number(layer.fill_opacity ?? 0.9)
        };
    }
    return {
        'circle-radius': 8,
        'circle-color': layer.fill_color || '#14b8a6',
        'circle-stroke-color': layer.line_color || '#ffffff',
        'circle-stroke-width': Number(layer.line_width || 2),
        'circle-opacity': Number(layer.fill_opacity ?? 0.9)
    };
}

function isPointLayer(layer) {
    const pointLayerKeys = [
        'community_complaints',
        'vwmc_locations',
        'institution_locations',
        'volunteer_organisations'
    ];

    return pointLayerKeys.includes(layer.layer_key)
        || pointLayerKeys.includes(layer.popup_type)
        || String(layer.fill_layer_id || '').includes('_circle')
        || String(layer.fill_layer_id || '').includes('-circle');
}

function renderDatabaseLayerControls(layers) {
    const panel = document.getElementById('data-layers-panel');
    if (!panel || !Array.isArray(layers)) return;
    const container = document.getElementById('dynamic-layer-control-list') || panel.querySelector('.space-y-3');
    if (!container || container.dataset.databaseLayerControls === 'true') return;
    container.innerHTML = '';
    if (!layers.length) {
        container.innerHTML = '<div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">No database layers available</div>';
        return;
    }
    const grouped = groupLayersByCategory(layers);
    Object.keys(grouped).forEach(category => {
        const title = document.createElement('div');
        title.className = 'pt-2 mt-2 border-t border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-bold first:border-t-0 first:mt-0 first:pt-0';
        title.textContent = getCategoryTitle(category);
        container.appendChild(title);
        grouped[category].forEach(layer => {
            const checkboxId = getCheckboxIdFromConfigKey(layer.layer_key);
            const label = document.createElement('label');
            label.className = 'flex items-center gap-3 bg-slate-950/40 p-2.5 rounded border border-slate-800/60 cursor-pointer hover:border-emerald-500/30 transition';
            label.innerHTML = `<input type="checkbox" id="${checkboxId}" ${isLayerDefaultVisible(layer) ? 'checked' : ''} class="accent-emerald-500 h-4 w-4 cursor-pointer flex-shrink-0"><div class="flex items-center justify-center w-8 flex-shrink-0">${getLegendSymbol(layer)}</div><div class="min-w-0"><div class="font-semibold text-slate-300">${window.KRWMP_UTILS.escapeHtml(layer.layer_name || layer.layer_key)}</div><div class="text-[10px] text-slate-500">${window.KRWMP_UTILS.escapeHtml(getLayerDescription(layer))}</div></div>`;
            container.appendChild(label);
        });
    });
    container.dataset.databaseLayerControls = 'true';
}

function getLegendSymbol(layer) {
    if (layer.layer_key === 'community_complaints') return '<span class="inline-flex gap-0.5"><i class="h-2.5 w-2.5 rounded-full bg-red-500 border border-white/70"></i><i class="h-2.5 w-2.5 rounded-full bg-amber-500 border border-white/70"></i><i class="h-2.5 w-2.5 rounded-full bg-green-500 border border-white/70"></i></span>';
    if (layer.layer_key === 'vwmc_locations') return '<span class="inline-block h-3.5 w-3.5 rounded-full bg-teal-500 border-2 border-white/80"></span>';
    return `<span class="inline-block h-4 w-6 rounded-sm border-2" style="border-color:${window.KRWMP_UTILS.escapeHtml(layer.line_color || '#10b981')};background:${window.KRWMP_UTILS.escapeHtml(layer.fill_color || '#10b981')}33"></span>`;
}

function groupLayersByCategory(layers) {
    return layers.reduce((groups, layer) => {
        const category = layer.category || 'database_layers';
        if (!groups[category]) groups[category] = [];
        groups[category].push(layer);
        return groups;
    }, {});
}

function getCategoryTitle(category) {
    if (category === 'community_participation' || category === 'Community Participation') return 'Community Participation';
    if (category === 'uploaded_vector') return 'Uploaded Database Vector Layers';
    if (category === 'boundary' || category === 'Administrative') return 'Boundary Layers';
    if (category === 'environment' || category === 'Environment') return 'Environmental Layers';
    if (category === 'hydrology') return 'Hydrology Layers';
    return String(category || 'Database Layers').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function getLayerDescription(layer) {
    if (layer.layer_key === 'community_complaints') return 'Red: high · Amber: medium · Green: low';
    if (layer.layer_key === 'vwmc_locations') return 'Village watershed committee locations';
    if (layer.layer_key === 'institution_locations') return 'Institution office locations';
    if (layer.layer_key === 'volunteer_organisations') return 'Volunteer organisation locations';
    if (layer.category === 'uploaded_vector') return 'Supabase/PostGIS uploaded layer';
    return 'Database managed GIS layer';
}

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
    if (checkbox) return checkbox.checked;
    return isLayerDefaultVisible(layer);
};
function isLayerDefaultVisible(layer) { return layer?.default_visible === true || layer?.default_visible === 'true'; }
function getCheckboxIdFromConfigKey(layerKey) { return `chk-layer-${layerKey}`; }
function getConfigKeyFromCheckboxId(checkboxId) { return checkboxId.replace('chk-layer-', ''); }
function getLayerDefinitionByKey(layerKey) { return (window.KRWMP_DYNAMIC_LAYERS || []).find(layer => layer.layer_key === layerKey); }
