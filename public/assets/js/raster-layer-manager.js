window.KRWMP_RASTER_LAYERS = [];

window.loadRasterLayerRegistry = async function () {
    try {
        const data = await window.KRWMP_UTILS.apiRequest('/api/raster-layers');
        window.KRWMP_RASTER_LAYERS = data.layers || [];
        return window.KRWMP_RASTER_LAYERS;
    } catch (error) {
        console.error('Raster layer registry loading failed:', error);
        window.KRWMP_RASTER_LAYERS = [];
        return [];
    }
};

window.initializeRasterLayerControls = async function () {
    if (!window.KRWMP_MAP) return;
    const layers = await window.loadRasterLayerRegistry();
    renderRasterLayerControls(layers);
    layers.forEach(layer => {
        if (layer.default_visible === true || layer.default_visible === 'true') addRasterLayerToMap(layer);
    });
};

function getRasterRenderMode(layer) {
    if (layer.tile_url_template) return 'tiles';
    if (layer.preview_file_url || layer.file_url) return 'image';
    return 'none';
}

function getRasterImageUrl(layer) {
    const previewUrl = layer.preview_file_url || layer.file_url || '';
    if (!/\.(png|jpg|jpeg|webp)(\?.*)?$/i.test(previewUrl)) return null;
    const version = encodeURIComponent(layer.updated_at || layer.uploaded_at || Date.now());
    return previewUrl.includes('?') ? `${previewUrl}&v=${version}` : `${previewUrl}?v=${version}`;
}

function rasterLocalKey(layerKey) {
    return `krwmp_raster_symbology_${layerKey}`;
}

function getStoredRasterSymbology(layer) {
    try {
        return JSON.parse(localStorage.getItem(rasterLocalKey(layer.layer_key)) || '{}') || {};
    } catch (error) {
        return {};
    }
}

function getRasterPaint(layer) {
    const saved = getStoredRasterSymbology(layer);
    return {
        'raster-opacity': clampNumber(saved.opacity ?? layer.opacity ?? 0.7, 0, 1),
        'raster-brightness-min': clampNumber(saved.brightnessMin ?? layer.brightness_min ?? 0, 0, 1),
        'raster-brightness-max': clampNumber(saved.brightnessMax ?? layer.brightness_max ?? 1, 0, 1),
        'raster-contrast': clampNumber(saved.contrast ?? layer.contrast ?? 0, -1, 1),
        'raster-saturation': clampNumber(saved.saturation ?? layer.saturation ?? 0, -1, 1),
        'raster-hue-rotate': clampNumber(saved.hueRotate ?? layer.hue_rotate ?? 0, 0, 360)
    };
}

function setStoredRasterSymbology(layer, patch) {
    const current = getStoredRasterSymbology(layer);
    const next = { ...current, ...patch };
    localStorage.setItem(rasterLocalKey(layer.layer_key), JSON.stringify(next));
    return next;
}

function getFirstVectorLayerId() {
    const vectorLayers = window.KRWMP_DYNAMIC_LAYERS || [];
    for (const layer of vectorLayers) {
        if (layer.fill_layer_id && window.KRWMP_MAP.getLayer(layer.fill_layer_id)) return layer.fill_layer_id;
        if (layer.line_layer_id && window.KRWMP_MAP.getLayer(layer.line_layer_id)) return layer.line_layer_id;
    }
    return null;
}

function moveVectorLayersAboveRasters() {
    if (!window.KRWMP_MAP) return;
    (window.KRWMP_DYNAMIC_LAYERS || []).forEach(layer => {
        [layer.fill_layer_id, layer.line_layer_id].filter(Boolean).forEach(layerId => {
            if (window.KRWMP_MAP.getLayer(layerId)) {
                try { window.KRWMP_MAP.moveLayer(layerId); } catch (error) { console.warn(`Could not move ${layerId} above raster layers`, error); }
            }
        });
    });
}

function addRasterLayerToMap(layer) {
    if (!window.KRWMP_MAP || !layer || !layer.layer_key) return;
    const mode = getRasterRenderMode(layer);
    const sourceId = `raster-source-${layer.layer_key}`;
    const layerId = `raster-layer-${layer.layer_key}`;

    if (!window.KRWMP_MAP.getSource(sourceId)) {
        if (mode === 'tiles') {
            window.KRWMP_MAP.addSource(sourceId, {
                type: 'raster',
                tiles: [layer.tile_url_template],
                tileSize: 256,
                bounds: getRasterBounds(layer),
                minzoom: Number(layer.tile_min_zoom ?? layer.min_zoom ?? 0),
                maxzoom: Number(layer.tile_max_zoom ?? layer.max_zoom ?? 14)
            });
        } else if (mode === 'image') {
            const imageUrl = getRasterImageUrl(layer);
            if (!imageUrl) return;
            const bounds = getRasterBounds(layer);
            window.KRWMP_MAP.addSource(sourceId, {
                type: 'image',
                url: imageUrl,
                coordinates: [
                    [bounds[0], bounds[3]],
                    [bounds[2], bounds[3]],
                    [bounds[2], bounds[1]],
                    [bounds[0], bounds[1]]
                ]
            });
        } else {
            console.warn(`Raster layer ${layer.layer_key} has no tile or preview source.`);
            return;
        }
    }

    if (!window.KRWMP_MAP.getLayer(layerId)) {
        const beforeId = getFirstVectorLayerId();
        window.KRWMP_MAP.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),
            paint: getRasterPaint(layer),
            layout: { visibility: 'visible' }
        }, beforeId || undefined);
    } else {
        window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', 'visible');
        applyRasterSymbology(layer);
    }

    moveVectorLayersAboveRasters();
}

function getRasterBounds(layer) {
    if (Array.isArray(layer.bounds) && layer.bounds.length === 4) return layer.bounds.map(Number);
    return [79.5, 6.4, 80.8, 7.6];
}

function setRasterVisibility(layer, visible) {
    const layerId = `raster-layer-${layer.layer_key}`;
    if (visible) return addRasterLayerToMap(layer);
    if (window.KRWMP_MAP.getLayer(layerId)) window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', 'none');
}

function applyRasterSymbology(layer) {
    const layerId = `raster-layer-${layer.layer_key}`;
    if (!window.KRWMP_MAP.getLayer(layerId)) addRasterLayerToMap(layer);
    if (!window.KRWMP_MAP.getLayer(layerId)) return;
    const paint = getRasterPaint(layer);
    Object.keys(paint).forEach(property => window.KRWMP_MAP.setPaintProperty(layerId, property, paint[property]));
    moveVectorLayersAboveRasters();
}

function setRasterOpacity(layer, opacity) {
    setStoredRasterSymbology(layer, { opacity: clampNumber(opacity, 0, 1) });
    applyRasterSymbology(layer);
}

function setRasterDisplayValue(layer, key, value) {
    setStoredRasterSymbology(layer, { [key]: Number(value) });
    applyRasterSymbology(layer);
}

function zoomToRaster(layer) {
    if (!window.KRWMP_MAP) return;
    const bounds = getRasterBounds(layer);
    window.KRWMP_MAP.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, duration: 800 });
}

function renderRasterLayerControls(layers) {
    const container = document.getElementById('raster-layer-control-list');
    if (!container) return;
    container.innerHTML = '';
    if (!layers.length) {
        container.innerHTML = '<div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">No raster layers available</div>';
        return;
    }

    layers.forEach((layer, index) => {
        const checked = layer.default_visible === true || layer.default_visible === 'true';
        const saved = getStoredRasterSymbology(layer);
        const opacity = clampNumber(saved.opacity ?? layer.opacity ?? 0.7, 0, 1);
        const brightnessMin = clampNumber(saved.brightnessMin ?? layer.brightness_min ?? 0, 0, 1);
        const brightnessMax = clampNumber(saved.brightnessMax ?? layer.brightness_max ?? 1, 0, 1);
        const contrast = clampNumber(saved.contrast ?? layer.contrast ?? 0, -1, 1);
        const saturation = clampNumber(saved.saturation ?? layer.saturation ?? 0, -1, 1);
        const hueRotate = clampNumber(saved.hueRotate ?? layer.hue_rotate ?? 0, 0, 360);
        const mode = getRasterRenderMode(layer);
        const classes = getRasterClasses(layer);
        const card = document.createElement('div');
        card.className = 'bg-slate-950/50 border border-slate-800 rounded-lg overflow-hidden';
        card.innerHTML = `
            <div class="raster-accordion-head flex items-center justify-between gap-3 p-3 cursor-pointer hover:bg-slate-900/70 transition">
                <label class="flex items-center gap-3 cursor-pointer min-w-0" onclick="event.stopPropagation()">
                    <input type="checkbox" ${checked ? 'checked' : ''} class="raster-visible accent-emerald-500 h-4 w-4 cursor-pointer flex-shrink-0">
                    <div class="min-w-0">
                        <div class="font-semibold text-slate-200 leading-tight truncate">${escapeRasterHtml(layer.layer_name || layer.layer_key)}</div>
                        <div class="text-[10px] text-slate-500 mt-0.5 truncate">${escapeRasterHtml(layer.original_file_name || layer.file_name || '')}</div>
                    </div>
                </label>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-[9px] text-emerald-400 uppercase">${classes.length ? `${classes.length} classes` : mode}</span>
                    <span class="raster-accordion-icon text-slate-400">${index === 0 ? '▼' : '▶'}</span>
                </div>
            </div>
            <div class="raster-accordion-body ${index === 0 ? '' : 'hidden'} p-3 pt-0 space-y-3 border-t border-slate-800/70">
                <div class="flex justify-end"><button type="button" class="raster-zoom text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-emerald-600 text-slate-200 transition">Zoom</button></div>
                ${rangeControl('Opacity', 'raster-opacity', 0, 1, 0.05, opacity, `${Math.round(opacity * 100)}%`)}
                ${rangeControl('Brightness Min', 'raster-brightness-min', 0, 1, 0.05, brightnessMin, brightnessMin.toFixed(2))}
                ${rangeControl('Brightness Max', 'raster-brightness-max', 0, 1, 0.05, brightnessMax, brightnessMax.toFixed(2))}
                ${rangeControl('Contrast', 'raster-contrast', -1, 1, 0.05, contrast, contrast.toFixed(2))}
                ${rangeControl('Saturation', 'raster-saturation', -1, 1, 0.05, saturation, saturation.toFixed(2))}
                ${rangeControl('Hue Rotate', 'raster-hue-rotate', 0, 360, 5, hueRotate, `${Math.round(hueRotate)}°`)}
                ${renderRasterClassLegend(classes)}
                <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                    <div>CRS: <span class="text-slate-300">${escapeRasterHtml(layer.crs || 'Unknown')}</span></div>
                    <div>Size: <span class="text-slate-300">${Number(layer.raster_width || 0)} × ${Number(layer.raster_height || 0)}</span></div>
                    <div>Min Zoom: <span class="text-slate-300">${Number(layer.min_zoom || 0)}</span></div>
                    <div>Max Zoom: <span class="text-slate-300">${Number(layer.max_zoom || 22)}</span></div>
                </div>
            </div>`;
        const head = card.querySelector('.raster-accordion-head');
        const body = card.querySelector('.raster-accordion-body');
        const icon = card.querySelector('.raster-accordion-icon');
        head.addEventListener('click', () => {
            const hidden = body.classList.toggle('hidden');
            icon.textContent = hidden ? '▶' : '▼';
        });
        card.querySelector('.raster-visible').addEventListener('change', event => setRasterVisibility(layer, event.target.checked));
        bindRasterRange(card, '.raster-opacity', layer, 'opacity', value => setRasterOpacity(layer, value), value => `${Math.round(Number(value) * 100)}%`);
        bindRasterRange(card, '.raster-brightness-min', layer, 'brightnessMin', value => setRasterDisplayValue(layer, 'brightnessMin', value));
        bindRasterRange(card, '.raster-brightness-max', layer, 'brightnessMax', value => setRasterDisplayValue(layer, 'brightnessMax', value));
        bindRasterRange(card, '.raster-contrast', layer, 'contrast', value => setRasterDisplayValue(layer, 'contrast', value));
        bindRasterRange(card, '.raster-saturation', layer, 'saturation', value => setRasterDisplayValue(layer, 'saturation', value));
        bindRasterRange(card, '.raster-hue-rotate', layer, 'hueRotate', value => setRasterDisplayValue(layer, 'hueRotate', value), value => `${Math.round(Number(value))}°`);
        card.querySelector('.raster-zoom').addEventListener('click', () => zoomToRaster(layer));
        container.appendChild(card);
    });
}

function getRasterClasses(layer) {
    const symbology = layer.symbology || {};
    if ((symbology.mode !== 'classified' && layer.symbology_mode !== 'classified') || !Array.isArray(symbology.classes)) return [];
    return symbology.classes.slice(0, 10);
}

function renderRasterClassLegend(classes) {
    if (!classes.length) return '<div class="text-[10px] text-slate-500">No classified heat-map classes configured.</div>';
    return `<div class="space-y-1 pt-2 border-t border-slate-800"><div class="text-[10px] uppercase tracking-wider font-bold text-slate-500">Classified Heat Map Legend</div>${classes.map(cls => `<div class="flex items-center justify-between gap-2 text-[10px]"><span class="flex items-center gap-2 min-w-0"><i class="h-3 w-5 rounded-sm border border-white/30 flex-shrink-0" style="background:${escapeRasterHtml(cls.color || '#cccccc')}"></i><span class="text-slate-300 truncate">${escapeRasterHtml(cls.label || `${cls.min} - ${cls.max}`)}</span></span><span class="text-slate-500 flex-shrink-0">${escapeRasterHtml(cls.min)}–${escapeRasterHtml(cls.max)}</span></div>`).join('')}</div>`;
}

function rangeControl(label, className, min, max, step, value, displayValue) {
    return `<div><div class="flex items-center justify-between text-[10px] text-slate-500 mb-1"><span>${label}</span><span class="${className}-value">${displayValue}</span></div><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" class="${className} w-full accent-emerald-500"></div>`;
}

function bindRasterRange(card, selector, layer, key, setter, formatter = value => Number(value).toFixed(2)) {
    const input = card.querySelector(selector);
    const valueLabel = card.querySelector(`${selector}-value`);
    if (!input) return;
    input.addEventListener('input', event => {
        const value = Number(event.target.value);
        if (valueLabel) valueLabel.textContent = formatter(value);
        setter(value, key, layer);
    });
}

function clampNumber(value, min, max) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return min;
    return Math.max(min, Math.min(max, numberValue));
}

function escapeRasterHtml(value) {
    return window.KRWMP_UTILS.escapeHtml(value);
}
