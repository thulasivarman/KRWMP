const { Pool } = require('pg');
require('dotenv').config();

// Direct fallback configuration to pooler infrastructure
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Bypasses self-signed certificate constraints locally
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

module.exports = pool;