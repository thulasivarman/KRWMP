/**
 * KRWMP Popup Manager
 * Handles map feature popups and cursor interaction.
 * Supports both predefined popup types and user-configured popup fields from gis_layers.
 */

window.attachInteractivePopupHandshake = function (layerFillId, layerConfig) {
    window.KRWMP_MAP.on('click', layerFillId, (e) => {
        if (!e.features || !e.features.length) return;
        const props = e.features[0].properties || {};
        const popupData = buildPopupData(layerConfig, props);
        new maplibregl.Popup({ className: 'krwmp-parcel-popup', closeButton: true, closeOnClick: true, offset: 16 })
            .setLngLat(e.lngLat)
            .setHTML(`<div class="krwmp-map-popup krwmp-glass-popup"><div class="krwmp-map-popup-header krwmp-glass-header"><div class="krwmp-glass-title">${escapePopup(popupData.title)}</div><div class="krwmp-glass-subtitle">${escapePopup(popupData.subtitle)}</div></div><div class="krwmp-status-badge"><span class="krwmp-status-dot"></span>${escapePopup(popupData.badge || 'ACTIVE LAYER')}</div><div class="krwmp-attribute-table">${popupData.rows}</div></div>`)
            .addTo(window.KRWMP_MAP);
    });
    window.KRWMP_MAP.on('mouseenter', layerFillId, () => { window.KRWMP_MAP.getCanvas().style.cursor = 'pointer'; });
    window.KRWMP_MAP.on('mouseleave', layerFillId, () => { window.KRWMP_MAP.getCanvas().style.cursor = ''; });
};

function buildPopupData(layerConfig, props) {
    const layer = typeof layerConfig === 'object' && layerConfig !== null
        ? layerConfig
        : { popup_type: layerConfig, layer_key: layerConfig };

    const configuredFields = normalisePopupFields(layer.popup_fields);
    if (configuredFields.length) return buildConfiguredPopupData(layer, props, configuredFields);

    const type = layer.popup_type || layer.layer_key;
    if (type === 'basin') return { title: props.wshd_name || 'Kelani River Catchment', subtitle: 'Watershed Boundary', rows: `${popupRow('Watershed No', props.washd_no || '-')}${popupRow('Area (ha)', formatNumber(props.hectares))}${popupRow('Area (km²)', formatDecimal(props.area_sqkm, 2))}` };
    if (type === 'dsd') return { title: `${props.dsd_n || 'Unknown'} DSD`, subtitle: 'Divisional Secretariat Division', rows: `${popupRow('DSD Code', props.iddsd || '-')}${popupRow('District ID', props.iddistrict || '-')}` };
    if (type === 'gnd') return { title: `${props.gnd_name || 'Unknown'} GND Division`, subtitle: 'Grama Niladhari Division', rows: `${popupRow('Local Authority', props.la || 'N/A')}${popupRow('GND Code', props.idgnd || '-')}${popupRow('Area (ha)', formatDecimal(props.area_ha, 2))}` };
    if (type === 'community_complaints') return { title: props.issue_title || 'Community Complaint', subtitle: `${props.category_name || 'Public Issue'} · ${props.report_code || '-'}`, badge: `${String(props.severity_level || 'medium').toUpperCase()} SEVERITY`, rows: `${popupRow('Status', props.status || '-')}${popupRow('Severity', props.severity_level || '-')}${popupRow('Description', props.description || '-')}${popupRow('Submitted', formatDate(props.submitted_at))}${props.photo_url ? popupRow('Photo Evidence', 'Available') : ''}` };
    if (type === 'vwmc_locations') return { title: props.committee_name || 'VWMC Location', subtitle: `${props.village_name || 'Village'} · ${props.committee_code || '-'}`, badge: 'VWMC LOCATION', rows: `${popupRow('Status', props.status || '-')}${popupRow('GND', props.gnd_name || '-')}${popupRow('DSD', props.dsd_name || '-')}${popupRow('Address', props.address || '-')}${popupRow('Members', props.member_count || 0)}${popupRow('Updated By', props.updated_by || '-')}${popupRow('Updated At', formatDate(props.updated_at))}` };
    if (type === 'institution_locations') return { title: props.institution_name || 'Institution Location', subtitle: `${props.institution_type || 'Institution'} · ${props.institution_code || '-'}`, badge: 'INSTITUTION LOCATION', rows: `${popupRow('Contact Person', props.contact_person || '-')}${popupRow('Phone', props.contact_phone || '-')}${popupRow('Email', props.contact_email || '-')}${popupRow('Website', props.website || '-')}${popupRow('Address', props.address || '-')}${popupRow('District', props.district || '-')}${popupRow('DSD', props.dsd_name || '-')}${popupRow('GND', props.gnd_name || '-')}${popupRow('Status', formatActiveStatus(props.active))}${popupRow('Updated At', formatDate(props.updated_at))}` };
    if (type === 'volunteer_organisations') return { title: props.institution_name || props.organisation_name || 'Volunteer Organisation', subtitle: `${props.organisation_type || props.institution_type || 'Volunteer Organisation'} · ${props.registration_no || props.institution_code || '-'}`, badge: 'VOLUNTEER ORGANISATION', rows: `${popupRow('Contact Person', props.contact_person || '-')}${popupRow('Phone', props.contact_phone || '-')}${popupRow('Email', props.contact_email || '-')}${popupRow('Address', props.address || '-')}${popupRow('DSD', props.dsd_name || '-')}${popupRow('GND', props.gnd_name || '-')}${popupRow('Performance Score', props.performance_score ?? '-')}${popupRow('Status', formatActiveStatus(props.active))}` };

    return buildFallbackPopupData(layer, props);
}

function buildConfiguredPopupData(layer, props, fields) {
    const titleField = layer.popup_title_field;
    const title = titleField && hasPopupValue(props[titleField])
        ? props[titleField]
        : layer.layer_name || 'Spatial Feature';

    const subtitle = layer.popup_subtitle || layer.category || 'GIS Layer';
    const rows = fields
        .filter(field => field && field.key)
        .map(field => popupRow(field.label || prettifyKey(field.key), formatPopupValue(props[field.key], field)))
        .join('');

    return { title, subtitle, rows: rows || popupRow('No attributes configured', '-') };
}

function buildFallbackPopupData(layer, props) {
    const excludedKeys = new Set(['geom', 'geometry', 'geometry_wkt', 'geometry_json']);
    const rows = Object.entries(props)
        .filter(([key]) => !excludedKeys.has(key))
        .slice(0, 12)
        .map(([key, value]) => popupRow(prettifyKey(key), formatPopupValue(value, { type: 'text' })))
        .join('');

    return {
        title: layer.layer_name || props.name || props.id || 'Spatial Feature',
        subtitle: layer.popup_subtitle || layer.category || 'GIS Layer',
        rows: rows || popupRow('Feature ID', props.id || '-')
    };
}

function normalisePopupField(field) {
    if (!field) return null;
    if (typeof field === 'string') {
        const key = field.trim();
        return key ? { key, label: prettifyKey(key), type: 'text' } : null;
    }
    const key = String(field.key || '').trim();
    if (!key) return null;
    return {
        key,
        label: String(field.label || prettifyKey(key)).trim(),
        type: field.type || 'text',
        digits: field.digits
    };
}

function normalisePopupFields(fields) {
    if (Array.isArray(fields)) return fields.map(normalisePopupField).filter(Boolean);
    if (typeof fields === 'string' && fields.trim()) {
        try {
            const parsed = JSON.parse(fields);
            if (Array.isArray(parsed)) return parsed.map(normalisePopupField).filter(Boolean);
        } catch (error) {
            return fields.split(',').map(normalisePopupField).filter(Boolean);
        }
    }
    return [];
}

function popupRow(label, value) { return `<div class="krwmp-attribute-row"><span>${escapePopup(label)}</span><strong>${escapePopup(value)}</strong></div>`; }
function escapePopup(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function formatActiveStatus(value) { return value === false || value === 'false' ? 'Inactive' : 'Active'; }
function formatDate(value) { if (!value) return '-'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '-'; return date.toLocaleString(); }
function formatNumber(value) { const number = parseFloat(value); if (Number.isNaN(number)) return '-'; return number.toLocaleString(); }
function formatDecimal(value, digits = 2) { const number = parseFloat(value); if (Number.isNaN(number)) return '-'; return number.toFixed(digits); }
function hasPopupValue(value) { return value !== null && value !== undefined && value !== ''; }
function prettifyKey(key) { return String(key || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, char => char.toUpperCase()); }
function formatPopupValue(value, field = {}) {
    if (!hasPopupValue(value)) return '-';
    if (field.type === 'decimal') return formatDecimal(value, Number.isInteger(field.digits) ? field.digits : 2);
    if (field.type === 'number') return formatNumber(value);
    if (field.type === 'date' || field.type === 'datetime') return formatDate(value);
    if (field.type === 'boolean') {
        if (value === true || value === 'true' || value === 1 || value === '1') return 'Yes';
        if (value === false || value === 'false' || value === 0 || value === '0') return 'No';
    }
    return String(value);
}
