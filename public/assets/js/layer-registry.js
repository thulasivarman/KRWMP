/**
 * KRWMP Dynamic GIS Layer Registry
 * Loads layer definitions from backend API: /api/layers
 */

window.KRWMP_DYNAMIC_LAYERS = [];

function getLayerRegistryUser() {
    try {
        return window.KRWMP_ENGINE?.Session?.user || JSON.parse(localStorage.getItem('krwmp_user') || 'null') || {};
    } catch (error) {
        return window.KRWMP_ENGINE?.Session?.user || {};
    }
}

function getLayerRegistryHeaders() {
    const user = getLayerRegistryUser();
    const identifier = user.identifier || user.username || user.name || 'thulasi';
    const roleName = user.role_name || user.role || 'admin';

    return {
        'X-KRWMP-User': identifier,
        'X-KRWMP-Role': roleName
    };
}

window.loadLayerRegistry = async function () {
    try {
        const response = await fetch('/api/layers', {
            cache: 'no-store',
            headers: getLayerRegistryHeaders()
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            throw new Error(data.message || `Failed to load layer registry from API. HTTP ${response.status}`);
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