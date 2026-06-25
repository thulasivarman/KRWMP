const pool = require('../../config/database');
const { hasPrivilege } = require('../middleware/privilege.middleware');

function isSafeIdentifier(value) {
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(value || ''));
}

async function getActiveLayers(identifier = '') {
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
            popup_title_field,
            popup_subtitle,
            popup_fields,
            default_visible,
            min_zoom,
            max_zoom,
            fill_color,
            fill_opacity,
            line_color,
            line_width,
            sort_order,
            COALESCE(required_privilege, 'map_view') AS required_privilege
        FROM public.gis_layers
        WHERE active = true
        ORDER BY sort_order ASC;
    `;

    const result = await pool.query(sql);
    const filtered = [];
    for (const layer of result.rows) {
        if (await hasPrivilege(identifier, layer.required_privilege || 'map_view', 'view')) filtered.push(layer);
    }

    return { success: true, layers: filtered };
}

function volunteerOrganisationWhereClause(alias = 't') {
    return `
        ${alias}.active = true
        AND ${alias}.geom IS NOT NULL
        AND (
            LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%volunteer%'
            OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%community based%'
            OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%youth group%'
            OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%environmental ngo%'
            OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%civil society%'
        )
    `;
}

async function getVolunteerOrganisationGeoJSON() {
    const sql = `
        SELECT jsonb_build_object(
            'type', 'FeatureCollection',
            'features', COALESCE(jsonb_agg(feature), '[]'::jsonb)
        ) AS geojson
        FROM (
            SELECT jsonb_build_object(
                'type', 'Feature',
                'id', t.id,
                'geometry', ST_AsGeoJSON(t.geom)::jsonb,
                'properties', jsonb_build_object(
                    'id', t.id,
                    'institution_name', t.institution_name,
                    'organisation_name', t.institution_name,
                    'institution_code', t.institution_code,
                    'registration_no', t.institution_code,
                    'institution_type', t.institution_type,
                    'organisation_type', t.institution_type,
                    'contact_person', t.contact_person,
                    'contact_phone', t.contact_phone,
                    'contact_email', t.contact_email,
                    'website', t.website,
                    'address', t.address,
                    'district', t.district,
                    'dsd_name', t.dsd_name,
                    'gnd_name', t.gnd_name,
                    'description', t.description,
                    'latitude', t.latitude,
                    'longitude', t.longitude,
                    'active', t.active,
                    'created_at', t.created_at,
                    'updated_at', t.updated_at
                )
            ) AS feature
            FROM public.intervention_institutions t
            WHERE ${volunteerOrganisationWhereClause('t')}
        ) x;
    `;

    const result = await pool.query(sql);
    return result.rows[0].geojson;
}

async function getLayerGeoJSON(layerKey, identifier = '') {
    const layerResult = await pool.query(
        `
        SELECT layer_key, table_name, geom_column, managed_by_admin, COALESCE(required_privilege, 'map_view') AS required_privilege
        FROM public.gis_layers
        WHERE layer_key = $1
          AND active = true
        LIMIT 1;
        `,
        [layerKey]
    );

    if (layerResult.rows.length === 0) return null;

    const layer = layerResult.rows[0];
    const allowedLayer = await hasPrivilege(identifier, layer.required_privilege || 'map_view', 'view');
    if (!allowedLayer) return null;

    if (layer.layer_key === 'volunteer_organisations' || layer.table_name === 'vw_volunteer_organisation_performance') {
        return getVolunteerOrganisationGeoJSON();
    }

    const allowedTables = [
        'basin_boundary',
        'forest_cover',
        'dsd_boundary',
        'gnd_boundary',
        'district_boundary',
        'community_issue_reports',
        'vwmc_committees',
        'intervention_registry',
        'intervention_institutions',
        'vw_volunteer_organisation_performance'
    ];
    const isAdminUploadedTable = layer.managed_by_admin === true && String(layer.table_name || '').startsWith('uploaded_') && isSafeIdentifier(layer.table_name);

    if (!allowedTables.includes(layer.table_name) && !isAdminUploadedTable) throw new Error('Unauthorized spatial table');
    if (!isSafeIdentifier(layer.geom_column)) throw new Error('Unauthorized geometry column');

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

module.exports = { getActiveLayers, getLayerGeoJSON };
