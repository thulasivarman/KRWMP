const pool = require('../../config/database');

function isSafeIdentifier(value) {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(value || ''));
}

async function getActiveLayers() {
    const sql = `
        SELECT
            layer_key,
            layer_name,
            category,
            api_url,
            source_id,
            fill_layer_id,
            line_layer_id,
            popup_type,
            default_visible,
            min_zoom,
            max_zoom,
            fill_color,
            fill_opacity,
            line_color,
            line_width,
            sort_order
        FROM public.gis_layers
        WHERE active = true
        ORDER BY sort_order ASC;
    `;

    const result = await pool.query(sql);

    return {
        success: true,
        layers: result.rows
    };
}

async function getLayerGeoJSON(layerKey) {
    const layerResult = await pool.query(
        `
        SELECT table_name, geom_column, managed_by_admin
        FROM public.gis_layers
        WHERE layer_key = $1
          AND active = true
        LIMIT 1;
        `,
        [layerKey]
    );

    if (layerResult.rows.length === 0) return null;

    const layer = layerResult.rows[0];

    const allowedTables = [
        'basin_boundary',
        'forest_cover',
        'dsd_boundary',
        'gnd_boundary'
    ];

    const isAdminUploadedTable =
        layer.managed_by_admin === true &&
        String(layer.table_name || '').startsWith('uploaded_') &&
        isSafeIdentifier(layer.table_name);

    if (!allowedTables.includes(layer.table_name) && !isAdminUploadedTable) {
        throw new Error('Unauthorized spatial table');
    }

    if (!isSafeIdentifier(layer.geom_column)) {
        throw new Error('Unauthorized geometry column');
    }

    const sql = `
        SELECT jsonb_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
        ) AS geojson
        FROM (
            SELECT jsonb_build_object(
                'type', 'Feature',
                'id', id,
                'geometry', ST_AsGeoJSON(${layer.geom_column})::jsonb,
                'properties', to_jsonb(t) - '${layer.geom_column}'
            ) AS feature
            FROM public.${layer.table_name} t
        ) x;
    `;

    const result = await pool.query(sql);
    return result.rows[0].geojson;
}

module.exports = {
    getActiveLayers,
    getLayerGeoJSON
};
