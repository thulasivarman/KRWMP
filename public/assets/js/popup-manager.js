/**
 * KRWMP Popup Manager
 * Handles map feature popups and cursor interaction.
 */

window.attachInteractivePopupHandshake = function (layerFillId, boundaryTypeKey) {
    window.KRWMP_MAP.on('click', layerFillId, (e) => {
        if (!e.features || !e.features.length) return;

        const props = e.features[0].properties || {};
        const popupData = buildPopupData(boundaryTypeKey, props);

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
                        <div class="krwmp-glass-title">${popupData.title}</div>
                        <div class="krwmp-glass-subtitle">${popupData.subtitle}</div>
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

function buildPopupData(type, props) {
    if (type === 'basin') {
        return {
            title: props.wshd_name || 'Kelani River Catchment',
            subtitle: 'Watershed Boundary',
            rows: `
                ${popupRow('Watershed No', props.washd_no || '-')}
                ${popupRow('Area (ha)', formatNumber(props.hectares))}
                ${popupRow('Area (km²)', formatDecimal(props.area_sqkm, 2))}
            `
        };
    }

    if (type === 'dsd') {
        return {
            title: `${props.dsd_n || 'Unknown'} DSD`,
            subtitle: 'Divisional Secretariat Division',
            rows: `
                ${popupRow('DSD Code', props.iddsd || '-')}
                ${popupRow('District ID', props.iddistrict || '-')}
            `
        };
    }

    if (type === 'gnd') {
        return {
            title: `${props.gnd_name || 'Unknown'} GND Division`,
            subtitle: 'Grama Niladhari Division',
            rows: `
                ${popupRow('Local Authority', props.la || 'N/A')}
                ${popupRow('GND Code', props.idgnd || '-')}
                ${popupRow('Area (ha)', formatDecimal(props.area_ha, 2))}
            `
        };
    }

    return {
        title: 'Spatial Feature',
        subtitle: 'GIS Layer',
        rows: popupRow('Feature ID', props.id || '-')
    };
}

function popupRow(label, value) {
    return `
        <div class="krwmp-attribute-row">
            <span>${label}</span>
            <strong>${value}</strong>
        </div>
    `;
}

function formatNumber(value) {
    const number = parseFloat(value);
    if (Number.isNaN(number)) return '-';
    return number.toLocaleString();
}

function formatDecimal(value, digits = 2) {
    const number = parseFloat(value);
    if (Number.isNaN(number)) return '-';
    return number.toFixed(digits);
}