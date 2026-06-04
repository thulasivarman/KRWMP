/**
 * KRWMP PLATFORM - CENTRAL SPATIAL LAYER REGISTRY CONFIGURATION
 * Simply add or remove dictionaries here to automatically scale your entire portal.
 */
const krwmpLayersRegistry = [
    {
        id: 'kelani-basin',
        name: 'Basin Boundary',
        url: '/assets/data/basin-boundary.geojson',
        type: 'polygon',
        defaultVisible: true,
        popupAttributeTitle: 'Watershed Envelope',
        popupFields: [
            { label: 'Basin Name', key: 'BASIN_NAME' },
            { label: 'Area (SqKm)', key: 'Area_SqKm' }
        ],
        symbology: {
            legendType: 'polygon',
            fillColor: '#87CEEB',
            fillOpacity: 0.10,
            strokeColor: '#000080',
            strokeWidth: 2.5,
            legendText: 'Sky Blue Fill (10%) with Navy Outline'
        }
    },
    {
        id: 'dsd-boundary',
        name: 'DSD Boundary',
        url: '/assets/data/dsd-boundary.geojson',
        type: 'polygon',
        defaultVisible: true,
        popupAttributeTitle: 'Administrative Boundary',
        popupFields: [
            { label: 'DSD Name', key: 'DSD_NAME' },
            { label: 'District', key: 'DISTRICT' }
        ],
        symbology: {
            legendType: 'polygon',
            fillColor: '#ff6b6b',
            fillOpacity: 0.0, // Invisible target for precise clicks
            strokeColor: '#ff6b6b',
            strokeWidth: 1.8,
            legendText: 'Light Red Outline (No Fill Allocation)'
        }
    }
];