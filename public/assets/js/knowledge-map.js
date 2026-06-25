(() => {
  const SOURCE_ID = 'knowledge-resources-source';
  const LAYER_ID = 'knowledge-resources-layer';

  async function loadKnowledgeLayer() {
    // Disabled by default on map.html.
    // Knowledge points must be managed through the database-driven Vector Layer Matrix
    // to keep layer visibility behaviour consistent with other GIS layers.
    return;
  }

  function removeKnowledgeLayer() {
    const map = window.KRWMP_MAP || window.map;
    if (!map || !map.getLayer) return;
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
  }

  window.KRWMP_KNOWLEDGE_MAP = { loadKnowledgeLayer, removeKnowledgeLayer };
})();
