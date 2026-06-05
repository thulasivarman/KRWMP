// scripts/importGnd.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/database'); // Adjust path to your database configuration if needed

async function importGndLayer() {
    const filePath = path.join(__dirname, '../public/assets/data/gnd-boundary.geojson');
    
    console.log('⏳ Reading Grama Niladhari boundary file from disk...');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const geojson = JSON.parse(fileContent);
    const features = geojson.features;

    console.log(`📦 Found ${features.length} vector features. Starting data ingestion loop...`);

    let successfullyImported = 0;

    for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        const props = feature.properties || {};
        const geometryJsonString = JSON.stringify(feature.geometry);

        // Standardize lookups to lowercase to match your updated database schema constraints
        const objectid = parseInt(props.objectid || props.OBJECTID || 0, 10);
        const gnd_name = props.gnd_name || props.GND_NAME || 'Unknown GND';
        const la = props.la || props.LA || 'N/A';
        const idgnd = parseInt(props.idgnd || props.IDGND || 0, 10);
        const area_ha = parseFloat(props.area_ha || props.AREA_HA || 0);
        const iddsd = parseInt(props.iddsd || props.IDDSD || 0, 10);

        const insertQuery = `
            INSERT INTO public.gnd_boundary (objectid, gnd_name, la, idgnd, area_ha, iddsd, geom)
            VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromGeoJSON($7))
            ON CONFLICT (id) DO NOTHING;
        `;

        const parameters = [objectid, gnd_name, la, idgnd, area_ha, iddsd, geometryJsonString];

        try {
            await pool.query(insertQuery, parameters);
            successfullyImported++;
            
            if (successfullyImported % 100 === 0) {
                console.log(`📡 Stream progress: ${successfullyImported}/${features.length} records written...`);
            }
        } catch (dbError) {
            console.error(`⚠️ Failed to ingest feature [${gnd_name}] at index ${i}:`, dbError.message);
        }
    }

    console.log(`\n✅ GND Migration Complete! ${successfullyImported} records successfully written to Supabase.`);
    process.exit(0);
}

importGndLayer().catch(err => {
    console.error('❌ Critical Ingestion Failure:', err);
    process.exit(1);
});