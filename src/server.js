// src/server.js
require('dotenv').config(); // Load environment parameters immediately

const fastify = require('fastify')({ logger: true });
const path = require('path');
const pool = require('../config/database');

// =============================================================
// GLOBAL INTERFACE ERROR BOUNDARY INTERCEPTORS
// =============================================================
fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    
    // Mitigate raw database structural stack trace leaks to client logs
    if (error.code && error.code.startsWith('23')) {
        return reply.status(409).send({
            success: false,
            message: 'A database relational integrity constraint violation occurred.'
        });
    }
    
    reply.status(error.statusCode || 500).send({
        success: false,
        message: error.message || 'An unhandled server exception occurred.'
    });
});

// =============================================================
// STATIC ASSETS & SECURITY ROUTE REGISTRIES
// =============================================================

// Enable serving static frontend interface assets from 'public'
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, '../public'),
    prefix: '/', 
});

// Register Authentication Route Grouping under /api namespace prefix
fastify.register(require('./routes/auth'), { prefix: '/api' });

// =============================================================
// LIFECYCLE EVENT TRAPS & CLEANUP PIPELINES
// =============================================================

// Graceful Connection Pool Thread Release on Server Shutdown
fastify.addHook('onClose', async (instance) => {
    try {
        await pool.end();
        instance.log.info('🐘 Supabase PostgreSQL connection pool threads released cleanly.');
    } catch (err) {
        instance.log.error('Error closing database connection pool:', err);
    }
});

// SPA Deep-Linking Fail-Safe: Redirects missing endpoints back to map view canvas
fastify.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
        return reply.status(404).send({ success: false, message: 'API Endpoint Unresolved.' });
    }
    reply.sendFile('map.html'); // Ensures multi-page layouts reload flawlessly
});

// =============================================================
// HIGH-PERFORMANCE ENGINE RUNTIME LAUNCHER
// =============================================================
const start = async () => {
    try {
        const port = process.env.PORT || 8080;
        await fastify.listen({ port: port, host: '0.0.0.0' });
        console.log(`\n🚀 KRWMP Portal Engine operational at http://localhost:${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();