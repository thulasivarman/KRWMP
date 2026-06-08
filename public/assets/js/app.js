/**
 * KRWMP Application Entry Point
 */

document.addEventListener('DOMContentLoaded', async () => {
    if (window.loadLayerRegistry) {
        await window.loadLayerRegistry();
    }

    await window.initializeInterface();

    window.initializeMap();

    if (window.initializeMapExportControls) {
        window.initializeMapExportControls();
    }

    if (window.initializeBasemapSwitcher) {
        window.initializeBasemapSwitcher();
    }
});