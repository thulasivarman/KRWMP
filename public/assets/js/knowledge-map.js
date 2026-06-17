(() => {
  const SOURCE_ID = 'knowledge-resources-source';
  const LAYER_ID = 'knowledge-resources-layer';

  async function loadKnowledgeLayer() {
    const map = window.KRWMP_MAP || window.map;
    if (!map || !map.addSource) return;
    if (map.getSource(SOURCE_ID)) return;

    const geojson = await window.KRWMP_UTILS.apiRequest('/api/knowledge.geojson');

    map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
    map.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': '#10b981',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.85
      }
    });

    map.on('click', LAYER_ID, event => {
      const feature = event.features && event.features[0];
      if (!feature) return;
      const p = feature.properties || {};
      const url = p.file_url || p.video_url || p.external_url || `/knowledge.html`;
      const esc = window.KRWMP_UTILS.escapeHtml;
      const html = `<div class="text-slate-900"><strong>${esc(p.title || 'Knowledge Resource')}</strong><br><span>${esc(p.content_type || '')}</span><br><span>${esc(p.category_name || '')}</span><br><a href="${esc(url)}" target="_blank">Open resource</a></div>`;
      new maplibregl.Popup().setLngLat(event.lngLat).setHTML(html).addTo(map);
    });

    map.on('mouseenter', LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', LAYER_ID, () => { map.getCanvas().style.cursor = ''; });
  }

  window.KRWMP_KNOWLEDGE_MAP = { loadKnowledgeLayer };
  document.addEventListener('krwmp:map-ready', loadKnowledgeLayer);
  window.addEventListener('load', () => setTimeout(loadKnowledgeLayer, 1500));
})();
