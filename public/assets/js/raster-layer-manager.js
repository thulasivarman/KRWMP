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

function addRasterLayerToMap(layer) {
    if (!window.KRWMP_MAP || !layer || !layer.layer_key || !layer.file_url) return;

    const sourceId = `raster-source-${layer.layer_key}`;
    const layerId = `raster-layer-${layer.layer_key}`;

    if (!window.KRWMP_MAP.getSource(sourceId)) {
        const bounds = Array.isArray(layer.bounds) && layer.bounds.length === 4
            ? layer.bounds
            : [79.5, 6.4, 80.8, 7.6];

        window.KRWMP_MAP.addSource(sourceId, {
            type: 'image',
            url: layer.file_url,
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

function setRasterVisibility(layer, visible) {
    const layerId = `raster-layer-${layer.layer_key}`;

    if (visible) {
        addRasterLayerToMap(layer);
        return;
    }

    if (window.KRWMP_MAP.getLayer(layerId)) {
        window.KRWMP_MAP.setLayoutProperty(layerId, 'visibility', 'none');
    }
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
        const checkboxId = `chk-raster-${layer.layer_key}`;
        const label = document.createElement('label');
        label.className = 'flex items-center gap-3 bg-slate-950/40 p-2.5 rounded border border-slate-800/60 cursor-pointer hover:border-emerald-500/30 transition';
        label.innerHTML = `
            <input type="checkbox" id="${checkboxId}" ${layer.default_visible ? 'checked' : ''} class="accent-emerald-500 h-4 w-4 cursor-pointer flex-shrink-0">
            <div class="flex items-center justify-center w-8 flex-shrink-0">
                <span class="inline-block h-4 w-6 rounded-sm border-2 border-emerald-500 bg-emerald-500/20"></span>
            </div>
            <div class="min-w-0">
                <div class="font-semibold text-slate-300">${escapeRasterHtml(layer.layer_name || layer.layer_key)}</div>
                <div class="text-[10px] text-slate-500">Raster overlay · opacity ${Number(layer.opacity ?? 0.7)}</div>
            </div>
        `;
        container.appendChild(label);

        const checkbox = label.querySelector('input');
        checkbox.addEventListener('change', event => {
            setRasterVisibility(layer, event.target.checked);
        });
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
