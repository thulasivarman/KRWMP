const { Octokit } = require('@octokit/rest');

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'thulasivarman';
const GITHUB_REPO = process.env.GITHUB_REPO || 'KRWMP';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_LAYER_DIR = process.env.GITHUB_LAYER_DIR || 'public/data/vector-layers';
const GITHUB_CONFIG_PATH = process.env.GITHUB_CONFIG_PATH || 'public/data/layers-config.json';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function vectorLayerRoutes(fastify) {
  fastify.get('/vector-layers', async (request, reply) => {
    return { success: true, message: 'Vector layer route working', layers: [] };
  });
}

module.exports = vectorLayerRoutes;