/**
 * KRWMP Application Entry Point
 */

function loadOptionalScript(src) {
    return new Promise((resolve) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) return resolve();

        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = resolve;
        document.head.appendChild(script);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (window.loadLayerRegistry) {
        await window.loadLayerRegistry();
    }

    await window.initializeInterface();

    await loadOptionalScript('/assets/js/uploaded-vector-layer-loader.js');

    window.initializeMap();

    if (window.initializeMapExportControls) {
        window.initializeMapExportControls();
    }

    if (window.initializeBasemapSwitcher) {
        window.initializeBasemapSwitcher();
    }
});
