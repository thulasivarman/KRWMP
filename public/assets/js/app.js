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
    if (window.KRWMP_ENGINE) {
        await window.KRWMP_ENGINE.initSession();
        if (!window.KRWMP_ENGINE.requireAuthenticatedSession()) return;
    }
    if (window.KRWMP_UTILS?.loadRuntimeConfig) await window.KRWMP_UTILS.loadRuntimeConfig();
    if (window.loadLayerRegistry) await window.loadLayerRegistry();
    await window.initializeInterface();
    window.initializeMap();
    if (window.initializeMapExportControls) window.initializeMapExportControls();
    if (window.initializeBasemapSwitcher) window.initializeBasemapSwitcher();
    if (window.KRWMP_MAP) {
        window.KRWMP_MAP.on('load', () => {
            if (window.initializeRasterLayerControls) window.initializeRasterLayerControls();
            // Point layers such as community issues, water quality, and knowledge resources
            // are controlled through the database-driven Vector Layer Matrix.
            // Do not auto-load standalone overlays here, otherwise points remain visible
            // even after all vector layer checkboxes are switched off.
        });
    }
});
