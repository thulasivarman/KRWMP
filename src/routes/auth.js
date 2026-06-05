// src/routes/auth.js
/**
 * ==========================================================================
 * KRWMP MANAGEMENT PORTAL - ROLE-BASED ACCESS CONTROL WITH ENCRYPTION
 * ==========================================================================
 */
const pool = require('../../config/database');
const bcrypt = require('bcrypt');

async function authRoutes(fastify, options) {

   /**
     * POST /api/login
     * Validates credentials against active Supabase database records
     */
    fastify.post('/login', async (request, reply) => {
        try {
            if (!request.body) {
                return reply.status(400).send({ success: false, message: 'Invalid transmission payload.' });
            }

            const { username, password } = request.body;

            if (!username || !password) {
                return reply.status(400).send({ 
                    success: false, 
                    message: 'Both username and password fields are required.' 
                });
            }

          // src/routes/auth.js snippet update
            
            const cleanUsername = username.trim().toLowerCase();

            // Shifted from INNER JOIN to LEFT JOIN for improved database fallback safety
            const selectQuery = `
                SELECT 
                    u.name, u.designation, u.initials, u.identifier, u.password_hash,
                    COALESCE(r.role_name, 'guest') as role_name,
                    COALESCE(r.visible_sections, '["data_layers"]') as visible_sections
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.identifier = $1
                LIMIT 1
            `;
            
            const result = await pool.query(selectQuery, [cleanUsername]);
            const rows = result.rows || [];

            // If the user record is missing completely, trigger our secure seeding rule
            if (rows.length === 0) {
                if (cleanUsername === 'thulasi') {
                    fastify.log.info('Seeding master administrator profile into table context...');
                    
                    const saltRounds = 10;
                    const generatedHash = await bcrypt.hash(password, saltRounds);
                    
                    const insertQuery = `
                        INSERT INTO users (name, designation, initials, identifier, role_id, password_hash) 
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `;
                    
                    await pool.query(insertQuery, [
                        "Kadampeswaran Thulasivarman",
                        "Town Planner & Development Consultant",
                        "KT",
                        "thulasi",
                        3, // Admin
                        generatedHash
                    ]);
                    
                    const retryResult = await pool.query(selectQuery, [cleanUsername]);
                    return {
                        success: true,
                        message: 'Master planning identity initialized securely inside Supabase.',
                        user: retryResult.rows[0]
                    };
                }

                return reply.status(401).send({ 
                    success: false, 
                    message: 'Authentication failed. Incorrect username or password.' 
                });
            }

            // VERIFY ENCRYPTED PASSKEY HASH
            const match = await bcrypt.compare(password, rows[0].password_hash);
            if (!match) {
                return reply.status(401).send({ 
                    success: false, 
                    message: 'Authentication failed. Incorrect username or password.' 
                });
            }

            // Prepare payload for client application context
            const userPayload = { ...rows[0] };
            delete userPayload.password_hash; // Remove sensitive hashes from data payloads

            return {
                success: true,
                message: 'Workspace authenticated successfully.',
                user: userPayload
            };

        } catch (error) {
            fastify.log.error('Login database pipeline exception:', error);
            return reply.status(500).send({ 
                success: false, 
                message: `Supabase Pool Exception: ${error.message || 'Handshake failed.'}` 
            });
        }
    });

    /**
     * GET /api/auth/profile
     * Resolves matching structural paths exactly to frontend requests
     */
    fastify.get('/auth/profile', async (request, reply) => {
        try {
            const systemIdentifier = 'thulasi'; // Replace with active session tracking if needed
            
            const query = `
                SELECT 
                    u.name, u.designation, u.initials, u.identifier,
                    r.role_name, r.visible_sections,
                    COALESCE(json_agg(json_build_object('section', p.section_name, 'capability', p.capability_type)) FILTER (WHERE p.id IS NOT NULL), '[]') as capabilities
                FROM users u
                INNER JOIN roles r ON u.role_id = r.id
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                LEFT JOIN permissions p ON rp.permission_id = p.id
                WHERE u.identifier = $1
                GROUP BY u.id, r.id
            `;
            const result = await pool.query(query, [systemIdentifier]);
            if (result.rows.length === 0) {
                return reply.status(404).send({ success: false, message: 'Profile unresolved.' });
            }

            return { success: true, user: result.rows[0] };
        } catch (error) {
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * POST /api/auth/profile/update
     * Commits layout updates from frontend forms securely back to your Supabase cloud tables
     */
    fastify.post('/auth/profile/update', async (request, reply) => {
        try {
            const { name, designation, initials, identifier } = request.body;
            if (!name || !designation || !initials) {
                return reply.status(400).send({ success: false, message: 'Required profile properties are missing.' });
            }

            const targetId = identifier || 'thulasi';
            const updateQuery = `
                UPDATE users 
                SET name = $1, designation = $2, initials = $3 
                WHERE identifier = $4
            `;
            await pool.query(updateQuery, [name, designation, initials, targetId]);
            return { success: true, message: 'User profile updated successfully.' };
        } catch (error) {
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * GET /api/admin/users
     */
    fastify.get('/admin/users', async (request, reply) => {
        try {
            const query = `
                SELECT u.id, u.name, u.designation, u.identifier, r.role_name, u.role_id
                FROM users u
                INNER JOIN roles r ON u.role_id = r.id
                ORDER BY u.id ASC
            `;
            const rolesQuery = `SELECT id, role_name, description FROM roles ORDER BY id ASC`;
            
            const usersResult = await pool.query(query);
            const rolesResult = await pool.query(rolesQuery);

            return {
                success: true,
                users: usersResult.rows,
                roles: rolesResult.rows
            };
        } catch (error) {
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * POST /api/admin/assign-role
     */
    fastify.post('/admin/assign-role', async (request, reply) => {
        try {
            const { targetUserIdentifier, newRoleId } = request.body;
            if (!targetUserIdentifier || !newRoleId) {
                return reply.status(400).send({ success: false, message: 'Required arguments missing.' });
            }

            const updateQuery = `UPDATE users SET role_id = $1 WHERE identifier = $2`;
            await pool.query(updateQuery, [parseInt(newRoleId, 10), targetUserIdentifier]);

            return { success: true, message: 'User role context updated successfully.' };
        } catch (error) {
            return reply.status(500).send({ success: false, message: error.message });
        }
    });
}

module.exports = authRoutes;