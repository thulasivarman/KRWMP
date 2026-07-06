/**
 * ==========================================================================
 * KRWMP MANAGEMENT PORTAL
 * Centralized GIS Vector Layer Configuration
 * ==========================================================================
 */

window.KRWMP_LAYERS_CONFIG = {
    boundaries: {

        basin: {
            id: 'krwmp-basin-source',
            url: window.KRWMP_UTILS.withGisApiBase('/api/spatial/basin'),
            type: 'geojson',
            label: 'Kelani Watershed Boundary',
            layers: [
                {
                    id: 'layer-basin-polygon',
                    type: 'fill',
                    paint: {
                        'fill-color': '#0ea5e9',
                        'fill-opacity': 0.08
                    }
                },
                {
                    id: 'layer-basin-outline',
                    type: 'line',
                    paint: {
                        'line-color': '#0284c7',
                        'line-width': 2.8,
                        'line-dasharray': [2, 1]
                    }
                }
            ]
        },

        forest: {
            id: 'krwmp-forest-source',
            url: window.KRWMP_UTILS.withGisApiBase('/api/spatial/forest'),
            type: 'geojson',
            label: 'Forest Cover',
            layers: [
                {
                    id: 'layer-forest-polygon',
                    type: 'fill',
                    paint: {
                        'fill-color': '#16a34a',
                        'fill-opacity': 0.62
                    }
                },
                {
                    id: 'layer-forest-outline',
                    type: 'line',
                    paint: {
                        'line-color': '#052e16',
                        'line-width': 1.4,
                        'line-opacity': 0.9
                    }
                }
            ]
        },

        dsd: {
            id: 'krwmp-dsd-source',
            url: window.KRWMP_UTILS.withGisApiBase('/api/spatial/dsd'),
            type: 'geojson',
            label: 'Divisional Secretariat Divisions',
            layers: [
                {
                    id: 'layer-dsd-polygon',
                    type: 'fill',
                    paint: {
                        'fill-color': '#10b981',
                        'fill-opacity': 0.03
                    }
                },
                {
                    id: 'layer-dsd-outline',
                    type: 'line',
                    paint: {
                        'line-color': '#047857',
                        'line-width': 1.2,
                        'line-opacity': 0.8
                    }
                }
            ]
        },

        gnd: {
            id: 'krwmp-gnd-source',
            url: window.KRWMP_UTILS.withGisApiBase('/api/spatial/gnd'),
            type: 'geojson',
            label: 'Grama Niladhari Divisions',
            layers: [
                {
                    id: 'layer-gnd-polygon',
                    type: 'fill',
                    minzoom: 9,
                    maxzoom: 18,
                    paint: {
                        'fill-color': '#f59e0b',
                        'fill-opacity': 0.015
                    }
                },
                {
                    id: 'layer-gnd-outline',
                    type: 'line',
                    paint: {
                        'line-color': '#d97706',
                        'line-width': 0.45,
                        'line-opacity': 0.55
                    }
                }
            ]
        }
    }
};
