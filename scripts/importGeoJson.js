// scripts/importGeoJson.js
const fs = require('fs');
const pool = require('../config/database');

async function importLayer(filePath, tableName, targetConfig) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);

    console.log(`⏳ Parsing ${data.features.length} vector features for table [${tableName}]...`);

    // Dynamic Database Pipeline Execution Loop
    for (const feature of data.features) {
        const props = feature.properties || {};
        const geometryJsonString = JSON.stringify(feature.geometry);

        try {
            let query = '';
            let parameters = [];

            // Execute specialized parameter mappings based on targeting table
            if (tableName === 'basin_boundary') {
                const wshd_name = props[targetConfig.nameProp] || props['wshd_name'] || props['WSHD_NAME'] || 'Kelani Basin';
                const washd_no = parseInt(props['washd_no'] || props['WASHD_NO'] || 0, 10);
                const hectares = parseFloat(props['hectares'] || props['HECTARES'] || 0);

                query = `
                    INSERT INTO basin_boundary (washd_no, wshd_name, hectares, geom)
                    VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4))
                    ON CONFLICT DO NOTHING
                `;
                parameters = [washd_no, wshd_name, hectares, geometryJsonString];

            } else if (tableName === 'dsd_boundary') {
                const dsd_n = props[targetConfig.nameProp] || props['dsd_n'] || props['DSD_N'] || props['NAME_3'] || 'Unknown DSD';
                const objectid = parseInt(props['objectid'] || props['OBJECTID'] || 0, 10);
                const iddistrict = parseInt(props['iddistrict'] || props['IDDISTRICT'] || 0, 10);
                const iddsd = parseInt(props['iddsd'] || props['IDDSD'] || 0, 10);

                query = `
                    INSERT INTO dsd_boundary (objectid, dsd_n, iddistrict, iddsd, geom)
                    VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5))
                    ON CONFLICT DO NOTHING
                `;
                parameters = [objectid, dsd_n, iddistrict, iddsd, geometryJsonString];

            } else if (tableName === 'gnd_boundary') {
                const gnd_name = props[targetConfig.nameProp] || props['gnd_name'] || props['GND_NAME'] || props['GND_N'] || 'Unknown GND';
                const objectid = parseInt(props['objectid'] || props['OBJECTID'] || 0, 10);
                const la = props['la'] || props['LA'] || '';
                const idgnd = parseInt(props['idgnd'] || props['IDGND'] || 0, 10);
                const area_ha = parseFloat(props['area_ha'] || props['AREA_HA'] || props['Shape_Area'] || 0);
                const iddsd = parseInt(props['iddsd'] || props['IDDSD'] || 0, 10);

                query = `
                    INSERT INTO gnd_boundary (objectid, gnd_name, la, idgnd, area_ha, iddsd, geom)
                    VALUES ($1, $2, $3, $4, $5, $6, ST_GeomFromGeoJSON($7))
                    ON CONFLICT DO NOTHING
                `;
                parameters = [objectid, gnd_name, la, idgnd, area_ha, iddsd, geometryJsonString];
            }

            // Fire parameterized transactional query downstream to Supabase pooler connection
            await pool.query(query, parameters);

        } catch (dbError) {
            const labelKey = props[targetConfig.nameProp] || 'Unknown Vector';
            console.error(`⚠️  Failed to ingest feature [${labelKey}] into ${tableName}:`, dbError.message);
        }
    }
    console.log(`✅ Completed data block stream mapping for [${tableName}].\n`);
}

module.exports = { importLayer };