const fastify = require('fastify')({ logger: true });
const path = require('path');
const pool = require('../config/database');

// Enable serving static frontend interface assets from 'public'
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, '../public'),
    prefix: '/', 
});

// Register Authentication Route Grouping under /api namespace prefix
fastify.register(require('./routes/auth'), { prefix: '/api' });

// Graceful Connection Pool Thread Release on Server Shutdown
fastify.addHook('onClose', async (instance) => {
    await pool.end();
    console.log('Database pool threads released cleanly.');
});

const start = async () => {
    try {
        const port = process.env.PORT || 8080;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`🚀 KRWMP Portal Engine operational at http://localhost:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();