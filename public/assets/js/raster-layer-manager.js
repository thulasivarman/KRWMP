window.KRWMP_RASTER_LAYERS = [];

window.loadRasterLayerRegistry = async function () {
    try {
        const response = await fetch('/api/raster-layers', { cache: 'no-store' });
        const data = await response.json();
        window.KRWMP_RASTER_LAYERS = data.success ? (data.layers || []) : [];
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
        if (layer.default_visible === true || layer.default_visible === 'true') {
            addRasterLayerToMap(layer);
        }
    });
};

function getRasterImageUrl(layer) {
    return layer.preview_file_url || layer.file_url;
}

function addRasterLayerToMap(layer) {
    if (!window.KRWMP_MAP || !layer || !layer.layer_key || !getRasterImageUrl(layer)) return;

    const sourceId = `raster-source-${layer.layer_key}`;
    const layerId = `raster-layer-${layer.layer_key}`;

    if (!window.KRWMP_MAP.getSource(sourceId)) {
        const bounds = getRasterBounds(layer);

        window.KRWMP_MAP.addSource(sourceId, {
            type: 'image',
            url: getRasterImageUrl(layer),
            coordinates: [
                [bounds[0], bounds[3]],
                [bounds[2], bounds[3]],
                [bounds[2], bounds[1]],
                [bounds[0], bounds[1]]
            ]
        });
    }

    if (!window.KRWMP_MAP.getLayer(layerId)) {
        window.KRWMP_MAP.addLayer({
            id: layerId,
            type: 'raster',
            source: sourceId,
            minzoom: Number(layer.min_zoom || 0),
            maxzoom: Number(layer.max_zoom || 22),
            paint: {
                'raster-opacity': Number(layer.opacity ?? 0.7)
            },
            layout: {
                visibility: 'visible'
            }
        });
    } else {
        window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', 'visible');
    }
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

function setRasterOpacity(layer, opacity) {
    const layerId = `raster-layer-${layer.layer_key}`;
    const value = Math.max(0, Math.min(1, Number(opacity)));
    if (!window.KRWMP_MAP.getLayer(layerId)) addRasterLayerToMap(layer);
    if (window.KRWMP_MAP.getLayer(layerId)) window.KRWMP_MAP.setPaintProperty(layerId, 'raster-opacity', value);
}

function zoomToRaster(layer) {
    if (!window.KRWMP_MAP) return;
    const bounds = getRasterBounds(layer);
    window.KRWMP_MAP.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 40, duration: 800 });
}

function renderRasterLayerControls(layers) {
    const panel = document.getElementById('raster-layers-panel');
    if (!panel) return;

    const container = document.getElementById('raster-layer-control-list');
    if (!container) return;

    container.innerHTML = '';

    if (!layers.length) {
        container.innerHTML = '<div class="text-[10px] uppercase tracking-wider text-slate-500 font-bold">No raster layers available</div>';
        return;
    }

    layers.forEach(layer => {
        const checked = layer.default_visible === true || layer.default_visible === 'true';
        const opacity = Number(layer.opacity ?? 0.7);
        const crs = layer.crs || 'Unknown CRS';
        const card = document.createElement('div');
        card.className = 'bg-slate-950/50 border border-slate-800 rounded-lg p-3 space-y-3';
        card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <label class="flex items-start gap-3 cursor-pointer min-w-0">
                    <input type="checkbox" ${checked ? 'checked' : ''} class="raster-visible accent-emerald-500 h-4 w-4 mt-0.5 cursor-pointer flex-shrink-0">
                    <div class="min-w-0">
                        <div class="font-semibold text-slate-200 leading-tight">${escapeRasterHtml(layer.layer_name || layer.layer_key)}</div>
                        <div class="text-[10px] text-slate-500 mt-0.5 truncate">${escapeRasterHtml(layer.original_file_name || layer.file_name || '')}</div>
                    </div>
                </label>
                <button type="button" class="raster-zoom text-[10px] px-2 py-1 rounded bg-slate-800 hover:bg-emerald-600 text-slate-200 transition flex-shrink-0">Zoom</button>
            </div>
            <div>
                <div class="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Opacity</span>
                    <span class="raster-opacity-value">${Math.round(opacity * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.05" value="${opacity}" class="raster-opacity w-full accent-emerald-500">
            </div>
            <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                <div>CRS: <span class="text-slate-300">${escapeRasterHtml(crs)}</span></div>
                <div>Size: <span class="text-slate-300">${Number(layer.raster_width || 0)} × ${Number(layer.raster_height || 0)}</span></div>
                <div>Min Zoom: <span class="text-slate-300">${Number(layer.min_zoom || 0)}</span></div>
                <div>Max Zoom: <span class="text-slate-300">${Number(layer.max_zoom || 22)}</span></div>
            </div>
        `;

        const visibleInput = card.querySelector('.raster-visible');
        const opacityInput = card.querySelector('.raster-opacity');
        const opacityValue = card.querySelector('.raster-opacity-value');
        const zoomButton = card.querySelector('.raster-zoom');

        visibleInput.addEventListener('change', event => setRasterVisibility(layer, event.target.checked));
        opacityInput.addEventListener('input', event => {
            const value = Number(event.target.value);
            opacityValue.textContent = `${Math.round(value * 100)}%`;
            setRasterOpacity(layer, value);
        });
        zoomButton.addEventListener('click', () => zoomToRaster(layer));
        container.appendChild(card);
    });
}

function escapeRasterHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
