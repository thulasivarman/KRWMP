// config/database.js
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    throw new Error("❌ Critical configuration missing: DATABASE_URL is not defined in your environment variables.");
}

/**
 * KRWMP MANAGEMENT PORTAL - NATIVE POSTGRESQL POOL ENGINE
 * Tailored for direct transactional cloud streaming capabilities.
 */
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for remote cloud database cluster validation
    },
    max: 20, // Increased threshold execution pool threads for large iterations like GND
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

module.exports = pool;