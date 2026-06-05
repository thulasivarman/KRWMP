// config/database.js
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error("❌ Critical configuration missing: DATABASE_URL is not defined in your environment variables.");
}

/**
 * KRWMP PLATFORM - CENTRALIZED POSTGRESQL POOL CONTROLLER
 * Hardened for Supabase transaction pooler stability across remote clouds.
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        // Enforces SSL encryption layers to fulfill Supabase cloud validation constraints
        rejectUnauthorized: false 
    },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

module.exports = pool;