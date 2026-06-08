# Vector Layer Management Module

This module adds an admin interface for managing GeoJSON vector layers through the web application while saving layer files and layer styles to the connected GitHub repository.

## Files Added

- `src/routes/vectorLayers.js` - Express API routes for upload, delete, list, and style update.
- `public/admin-vector-layers.html` - Admin page.
- `public/admin-vector-layers.js` - Admin page client-side logic.
- `public/admin-vector-layers.css` - Admin page styling.
- `public/data/layers-config.json` - Layer configuration file.
- `public/data/vector-layers/` - GeoJSON storage folder.

## Required NPM Packages

Install the required backend packages:

```bash
npm install @octokit/rest multer
```

The project must already have `express`, session/authentication middleware, and static file serving configured.

## Environment Variables

Add the following values to `.env`:

```env
GITHUB_TOKEN=your_github_personal_access_token_or_app_token
GITHUB_OWNER=thulasivarman
GITHUB_REPO=KRWMP
GITHUB_BRANCH=main
GITHUB_LAYER_DIR=public/data/vector-layers
GITHUB_CONFIG_PATH=public/data/layers-config.json
```

The token must have permission to read and write repository contents.

## Express Server Integration

In your `src/server.js` or main Express app file, add:

```js
const path = require('path');
const express = require('express');
const vectorLayerRoutes = require('./routes/vectorLayers');

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api', vectorLayerRoutes);
```

If your server file is not inside `src`, adjust the relative path accordingly.

## Admin Access Control

The API currently expects the authenticated admin user to be available as either:

```js
req.user.role === 'admin'
```

or

```js
req.session.user.role === 'admin'
```

If your application uses a different admin login structure, update the `requireAdmin()` function in `src/routes/vectorLayers.js`.

## Admin URL

After deployment, open:

```text
/admin-vector-layers.html
```

Only logged-in admin users should be allowed to access the API endpoints.

## Map Integration

Your map page should read layers from:

```text
/data/layers-config.json
```

Example Leaflet integration:

```js
async function loadVectorLayers(map) {
  const response = await fetch('/data/layers-config.json');
  const config = await response.json();

  (config.layers || []).forEach(async layer => {
    const geoResponse = await fetch(layer.url);
    const geojson = await geoResponse.json();

    const geoLayer = L.geoJSON(geojson, {
      style: layer.style,
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, layer.style),
      onEachFeature: (feature, leafletLayer) => {
        const fields = layer.popupFields || [];
        const html = fields.length
          ? fields.map(field => `<strong>${field}</strong>: ${feature.properties?.[field] ?? ''}`).join('<br>')
          : Object.entries(feature.properties || {}).map(([key, value]) => `<strong>${key}</strong>: ${value}`).join('<br>');
        leafletLayer.bindPopup(html || layer.name);
      },
    });

    if (layer.visible) geoLayer.addTo(map);
    if (window.layerControl) window.layerControl.addOverlay(geoLayer, layer.name);
  });
}
```

## Important Notes

- Do not expose `GITHUB_TOKEN` in frontend JavaScript.
- Validate GeoJSON size before upload in production.
- Consider creating a staging branch and pull request workflow if you do not want admins writing directly to `main`.
- Deleting a layer removes the GeoJSON file and the layer entry from `layers-config.json`.
