/**
 * KRWMP Layer Manager
 * Fully database-driven GIS layer manager.
 */

window.initializeSupabaseSpatialSources = function () {
    const layers = window.KRWMP_DYNAMIC_LAYERS || [];

    if (!layers.length) {
        console.warn('No dynamic GIS layers found. Check /api/layers and layer-registry.js.');
    }

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
        window.KRWMP_MAP.addSource(layer.source_id, {
            type: 'geojson',
            data: layer.api_url,
            promoteId: 'id'
        });
    }

    if (isPointLayer(layer) && layer.fill_layer_id && !window.KRWMP_MAP.getLayer(layer.fill_layer_id)) {
        window.KRWMP_MAP.addLayer({
            id: layer.fill_layer_id,
            type: 'circle',
            source: layer.source_id,
            filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),
            paint: {
                'circle-radius': 7,
                'circle-color': ['match', ['get', 'severity_level'], 'high', '#ef4444', 'medium', '#f59e0b', 'low', '#22c55e', layer.fill_color || '#38bdf8'],
                'circle-stroke-color': layer.line_color || '#ffffff',
                'circle-stroke-width': Number(layer.line_width || 1.5),
                'circle-opacity': Number(layer.fill_opacity ?? 0.9)
            },
            layout: {
                visibility: window.getLayerInitialVisibility(layer.layer_key)
            }
        });

        attachCommunityComplaintPopup(layer.fill_layer_id);
    }

    if (!isPointLayer(layer) && layer.fill_layer_id && !window.KRWMP_MAP.getLayer(layer.fill_layer_id)) {
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

        if (window.attachInteractivePopupHandshake) {
            window.attachInteractivePopupHandshake(layer.line_layer_id, layer.popup_type || layer.layer_key);
        }
    }

    window.KRWMP_MAP.once('idle', hideLayerLoading);
    window.setTimeout(hideLayerLoading, 3500);
}

function isPointLayer(layer) {
    return layer.layer_key === 'community_complaints' || layer.popup_type === 'community_complaints' || String(layer.fill_layer_id || '').includes('_circle');
}

function attachCommunityComplaintPopup(layerId) {
    if (!window.KRWMP_MAP || !layerId || window.KRWMP_MAP.__communityComplaintPopupBound) return;
    window.KRWMP_MAP.__communityComplaintPopupBound = true;

    window.KRWMP_MAP.on('click', layerId, (event) => {
        const feature = event.features && event.features[0];
        if (!feature) return;
        const p = feature.properties || {};
        const html = `
            <div style="font-family:Arial;min-width:230px;max-width:300px">
                <strong>${escapeHtml(p.issue_title || 'Community complaint')}</strong><br>
                <small>${escapeHtml(p.report_code || '')} · ${escapeHtml(p.status || '')} · ${escapeHtml(p.severity_level || '')}</small>
                <p style="margin:8px 0 6px 0">${escapeHtml(p.description || '')}</p>
                <div style="font-size:11px;color:#64748b">${escapeHtml(p.category_name || '')}</div>
                ${p.photo_url ? `<a href="${escapeHtml(p.photo_url)}" target="_blank" style="font-size:12px;color:#059669">View photo evidence</a>` : ''}
            </div>`;
        new maplibregl.Popup().setLngLat(event.lngLat).setHTML(html).addTo(window.KRWMP_MAP);
    });

    window.KRWMP_MAP.on('mouseenter', layerId, () => { window.KRWMP_MAP.getCanvas().style.cursor = 'pointer'; });
    window.KRWMP_MAP.on('mouseleave', layerId, () => { window.KRWMP_MAP.getCanvas().style.cursor = ''; });
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
            label.innerHTML = `
                <input type="checkbox" id="${checkboxId}" ${isLayerDefaultVisible(layer) ? 'checked' : ''} class="accent-emerald-500 h-4 w-4 cursor-pointer flex-shrink-0">
                <div class="flex items-center justify-center w-8 flex-shrink-0">
                    <span class="inline-block h-4 w-6 rounded-sm border-2" style="border-color:${escapeHtml(layer.line_color || '#10b981')};background:${escapeHtml(layer.fill_color || '#10b981')}33"></span>
                </div>
                <div class="min-w-0">
                    <div class="font-semibold text-slate-300">${escapeHtml(layer.layer_name || layer.layer_key)}</div>
                    <div class="text-[10px] text-slate-500">${escapeHtml(getLayerDescription(layer))}</div>
                </div>
            `;
            container.appendChild(label);
        });
    });

    container.dataset.databaseLayerControls = 'true';
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
    if (category === 'community_participation') return 'Community Participation';
    if (category === 'uploaded_vector') return 'Uploaded Database Vector Layers';
    if (category === 'boundary') return 'Boundary Layers';
    if (category === 'environment') return 'Environmental Layers';
    if (category === 'hydrology') return 'Hydrology Layers';
    return String(category || 'Database Layers').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function getLayerDescription(layer) {
    if (layer.layer_key === 'community_complaints') return 'Public catchment issue reports';
    if (layer.category === 'uploaded_vector') return 'Supabase/PostGIS uploaded layer';
    return 'Database managed GIS layer';
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
    if (!checkbox) return;
    if (checkbox.dataset.krwmpBound === 'true') return;
    checkbox.dataset.krwmpBound = 'true';

    checkbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibility = checked ? 'visible' : 'none';
        const layerKey = getConfigKeyFromCheckboxId(checkboxId);
        const layer = getLayerDefinitionByKey(layerKey);

        if (checked && layer) addDynamicSpatialLayer(layer);

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
    if (checkbox) return checkbox.checked ? 'visible' : 'none';
    if (isLayerDefaultVisible(layer)) return 'visible';
    return 'none';
};

window.shouldLoadLayerGroup = function (layerKey) {
    const checkboxId = getCheckboxIdFromConfigKey(layerKey);
    const checkbox = document.getElementById(checkboxId);
    const layer = getLayerDefinitionByKey(layerKey);
    if (checkbox) return checkbox.checked;
    return isLayerDefaultVisible(layer);
};

function isLayerDefaultVisible(layer) {
    return layer?.default_visible === true || layer?.default_visible === 'true';
}

function getCheckboxIdFromConfigKey(layerKey) { return `chk-layer-${layerKey}`; }
function getConfigKeyFromCheckboxId(checkboxId) { return checkboxId.replace('chk-layer-', ''); }
function getLayerDefinitionByKey(layerKey) { return (window.KRWMP_DYNAMIC_LAYERS || []).find(layer => layer.layer_key === layerKey); }
function escapeHtml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
