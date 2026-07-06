window.initializeWaterQualityLayer = function () {
  if (!window.KRWMP_MAP) return;
  const sourceId = 'water-quality-source';
  const layerId = 'water-quality-latest-points';
  if (!window.KRWMP_MAP.getSource(sourceId)) {
    window.KRWMP_MAP.addSource(sourceId, { type: 'geojson', data: window.KRWMP_UTILS.withGisApiBase('/api/water-quality/latest.geojson') });
  }
  if (!window.KRWMP_MAP.getLayer(layerId)) {
    window.KRWMP_MAP.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 8,
        'circle-color': ['match', ['get', 'overall_status'], 'compliant', '#22c55e', 'caution', '#f59e0b', 'non_compliant', '#ef4444', '#94a3b8'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.9
      },
      layout: { visibility: 'visible' }
    });
    window.KRWMP_MAP.on('click', layerId, event => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const p = feature.properties || {};
      const html = `<div style="font-family:Arial;min-width:230px"><strong>${escapeWqHtml(p.sample_code || 'Water quality sample')}</strong><br><small>${escapeWqHtml(p.overall_status || '')} · ${escapeWqHtml(p.sample_collection_datetime || '')}</small><p>${escapeWqHtml(p.sample_location_name || '')}<br>Collected by: ${escapeWqHtml(p.collected_by || '-')}</p>${p.signed_report_pdf_url ? `<a href="${escapeWqHtml(p.signed_report_pdf_url)}" target="_blank">View signed PDF</a>` : ''}</div>`;
      new maplibregl.Popup().setLngLat(event.lngLat).setHTML(html).addTo(window.KRWMP_MAP);
    });
    window.KRWMP_MAP.on('mouseenter', layerId, () => { window.KRWMP_MAP.getCanvas().style.cursor = 'pointer'; });
    window.KRWMP_MAP.on('mouseleave', layerId, () => { window.KRWMP_MAP.getCanvas().style.cursor = ''; });
  }
};
function escapeWqHtml(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
