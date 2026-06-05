/**
 * ==========================================================================
 * KRWMP MANAGEMENT PORTAL - CENTRALIZED GIS VECTOR LAYER ARRAYS CONFIGURATION
 * ==========================================================================
 */

window.KRWMP_LAYERS_CONFIG = {
    // Spatial boundary definitions matrix mapping to dynamic cloud data stream blocks
    boundaries: {
        basin: {
            id: 'krwmp-basin-source',
            url: '/api/spatial/basin', // Transferred to live dynamic database API stream
            type: 'geojson',
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
                        'line-width': 2.5,
                        'line-dasharray': [2, 1]
                    }
                }
            ]
        },
        dsd: {
            id: 'krwmp-dsd-source',
            url: '/api/spatial/dsd', // Transferred to live dynamic database API stream
            type: 'geojson',
            layers: [
                {
                    id: 'layer-dsd-polygon',
                    type: 'fill',
                    paint: {
                        'fill-color': '#10b981',
                        'fill-opacity': 0.04
                    }
                },
                {
                    id: 'layer-dsd-outline',
                    type: 'line',
                    paint: {
                        'line-color': '#059669',
                        'line-width': 1.2
                    }
                }
            ]
        },
        gnd: {
            id: 'krwmp-gnd-source',
            url: '/api/spatial/gnd', // Transferred to live dynamic database API stream
            type: 'geojson',
            layers: [
                {
                    id: 'layer-gnd-polygon',
                    type: 'fill',
                    paint: {
                        'fill-color': '#f59e0b',
                        'fill-opacity': 0.02
                    }
                },
                {
                    id: 'layer-gnd-outline',
                    type: 'line',
                    paint: {
                        'line-color': '#d97706',
                        'line-width': 0.6,
                        'line-opacity': 0.7
                    }
                }
            ]
        }
    }
};