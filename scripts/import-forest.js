require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

async function importForest() {
    const filePath = path.join(__dirname, '../data/forest.geojson');
    const geojson = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    await pool.query('DELETE FROM public.forest_cover');

    for (const feature of geojson.features) {
        const p = feature.properties || {};
        const geom = JSON.stringify(feature.geometry);

        await pool.query(
            `
            INSERT INTO public.forest_cover
            (
                source_id,
                name,
                district,
                range_name,
                beat,
                dsd,
                area,
                lc,
                forest_type,
                geom
            )
            VALUES
            (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                ST_SetSRID(ST_GeomFromGeoJSON($10), 4326)
            )
            `,
            [
                p.Id || null,
                p.name || null,
                p.district || null,
                p.range || null,
                p.beat || null,
                p.dsd || null,
                p.area || null,
                p.lc || null,
                p.type || null,
                geom
            ]
        );
    }

    console.log(`Imported ${geojson.features.length} forest features.`);
    await pool.end();
}

importForest().catch(err => {
    console.error(err);
    process.exit(1);
});