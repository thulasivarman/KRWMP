window.initializeUploadedVectorLayers = async function () {
    if (!window.KRWMP_MAP) return;

    const loadingEl = document.getElementById('map-loading-indicator');
    const show = (message) => {
        if (!loadingEl) return;
        loadingEl.textContent = message;
        loadingEl.classList.remove('hidden');
    };
    const hide = () => {
        if (!loadingEl) return;
        loadingEl.classList.add('hidden');
    };

    try {
        show('Loading uploaded vector layers...');

        const response = await fetch('/data/layers-config.json', { cache: 'no-store' });
        if (!response.ok) {
            hide();
            return;
        }

        const config = await response.json();
        const layers = Array.isArray(config.layers) ? config.layers : [];

        if (!layers.length) {
            hide();
            return;
        }

        layers.forEach(layer => {
            show(`Loading ${layer.name || layer.id}...`);
            if (typeof addUploadedVectorLayer === 'function') {
                addUploadedVectorLayer(layer);
            }
        });

        if (typeof renderUploadedVectorLayerControls === 'function') {
            renderUploadedVectorLayerControls(layers);
        }

        window.KRWMP_MAP.once('idle', hide);
        window.setTimeout(hide, 3500);
    } catch (error) {
        console.error('Failed to load uploaded vector layers:', error);
        hide();
    }
};
