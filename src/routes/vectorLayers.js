const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'thulasivarman';
const GITHUB_REPO = process.env.GITHUB_REPO || 'KRWMP';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_LAYER_DIR = process.env.GITHUB_LAYER_DIR || 'public/data/vector-layers';
const GITHUB_CONFIG_PATH = process.env.GITHUB_CONFIG_PATH || 'public/data/layers-config.json';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Admin access required.' });
}

function safeLayerId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseGeoJson(buffer) {
  const text = buffer.toString('utf8');
  const geojson = JSON.parse(text);

  if (!geojson || !['FeatureCollection', 'Feature'].includes(geojson.type)) {
    throw new Error('Only GeoJSON FeatureCollection or Feature files are allowed.');
  }

  return geojson;
}

function detectGeometryType(geojson) {
  if (geojson.type === 'Feature') return geojson.geometry ? geojson.geometry.type : 'Unknown';
  const feature = Array.isArray(geojson.features) ? geojson.features.find(f => f && f.geometry) : null;
  return feature && feature.geometry ? feature.geometry.type : 'Unknown';
}

async function getGithubFile(path) {
  try {
    const { data } = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path,
      ref: GITHUB_BRANCH,
    });

    if (Array.isArray(data)) return null;
    const content = Buffer.from(data.content || '', 'base64').toString('utf8');
    return { sha: data.sha, content };
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function getLayerConfig() {
  const file = await getGithubFile(GITHUB_CONFIG_PATH);
  if (!file) return { sha: null, layers: [] };

  const parsed = JSON.parse(file.content || '{}');
  const layers = Array.isArray(parsed) ? parsed : parsed.layers || [];
  return { sha: file.sha, layers };
}

async function saveGithubFile(path, content, message, sha = null) {
  const payload = {
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
  };

  if (sha) payload.sha = sha;
  const { data } = await octokit.repos.createOrUpdateFileContents(payload);
  return data;
}

async function deleteGithubFile(path, message) {
  const file = await getGithubFile(path);
  if (!file) return false;

  await octokit.repos.deleteFile({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    message,
    sha: file.sha,
    branch: GITHUB_BRANCH,
  });

  return true;
}

function normalizeStyle(input = {}) {
  return {
    color: input.color || '#3388ff',
    weight: Number(input.weight || 2),
    opacity: Number(input.opacity ?? 1),
    fillColor: input.fillColor || input.color || '#3388ff',
    fillOpacity: Number(input.fillOpacity ?? 0.2),
    radius: Number(input.radius || 6),
  };
}

router.get('/vector-layers', requireAdmin, async (req, res) => {
  try {
    const { layers } = await getLayerConfig();
    res.json({ success: true, layers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/vector-layers/upload', requireAdmin, upload.single('geojson'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'GeoJSON file is required.' });

    const layerName = req.body.name || req.file.originalname.replace(/\.geojson$|\.json$/i, '');
    const layerId = safeLayerId(req.body.id || layerName);
    if (!layerId) return res.status(400).json({ success: false, message: 'Invalid layer id.' });

    const geojson = parseGeoJson(req.file.buffer);
    const geometryType = detectGeometryType(geojson);
    const layerPath = `${GITHUB_LAYER_DIR}/${layerId}.geojson`;

    const existingLayerFile = await getGithubFile(layerPath);
    await saveGithubFile(
      layerPath,
      JSON.stringify(geojson, null, 2),
      existingLayerFile ? `Update vector layer ${layerId}` : `Add vector layer ${layerId}`,
      existingLayerFile ? existingLayerFile.sha : null
    );

    const config = await getLayerConfig();
    const style = normalizeStyle({
      color: req.body.color,
      weight: req.body.weight,
      opacity: req.body.opacity,
      fillColor: req.body.fillColor,
      fillOpacity: req.body.fillOpacity,
      radius: req.body.radius,
    });

    const newEntry = {
      id: layerId,
      name: layerName,
      type: 'geojson',
      geometryType,
      url: `/data/vector-layers/${layerId}.geojson`,
      style,
      visible: req.body.visible === 'true' || req.body.visible === true,
      popupFields: req.body.popupFields ? String(req.body.popupFields).split(',').map(v => v.trim()).filter(Boolean) : [],
      updatedAt: new Date().toISOString(),
    };

    const index = config.layers.findIndex(layer => layer.id === layerId);
    if (index >= 0) config.layers[index] = { ...config.layers[index], ...newEntry };
    else config.layers.push(newEntry);

    await saveGithubFile(
      GITHUB_CONFIG_PATH,
      JSON.stringify({ layers: config.layers }, null, 2),
      `Update layer config for ${layerId}`,
      config.sha
    );

    res.json({ success: true, layer: newEntry });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/vector-layers/:id/style', requireAdmin, async (req, res) => {
  try {
    const layerId = safeLayerId(req.params.id);
    const config = await getLayerConfig();
    const layer = config.layers.find(item => item.id === layerId);

    if (!layer) return res.status(404).json({ success: false, message: 'Layer not found.' });

    layer.name = req.body.name || layer.name;
    layer.style = normalizeStyle({ ...layer.style, ...req.body.style, ...req.body });
    layer.visible = typeof req.body.visible === 'boolean' ? req.body.visible : layer.visible;
    layer.popupFields = Array.isArray(req.body.popupFields) ? req.body.popupFields : layer.popupFields || [];
    layer.updatedAt = new Date().toISOString();

    await saveGithubFile(
      GITHUB_CONFIG_PATH,
      JSON.stringify({ layers: config.layers }, null, 2),
      `Update symbol for ${layerId}`,
      config.sha
    );

    res.json({ success: true, layer });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/vector-layers/:id', requireAdmin, async (req, res) => {
  try {
    const layerId = safeLayerId(req.params.id);
    const config = await getLayerConfig();
    const layer = config.layers.find(item => item.id === layerId);

    if (!layer) return res.status(404).json({ success: false, message: 'Layer not found.' });

    const filePath = `${GITHUB_LAYER_DIR}/${layerId}.geojson`;
    await deleteGithubFile(filePath, `Delete vector layer ${layerId}`);

    const nextLayers = config.layers.filter(item => item.id !== layerId);
    await saveGithubFile(
      GITHUB_CONFIG_PATH,
      JSON.stringify({ layers: nextLayers }, null, 2),
      `Remove ${layerId} from layer config`,
      config.sha
    );

    res.json({ success: true, deleted: layerId });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
