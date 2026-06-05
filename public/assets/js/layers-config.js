/**
 * KRWMP PLATFORM - CENTRAL SPATIAL LAYER REGISTRY CONFIGURATION
 * Simply add or remove layer objects to dynamically scale the portal interface.
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
            legendType: 'polygon', // Fixed: Added missing type indicator
            fillColor: '#ff6b6b',
            fillOpacity: 0.0, 
            strokeColor: '#ff6b6b',
            strokeWidth: 1.8,
            legendText: 'Light Red Outline (No Fill Allocation)'
        }
    },
    {
        id: 'gnd-boundary',
        name: 'GND Boundary',
        url: '/assets/data/gnd-boundary.geojson',
        type: 'polygon',
        defaultVisible: true,
        popupAttributeTitle: 'Gramadhari Vasam Division',
        popupFields: [
            { label: 'GND Name', key: 'GND Name' },
            { label: 'GND Code', key: 'GND No' },
            { label: 'Local Authority', key: 'Local Authority' },
            { label: 'Area (Ha)', key: 'Area_Ha' }
        ],
        symbology: {
            legendType: 'polygon',
            fillColor: '#475569',    // Slate Charcoal Base
            fillOpacity: 0.01,      // 1% Fill opacity for crisp pointer captures
            strokeColor: '#0f172a',  // Rich Light Black Outline
            strokeWidth: 1.2,        // Finer layout width tailored for high-density vectors
            legendText: 'Light Black Outline with 1% Fill'
        }
    }
];