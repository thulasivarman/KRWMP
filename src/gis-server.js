require('dotenv').config();

const fs = require('fs');
const path = require('path');
const fastify = require('fastify')({ logger: true });
const pool = require('../config/database');

const isLocalRequest = request => String(request.ip || '').startsWith('127.0.0.1');

function getCorsOrigin(requestOrigin) {
  const configured = String(process.env.GIS_CORS_ORIGIN || '*').trim();
  if (!requestOrigin || !configured) return '';
  if (configured === '*') return '*';
  const allowedOrigins = configured.split(',').map(value => value.trim()).filter(Boolean);
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : '';
}

fastify.addHook('onRequest', (request, reply, done) => {
  const origin = getCorsOrigin(request.headers.origin);
  if (origin) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Vary', 'Origin');
    reply.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    reply.header('Access-Control-Allow-Headers', request.headers['access-control-request-headers'] || 'Content-Type,Authorization');
  }
  if (request.method === 'OPTIONS') {
    reply.code(204).send();
    return;
  }
  done();
});

fastify.register(require('@fastify/compress'), { global: true });
fastify.register(require('@fastify/rate-limit'), {
  global: true,
  max: Number(process.env.GIS_RATE_LIMIT_MAX || process.env.RATE_LIMIT_MAX || 600),
  timeWindow: process.env.GIS_RATE_LIMIT_WINDOW || process.env.RATE_LIMIT_WINDOW || '1 minute',
  allowList: isLocalRequest,
  errorResponseBuilder: () => ({ success: false, message: 'Too many map requests. Please try again shortly.' })
});

function registerStaticIfPresent(root, prefix) {
  if (!fs.existsSync(root)) return;
  fastify.register(require('@fastify/static'), {
    root,
    prefix,
    decorateReply: false,
    setHeaders: response => {
      response.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    }
  });
}

registerStaticIfPresent(path.join(__dirname, '../public/data/raster-tiles'), '/data/raster-tiles/');
registerStaticIfPresent(path.join(__dirname, '../public/data/raster-previews'), '/data/raster-previews/');
registerStaticIfPresent(path.join(__dirname, '../public/data/raster-layers'), '/data/raster-layers/');
registerStaticIfPresent(path.join(__dirname, '../public/data/raster-clipped'), '/data/raster-clipped/');

fastify.register(require('./routes/gis-spatial.routes'), { prefix: '/api' });
fastify.register(require('./routes/layers.routes'), { prefix: '/api' });
fastify.register(require('./routes/vector-tile.routes'), { prefix: '/api' });
fastify.register(require('./routes/raster-tile.routes'), { prefix: '/api' });
fastify.register(require('./routes/gis-raster-layer.routes'), { prefix: '/api' });
fastify.register(require('./routes/gis-pollution-pressure.routes'), { prefix: '/api' });
fastify.register(require('./routes/gis-map-data.routes'), { prefix: '/api' });

fastify.get('/healthz', async () => ({ success: true, service: 'krwmp-gis' }));

fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(error.statusCode || 500).send({ success: false, message: error.message || 'GIS server error' });
});

fastify.setNotFoundHandler((request, reply) => {
  reply.status(404).send({ success: false, message: 'GIS endpoint not found' });
});

fastify.addHook('onClose', async () => { await pool.end(); });

const start = async () => {
  try {
    const port = process.env.GIS_PORT || process.env.PORT || 8080;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`KRWMP GIS service running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
