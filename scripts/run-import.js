// scripts/run-import.js
require('dotenv').config(); // MUST BE LINE 1

const { importLayer } = require('./importGeoJson.js');
const path = require('path');

async function main() {
    try {
        console.log('🏁 Starting KRWMP Spatial Data Ingestion (Aligned Schema Matrix)...');

        // 1. Stream Basin Boundaries
        const basinPath = path.join(__dirname, '../public/assets/data/basin-boundary.geojson');
        console.log('🗺️  Processing Basin Boundary Dataset...');
        await importLayer(basinPath, 'basin_boundary', { nameProp: 'wshd_name' });

        // 2. Stream Divisional Secretariat Divisions (DSD)
        const dsdPath = path.join(__dirname, '../public/assets/data/dsd-boundary.geojson');
        console.log('🗺️  Processing DSD Boundary Dataset...');
        await importLayer(dsdPath, 'dsd_boundary', { nameProp: 'dsd_n' });

        // 3. Stream Grama Niladhari Divisions (GND)
        const gndPath = path.join(__dirname, '../public/assets/data/gnd-boundary.geojson');
        console.log('🗺️  Processing GND Boundary Dataset... (Large file compilation)');
        await importLayer(gndPath, 'gnd_boundary', { nameProp: 'gnd_name' });

        console.log('🚀 SUCCESS: Core GIS boundary files successfully committed to live Supabase cluster tables!');
    } catch (error) {
        console.error('❌ CRITICAL INGESTION EXCEPTION:', error);
    }
}

main();