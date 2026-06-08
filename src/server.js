require('dotenv').config();

const path = require('path');
const fastify = require('fastify')({ logger: true });
const pool = require('../config/database');

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/',
});

fastify.register(require('@fastify/compress'), {
  global: true,
});

fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: Number(process.env.MAX_GEOJSON_UPLOAD_SIZE || 75 * 1024 * 1024),
    files: 1,
  },
});

// API routes
fastify.register(require('./routes/auth.routes'), { prefix: '/api' });
fastify.register(require('./routes/admin.routes'), { prefix: '/api' });
fastify.register(require('./routes/spatial.routes'), { prefix: '/api' });
fastify.register(require('./routes/layers.routes'), { prefix: '/api' });
fastify.register(require('./routes/vector-layer.routes'), { prefix: '/api' });

fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(error.statusCode || 500).send({
    success: false,
    message: error.message || 'Server error',
  });
});

fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.status(404).send({
      success: false,
      message: 'API endpoint not found',
    });
  }

  return reply.sendFile('map.html');
});

fastify.addHook('onClose', async () => {
  await pool.end();
});

const start = async () => {
  try {
    const port = process.env.PORT || 8080;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`KRWMP Portal running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
