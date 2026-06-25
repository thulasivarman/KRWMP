/**
 * KRWMP Popup Manager
 * Handles map feature popups and cursor interaction.
 *
 * Popup content is controlled by layer metadata returned from /api/layers:
 * - popup_title_field: property key used as popup title
 * - popup_subtitle: static popup subtitle
 * - popup_fields: JSON array of fields to display
 */

window.attachInteractivePopupHandshake = function (layerFillId, layerConfig) {
    window.KRWMP_MAP.on('click', layerFillId, (e) => {
        if (!e.features || !e.features.length) return;

        const props = e.features[0].properties || {};
        const popupData = buildDynamicPopupData(layerConfig, props);

        new maplibregl.Popup({
            className: 'krwmp-parcel-popup',
            closeButton: true,
            closeOnClick: true,
            offset: 16
        })
            .setLngLat(e.lngLat)
            .setHTML(`
                <div class="krwmp-glass-popup">
                    <div class="krwmp-glass-header">
                        <div class="krwmp-glass-title">${escapeHtml(popupData.title)}</div>
                        <div class="krwmp-glass-subtitle">${escapeHtml(popupData.subtitle)}</div>
                    </div>

                    <div class="krwmp-status-badge">
                        <span class="krwmp-status-dot"></span>
                        ACTIVE LAYER
                    </div>

                    <div class="krwmp-attribute-table">
                        ${popupData.rows}
                    </div>
                </div>
            `)
            .addTo(window.KRWMP_MAP);
    });

    window.KRWMP_MAP.on('mouseenter', layerFillId, () => {
        window.KRWMP_MAP.getCanvas().style.cursor = 'pointer';
    });

    window.KRWMP_MAP.on('mouseleave', layerFillId, () => {
        window.KRWMP_MAP.getCanvas().style.cursor = '';
    });
};

function buildDynamicPopupData(layerConfig, props) {
    const safeLayer = typeof layerConfig === 'object' && layerConfig !== null ? layerConfig : {};
    const fields = normalisePopupFields(safeLayer.popup_fields);
    const titleField = safeLayer.popup_title_field;

    const title = titleField && hasUsableValue(props[titleField])
        ? props[titleField]
        : safeLayer.layer_name || 'Spatial Feature';

    const subtitle = safeLayer.popup_subtitle || safeLayer.category || 'GIS Layer';

    const rows = fields.length
        ? fields
            .filter(field => field && field.key)
            .map(field => popupRow(field.label || prettifyKey(field.key), formatPopupValue(props[field.key], field)))
            .join('')
        : buildFallbackRows(props);

    return {
        title,
        subtitle,
        rows: rows || popupRow('No attributes', '-')
    };
}

function normalisePopupFields(fields) {
    if (Array.isArray(fields)) return fields;

    if (typeof fields === 'string' && fields.trim()) {
        try {
            const parsed = JSON.parse(fields);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn('Invalid popup_fields JSON:', error);
            return [];
        }
    }

    return [];
}

function buildFallbackRows(props) {
    const excludedKeys = new Set([
        'geom',
        'geometry',
        'geometry_wkt',
        'geometry_json'
    ]);

    return Object.entries(props)
        .filter(([key]) => !excludedKeys.has(key))
        .slice(0, 12)
        .map(([key, value]) => popupRow(prettifyKey(key), formatPopupValue(value, { type: 'text' })))
        .join('');
}

function popupRow(label, value) {
    return `
        <div class="krwmp-attribute-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function formatPopupValue(value, field = {}) {
    if (!hasUsableValue(value)) return '-';

    if (field.type === 'decimal') {
        const number = parseFloat(value);
        if (Number.isNaN(number)) return '-';
        return number.toFixed(Number.isInteger(field.digits) ? field.digits : 2);
    }

    if (field.type === 'number') {
        const number = parseFloat(value);
        if (Number.isNaN(number)) return '-';
        return number.toLocaleString();
    }

    if (field.type === 'date') {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString();
    }

    if (field.type === 'datetime') {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleString();
    }

    if (field.type === 'boolean') {
        if (value === true || value === 'true' || value === 1 || value === '1') return 'Yes';
        if (value === false || value === 'false' || value === 0 || value === '0') return 'No';
    }

    return String(value);
}

function hasUsableValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function prettifyKey(key) {
    return String(key || '')
        .replaceAll('_', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}