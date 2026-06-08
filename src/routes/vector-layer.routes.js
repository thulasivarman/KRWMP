const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../public/data/layers-config.json');
const VECTOR_LAYER_DIR = path.join(__dirname, '../../public/data/vector-layers');

function ensureStorage() {
  if (!fs.existsSync(VECTOR_LAYER_DIR)) {
    fs.mkdirSync(VECTOR_LAYER_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_PATH)) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ layers: [] }, null, 2));
  }
}

function readConfig() {
  ensureStorage();

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      layers: Array.isArray(config.layers) ? config.layers : [],
    };
  } catch (error) {
    return { layers: [] };
  }
}

function writeConfig(config) {
  ensureStorage();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ layers: config.layers || [] }, null, 2));
}

function sanitizeLayerId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeBoolean(value, fallback = false) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return fallback;
}

function normalizeStyle(input = {}) {
  return {
    color: input.color || '#3388ff',
    weight: normalizeNumber(input.weight, 2),
    opacity: normalizeNumber(input.opacity, 1),
    fillColor: input.fillColor || input.color || '#3388ff',
    fillOpacity: normalizeNumber(input.fillOpacity, 0.2),
    radius: normalizeNumber(input.radius, 6),
  };
}

function detectGeometryType(geojson) {
  if (!geojson) return 'Unknown';

  if (geojson.type === 'Feature' && geojson.geometry) {
    return geojson.geometry.type || 'Unknown';
  }

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    const feature = geojson.features.find(item => item && item.geometry);
    return feature?.geometry?.type || 'Unknown';
  }

  if (geojson.type && /Point|LineString|Polygon|MultiPoint|MultiLineString|MultiPolygon|GeometryCollection/.test(geojson.type)) {
    return geojson.type;
  }

  return 'Unknown';
}

function buildPopupFields(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

async function vectorLayerRoutes(fastify) {
  fastify.get('/vector-layers', async () => {
    const config = readConfig();

    return {
      success: true,
      layers: config.layers,
    };
  });

  fastify.post('/vector-layers/upload', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({
        success: false,
        message: 'No file uploaded',
      });
    }

    const buffer = await data.toBuffer();
    let geojson;

    try {
      geojson = JSON.parse(buffer.toString());
    } catch (err) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid GeoJSON',
      });
    }

    if (!geojson.type) {
      return reply.status(400).send({
        success: false,
        message: 'Invalid GeoJSON structure',
      });
    }

    const formFields = data.fields || {};
    const getField = fieldName => formFields[fieldName]?.value;

    const rawName = getField('name') || data.filename || 'Untitled Layer';
    const requestedId = getField('id');
    const layerId = sanitizeLayerId(requestedId || rawName.replace(/\.geojson$|\.json$/i, '')) || Date.now().toString();

    const fileName = `${layerId}.geojson`;
    const savePath = path.join(VECTOR_LAYER_DIR, fileName);

    fs.writeFileSync(savePath, JSON.stringify(geojson, null, 2));

    const config = readConfig();
    const existingIndex = config.layers.findIndex(layer => layer.id === layerId);

    const layerEntry = {
      id: layerId,
      name: rawName,
      url: `/data/vector-layers/${fileName}`,
      geometryType: detectGeometryType(geojson),
      visible: normalizeBoolean(getField('visible'), true),
      popupFields: buildPopupFields(getField('popupFields')),
      style: normalizeStyle({
        color: getField('color'),
        weight: getField('weight'),
        opacity: getField('opacity'),
        fillColor: getField('fillColor'),
        fillOpacity: getField('fillOpacity'),
        radius: getField('radius'),
      }),
      updatedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      config.layers[existingIndex] = {
        ...config.layers[existingIndex],
        ...layerEntry,
      };
    } else {
      config.layers.push(layerEntry);
    }

    writeConfig(config);

    return {
      success: true,
      message: 'Layer uploaded successfully',
      layer: layerEntry,
    };
  });

  fastify.put('/vector-layers/:id/style', async (request, reply) => {
    const layerId = sanitizeLayerId(request.params.id);
    const config = readConfig();
    const layer = config.layers.find(item => item.id === layerId);

    if (!layer) {
      return reply.status(404).send({
        success: false,
        message: 'Layer not found',
      });
    }

    const body = request.body || {};
    const styleInput = {
      ...(layer.style || {}),
      ...(body.style || {}),
      color: body.color || body.style?.color || layer.style?.color,
      weight: body.weight ?? body.style?.weight ?? layer.style?.weight,
      opacity: body.opacity ?? body.style?.opacity ?? layer.style?.opacity,
      fillColor: body.fillColor || body.style?.fillColor || layer.style?.fillColor,
      fillOpacity: body.fillOpacity ?? body.style?.fillOpacity ?? layer.style?.fillOpacity,
      radius: body.radius ?? body.style?.radius ?? layer.style?.radius,
    };

    layer.name = body.name || layer.name;
    layer.visible = normalizeBoolean(body.visible, layer.visible);
    layer.popupFields = Array.isArray(body.popupFields) ? body.popupFields : layer.popupFields || [];
    layer.style = normalizeStyle(styleInput);
    layer.updatedAt = new Date().toISOString();

    writeConfig(config);

    return {
      success: true,
      message: 'Layer symbol updated successfully',
      layer,
    };
  });

  fastify.delete('/vector-layers/:id', async (request, reply) => {
    const layerId = sanitizeLayerId(request.params.id);
    const config = readConfig();
    const layerIndex = config.layers.findIndex(item => item.id === layerId);

    if (layerIndex < 0) {
      return reply.status(404).send({
        success: false,
        message: 'Layer not found',
      });
    }

    const [layer] = config.layers.splice(layerIndex, 1);
    const fileName = path.basename(layer.url || `${layerId}.geojson`);
    const filePath = path.join(VECTOR_LAYER_DIR, fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    writeConfig(config);

    return {
      success: true,
      message: 'Layer deleted successfully',
      deleted: layerId,
    };
  });
}

module.exports = vectorLayerRoutes;
