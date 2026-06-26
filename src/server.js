require('dotenv').config();

const path = require('path');
const fastify = require('fastify')({ logger: true });
const pool = require('../config/database');

const isLocalRequest = request => String(request.ip || '').startsWith('127.0.0.1');

fastify.register(require('@fastify/static'), { root: path.join(__dirname, '../public'), prefix: '/' });
fastify.register(require('@fastify/compress'), { global: true });
fastify.register(require('@fastify/rate-limit'), {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  allowList: isLocalRequest,
  errorResponseBuilder: () => ({ success: false, message: 'Too many requests. Please try again shortly.' })
});
fastify.register(require('@fastify/multipart'), { limits: { fileSize: Number(process.env.MAX_LAYER_UPLOAD_SIZE || process.env.MAX_RASTER_UPLOAD_SIZE || 250 * 1024 * 1024), files: 1 } });

fastify.register(require('./routes/auth.routes'), { prefix: '/api' });
fastify.register(require('./routes/me.routes'), { prefix: '/api' });
fastify.register(require('./routes/admin.routes'), { prefix: '/api' });
fastify.register(require('./routes/privileges.routes'), { prefix: '/api' });
fastify.register(require('./routes/spatial.routes'), { prefix: '/api' });
fastify.register(require('./routes/layers.routes'), { prefix: '/api' });
fastify.register(require('./routes/vector-layer.routes'), { prefix: '/api' });
fastify.register(require('./routes/raster-layer.routes'), { prefix: '/api' });
fastify.register(require('./routes/community-issues.routes'), { prefix: '/api' });
fastify.register(require('./routes/vwmc.routes'), { prefix: '/api' });
fastify.register(require('./routes/intervention.routes'), { prefix: '/api' });
fastify.register(require('./routes/event-chain.routes'), { prefix: '/api' });
fastify.register(require('./routes/institution.routes'), { prefix: '/api' });
fastify.register(require('./routes/reports.routes'), { prefix: '/api' });
fastify.register(require('./routes/home-summary.routes'), { prefix: '/api' });
fastify.register(require('./routes/community-issue-interventions.routes'), { prefix: '/api' });
fastify.register(require('./routes/water-quality.routes'), { prefix: '/api' });
fastify.register(require('./routes/pollution-source.routes'), { prefix: '/api' });
fastify.register(require('./routes/volunteer-organisation.routes'), { prefix: '/api' });
fastify.register(require('./routes/knowledge.routes'), { prefix: '/api' });
fastify.register(require('./routes/file-attachment.routes'), { prefix: '/api' });
fastify.register(require('./routes/person.routes'), { prefix: '/api' });
require('./middleware/audit.middleware')(fastify);

fastify.setErrorHandler((error, request, reply) => { fastify.log.error(error); reply.status(error.statusCode || 500).send({ success: false, message: error.message || 'Server error' }); });
fastify.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith('/api/')) {
    return reply.status(404).send({ success: false, message: 'API endpoint not found' });
  }

  return reply.status(404).sendFile('404.html');
});
fastify.addHook('onClose', async () => { await pool.end(); });

const start = async () => {
  try { const port = process.env.PORT || 8080; await fastify.listen({ port, host: '0.0.0.0' }); console.log(`KRWMP Portal running on port ${port}`); }
  catch (err) { fastify.log.error(err); process.exit(1); }
};
start();
