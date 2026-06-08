/**
 * KRWMP Map Initialization
 * Responsible only for creating the MapLibre map instance.
 */

window.KRWMP_MAP = null;

window.initializeMap = function () {
    window.KRWMP_MAP = new maplibregl.Map({
    container: 'map-canvas',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [80.20, 6.98],
    zoom: 9.2,
    minZoom: 8,
    maxZoom: 16,
    preserveDrawingBuffer: true
});

    window.KRWMP_MAP.addControl(
        new maplibregl.NavigationControl(),
        'top-left'
    );

    window.KRWMP_MAP.on('load', () => {
        console.log('🗺️ MapLibre Canvas Engine operational. Loading cloud boundary arrays...');
        window.initializeSupabaseSpatialSources();
    });
};
