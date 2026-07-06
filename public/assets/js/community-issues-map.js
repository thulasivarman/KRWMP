window.initializeCommunityIssueLayer = function () {
  if (!window.KRWMP_MAP) return;
  const sourceId = 'community-issues-source';
  const layerId = 'community-issues-points';

  if (!window.KRWMP_MAP.getSource(sourceId)) {
    window.KRWMP_MAP.addSource(sourceId, { type: 'geojson', data: window.KRWMP_UTILS.withGisApiBase('/api/community-reports.geojson') });
  }

  if (!window.KRWMP_MAP.getLayer(layerId)) {
    window.KRWMP_MAP.addLayer({
      id: layerId,
      type: 'circle',
      source: sourceId,
      paint: {
        'circle-radius': 7,
        'circle-color': ['match', ['get', 'severity_level'], 'high', '#ef4444', 'medium', '#f59e0b', 'low', '#22c55e', '#38bdf8'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.9
      },
      layout: { visibility: 'visible' }
    });

    window.KRWMP_MAP.on('click', layerId, (event) => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const p = feature.properties || {};
      const html = `<div style="font-family:Arial;min-width:220px"><strong>${escapeCommunityHtml(p.issue_title || 'Community issue')}</strong><br><small>${escapeCommunityHtml(p.report_code || '')} · ${escapeCommunityHtml(p.status || '')}</small><p>${escapeCommunityHtml(p.description || '')}</p>${p.photo_url ? `<a href="${escapeCommunityHtml(p.photo_url)}" target="_blank">View photo</a>` : ''}</div>`;
      new maplibregl.Popup().setLngLat(event.lngLat).setHTML(html).addTo(window.KRWMP_MAP);
    });

    window.KRWMP_MAP.on('mouseenter', layerId, () => { window.KRWMP_MAP.getCanvas().style.cursor = 'pointer'; });
    window.KRWMP_MAP.on('mouseleave', layerId, () => { window.KRWMP_MAP.getCanvas().style.cursor = ''; });
  }
};

function escapeCommunityHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
