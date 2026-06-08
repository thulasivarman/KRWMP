/**
 * KRWMP Dynamic GIS Layer Registry
 * Loads layer definitions from backend API: /api/layers
 */

window.KRWMP_DYNAMIC_LAYERS = [];

window.loadLayerRegistry = async function () {
    try {
        const response = await fetch('/api/layers');
        const data = await response.json();

        if (!data.success) {
            throw new Error('Failed to load layer registry from API.');
        }

        window.KRWMP_DYNAMIC_LAYERS = data.layers || [];

        console.log(`Loaded ${window.KRWMP_DYNAMIC_LAYERS.length} GIS layers from database.`);

        return window.KRWMP_DYNAMIC_LAYERS;

    } catch (error) {
        console.error('Layer registry loading failed:', error);
        window.KRWMP_DYNAMIC_LAYERS = [];
        return [];
    }
};