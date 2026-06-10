/**
 * KRWMP Popup Manager
 * Handles map feature popups and cursor interaction.
 */

window.attachInteractivePopupHandshake = function (layerFillId, boundaryTypeKey) {
    window.KRWMP_MAP.on('click', layerFillId, (e) => {
        if (!e.features || !e.features.length) return;
        const props = e.features[0].properties || {};
        const popupData = buildPopupData(boundaryTypeKey, props);
        new maplibregl.Popup({ className: 'krwmp-parcel-popup', closeButton: true, closeOnClick: true, offset: 16 })
            .setLngLat(e.lngLat)
            .setHTML(`<div class="krwmp-glass-popup"><div class="krwmp-glass-header"><div class="krwmp-glass-title">${popupData.title}</div><div class="krwmp-glass-subtitle">${popupData.subtitle}</div></div><div class="krwmp-status-badge"><span class="krwmp-status-dot"></span>${popupData.badge || 'ACTIVE LAYER'}</div><div class="krwmp-attribute-table">${popupData.rows}</div></div>`)
            .addTo(window.KRWMP_MAP);
    });
    window.KRWMP_MAP.on('mouseenter', layerFillId, () => { window.KRWMP_MAP.getCanvas().style.cursor = 'pointer'; });
    window.KRWMP_MAP.on('mouseleave', layerFillId, () => { window.KRWMP_MAP.getCanvas().style.cursor = ''; });
};

function buildPopupData(type, props) {
    if (type === 'basin') return { title: props.wshd_name || 'Kelani River Catchment', subtitle: 'Watershed Boundary', rows: `${popupRow('Watershed No', props.washd_no || '-')}${popupRow('Area (ha)', formatNumber(props.hectares))}${popupRow('Area (km²)', formatDecimal(props.area_sqkm, 2))}` };
    if (type === 'dsd') return { title: `${props.dsd_n || 'Unknown'} DSD`, subtitle: 'Divisional Secretariat Division', rows: `${popupRow('DSD Code', props.iddsd || '-')}${popupRow('District ID', props.iddistrict || '-')}` };
    if (type === 'gnd') return { title: `${props.gnd_name || 'Unknown'} GND Division`, subtitle: 'Grama Niladhari Division', rows: `${popupRow('Local Authority', props.la || 'N/A')}${popupRow('GND Code', props.idgnd || '-')}${popupRow('Area (ha)', formatDecimal(props.area_ha, 2))}` };
    if (type === 'community_complaints') return { title: escapePopup(props.issue_title || 'Community Complaint'), subtitle: `${escapePopup(props.category_name || 'Public Issue')} · ${escapePopup(props.report_code || '-')}`, badge: `${String(props.severity_level || 'medium').toUpperCase()} SEVERITY`, rows: `${popupRow('Status', escapePopup(props.status || '-'))}${popupRow('Severity', escapePopup(props.severity_level || '-'))}${popupRow('Description', escapePopup(props.description || '-'))}${popupRow('Submitted', formatDate(props.submitted_at))}${props.photo_url ? popupRow('Photo Evidence', `<a href="${escapePopup(props.photo_url)}" target="_blank" style="color:#34d399;font-weight:700">Open Photo</a>`) : ''}` };
    if (type === 'vwmc_locations') return { title: escapePopup(props.committee_name || 'VWMC Location'), subtitle: `${escapePopup(props.village_name || 'Village')} · ${escapePopup(props.committee_code || '-')}`, badge: 'VWMC LOCATION', rows: `${popupRow('Status', escapePopup(props.status || '-'))}${popupRow('GND', escapePopup(props.gnd_name || '-'))}${popupRow('DSD', escapePopup(props.dsd_name || '-'))}${popupRow('Address', escapePopup(props.address || '-'))}${popupRow('Members', escapePopup(props.member_count || 0))}${popupRow('Updated By', escapePopup(props.updated_by || '-'))}${popupRow('Updated At', formatDate(props.updated_at))}` };
    return { title: 'Spatial Feature', subtitle: 'GIS Layer', rows: popupRow('Feature ID', props.id || '-') };
}

function popupRow(label, value) { return `<div class="krwmp-attribute-row"><span>${label}</span><strong>${value}</strong></div>`; }
function escapePopup(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function formatDate(value) { if (!value) return '-'; const date = new Date(value); if (Number.isNaN(date.getTime())) return '-'; return date.toLocaleString(); }
function formatNumber(value) { const number = parseFloat(value); if (Number.isNaN(number)) return '-'; return number.toLocaleString(); }
function formatDecimal(value, digits = 2) { const number = parseFloat(value); if (Number.isNaN(number)) return '-'; return number.toFixed(digits); }
