/**
 * ==========================================================================
 * KRWMP MANAGEMENT PORTAL - INTEGRATED AUTHENTICATION & ACCESS CORE
 * ALIGNED SPECIFICALLY WITH LIVE SUPABASE DUMP STRUCTURES
 * ==========================================================================
 */
const pool = require('../../config/database');
const bcrypt = require('bcrypt');

async function authRoutes(fastify, options) {

    /**
     * POST /api/login
     * Validates credentials against your active Supabase database records
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

            const cleanUsername = username.trim().toLowerCase();
            const cleanPassword = password.trim();

            const selectQuery = `
                SELECT 
                    u.id, u.name, u.designation, u.initials, u.identifier, u.password_hash,
                    r.role_name, r.visible_sections,
                    COALESCE(
                        json_agg(
                            json_build_object('section', p.section_name, 'capability', p.capability_type)
                        ) FILTER (WHERE p.id IS NOT NULL), '[]'
                    ) as capabilities
                FROM public.users u
                LEFT JOIN public.roles r ON u.role_id = r.id
                LEFT JOIN public.role_permissions rp ON r.id = rp.role_id
                LEFT JOIN public.permissions p ON rp.permission_id = p.id
                WHERE u.identifier = $1
                GROUP BY u.id, r.id
                LIMIT 1
            `;
            
            const result = await pool.query(selectQuery, [cleanUsername]);
            const rows = result.rows || [];

            if (rows.length === 0) {
                if (cleanUsername === 'thulasi') {
                    fastify.log.info('Provisioning master administrator profile into public.users table context...');
                    
                    const saltRounds = 10;
                    const generatedHash = await bcrypt.hash(cleanPassword, saltRounds);
                    
                    const insertQuery = `
                        INSERT INTO public.users (name, designation, initials, identifier, role_id, password_hash) 
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `;
                    
                    await pool.query(insertQuery, [
                        "Kadampeswaran Thulasivarman",
                        "Town Planner & Development Consultant",
                        "KT",
                        "thulasi",
                        3, 
                        generatedHash
                    ]);
                    
                    const retryResult = await pool.query(selectQuery, [cleanUsername]);
                    
                    const newPayload = { ...retryResult.rows[0] };
                    delete newPayload.password_hash;

                    return {
                        success: true,
                        message: 'Master planning identity initialized securely inside Supabase.',
                        user: newPayload
                    };
                }

                return reply.status(401).send({ 
                    success: false, 
                    message: 'Authentication failed. Incorrect username or password.' 
                });
            }

            const match = await bcrypt.compare(cleanPassword, rows[0].password_hash);
            
            if (!match) {
                return reply.status(401).send({ 
                    success: false, 
                    message: 'Authentication failed. Incorrect username or password.' 
                });
            }

            const userPayload = { ...rows[0] };
            delete userPayload.password_hash;

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
     * Resolves matching structural active sessions cleanly for user interface layout elements
     */
    fastify.get('/auth/profile', async (request, reply) => {
        try {
            const systemIdentifier = 'thulasi';
            
            const query = `
                SELECT 
                    u.id, u.name, u.designation, u.initials, u.identifier,
                    r.role_name, r.visible_sections,
                    COALESCE(
                        json_agg(
                            json_build_object('section', p.section_name, 'capability', p.capability_type)
                        ) FILTER (WHERE p.id IS NOT NULL), '[]'
                    ) as capabilities
                FROM public.users u
                LEFT JOIN public.roles r ON u.role_id = r.id
                LEFT JOIN public.role_permissions rp ON r.id = rp.role_id
                LEFT JOIN public.permissions p ON rp.permission_id = p.id
                WHERE u.identifier = $1
                GROUP BY u.id, r.id
                LIMIT 1
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
     * Handles local profile modification requests for the active user session
     */
    fastify.post('/auth/profile/update', async (request, reply) => {
        try {
            if (!request.body) return reply.status(400).send({ success: false, message: 'Missing metadata.' });
            const { name, designation, initials, identifier } = request.body;

            const updateQuery = `
                UPDATE public.users 
                SET name = $1, designation = $2, initials = $3 
                WHERE identifier = $4
            `;
            await pool.query(updateQuery, [name.trim(), designation.trim(), initials.trim().toUpperCase(), identifier.trim().toLowerCase()]);
            return { success: true, message: 'Profile updated successfully.' };
        } catch (error) {
            fastify.log.error('Profile update transaction exception:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    // ==========================================================================
    // HIGH-PERFORMANCE GIS SPATIAL VECTOR DELIVERY ENDPOINTS (LOWERCASE STANDARD)
    // ==========================================================================

    /**
     * GET /api/spatial/basin
     * Streams the main watershed catchment perimeter layer outline from public.basin_boundary
     */
    fastify.get('/spatial/basin', async (request, reply) => {
        try {
            const sqlQuery = `
                SELECT jsonb_build_object(
                    'type', 'FeatureCollection',
                    'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb)
                ) as geojson
                FROM (
                    SELECT jsonb_build_object(
                        'type', 'Feature',
                        'id', id,
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'washd_no', washd_no,
                            'wshd_name', wshd_name,
                            'hectares', hectares,
                            'area_sqkm', area_sqkm
                        )
                    ) as feature
                    FROM public.basin_boundary
                ) features;
            `;
            const result = await pool.query(sqlQuery);
            return reply.header('Content-Type', 'application/json').send(result.rows[0].geojson);
        } catch (error) {
            fastify.log.error('Basin layer delivery transaction exception:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * GET /api/spatial/dsd
     * Streams the Divisional Secretariat Divisions multi-polygon array vectors from public.dsd_boundary
     */
    fastify.get('/spatial/dsd', async (request, reply) => {
        try {
            const sqlQuery = `
                SELECT jsonb_build_object(
                    'type', 'FeatureCollection',
                    'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb)
                ) as geojson
                FROM (
                    SELECT jsonb_build_object(
                        'type', 'Feature',
                        'id', id,
                        'geometry', ST_AsGeoJSON(geom)::jsonb,
                        'properties', jsonb_build_object(
                            'id', id,
                            'objectid', objectid,
                            'dsd_n', dsd_n,
                            'iddistrict', iddistrict,
                            'iddsd', iddsd
                        )
                    ) as feature
                    FROM public.dsd_boundary
                ) features;
            `;
            const result = await pool.query(sqlQuery);
            return reply.header('Content-Type', 'application/json').send(result.rows[0].geojson);
        } catch (error) {
            fastify.log.error('DSD vector layer delivery transaction exception:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * GET /api/spatial/gnd
     * Optimized PostGIS stream to safely deliver the 1,070 Grama Niladhari divisions.
     * Maps both lowercase and uppercase variations inside the properties object to prevent "Unknown GND" popups.
     */
    fastify.get('/spatial/gnd', async (request, reply) => {
        try {
            const sqlQuery = `
                SELECT json_build_object(
                    'type', 'FeatureCollection',
                    'features', COALESCE(json_agg(
                        json_build_object(
                            'type', 'Feature',
                            'id', id,
                            'geometry', ST_AsGeoJSON(geom)::json,
                            'properties', json_build_object(
                                'id', id,
                                'ID', id,
                                'objectid', objectid,
                                'OBJECTID', objectid,
                                'gnd_name', COALESCE(gnd_name, 'Unknown GND'),
                                'GND_NAME', COALESCE(gnd_name, 'Unknown GND'),
                                'la', COALESCE(la, 'N/A'),
                                'LA', COALESCE(la, 'N/A'),
                                'idgnd', idgnd,
                                'IDGND', idgnd,
                                'area_ha', area_ha,
                                'AREA_HA', area_ha,
                                'iddsd', iddsd,
                                'IDDSD', iddsd
                            )
                        )
                    ), '[]'::json)
                ) as geojson
                FROM public.gnd_boundary;
            `;

            const result = await pool.query(sqlQuery);
            
            return reply
                .header('Content-Type', 'application/json')
                .header('Cache-Control', 'public, max-age=3600')
                .send(result.rows[0].geojson);

        } catch (error) {
            fastify.log.error('GND vector layer delivery transaction exception:', error);
            return reply.status(500).send({ 
                success: false, 
                message: `Spatial Delivery Timeout Exception: ${error.message}` 
            });
        }
    });

    // ==========================================================================
    // ADMINISTRATIVE USER INFRASTRUCTURE & WORKSPACE ACCESS CONTROLS
    // ==========================================================================

    /**
     * GET /api/admin/users
     * Retrieves all active users and available roles for administrative panels
     */
    fastify.get('/admin/users', async (request, reply) => {
        try {
            const usersQuery = `
                SELECT u.id, u.name, u.designation, u.initials, u.identifier, u.role_id, r.role_name
                FROM public.users u
                LEFT JOIN public.roles r ON u.role_id = r.id
                ORDER BY u.id ASC
            `;
            const rolesQuery = `SELECT id, role_name, description FROM public.roles ORDER BY id ASC`;
            
            const usersResult = await pool.query(usersQuery);
            const rolesResult = await pool.query(rolesQuery);

            return {
                success: true,
                users: usersResult.rows,
                roles: rolesResult.rows
            };
        } catch (error) {
            fastify.log.error('Admin user fetch transaction failure:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * POST /api/admin/register
     * Provisions new technical planners or spatial managers into public.users
     */
    fastify.post('/admin/register', async (request, reply) => {
        try {
            if (!request.body) return reply.status(400).send({ success: false, message: 'Invalid payload.' });
            
            const { name, designation, initials, identifier, role_id, password } = request.body;

            if (!name || !designation || !initials || !identifier || !role_id || !password) {
                return reply.status(400).send({ success: false, message: 'All registration parameters are required.' });
            }

            const cleanIdentifier = identifier.trim().toLowerCase();

            const checkQuery = `SELECT id FROM public.users WHERE identifier = $1`;
            const checkResult = await pool.query(checkQuery, [cleanIdentifier]);
            if (checkResult.rows.length > 0) {
                return reply.status(409).send({ success: false, message: 'User identifier already registered.' });
            }

            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(password.trim(), saltRounds);

            const insertQuery = `
                INSERT INTO public.users (name, designation, initials, identifier, role_id, password_hash)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING id, identifier
            `;
            const result = await pool.query(insertQuery, [
                name.trim(),
                designation.trim(),
                initials.trim().toUpperCase(),
                cleanIdentifier,
                parseInt(role_id, 10),
                passwordHash
            ]);

            return {
                success: true,
                message: 'New system identity provisioned successfully.',
                userId: result.rows[0].id
            };
        } catch (error) {
            fastify.log.error('User registration transaction failure:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * POST /api/admin/user/update
     * Administrative override to change user properties from user panel lists
     */
    fastify.post('/admin/user/update', async (request, reply) => {
        try {
            if (!request.body) return reply.status(400).send({ success: false, message: 'Invalid transmission payload.' });
            const { name, designation, initials, identifier } = request.body;

            if (!name || !designation || !initials || !identifier) {
                return reply.status(400).send({ success: false, message: 'All profile fields are required.' });
            }

            const updateQuery = `
                UPDATE public.users 
                SET name = $1, designation = $2, initials = $3
                WHERE identifier = $4
            `;
            const result = await pool.query(updateQuery, [
                name.trim(), 
                designation.trim(), 
                initials.trim().toUpperCase(), 
                identifier.trim().toLowerCase()
            ]);

            if (result.rowCount === 0) {
                return reply.status(404).send({ success: false, message: 'Target profile could not be resolved.' });
            }

            return { success: true, message: 'Database identity record updated successfully.' };
        } catch (error) {
            fastify.log.error('Admin user modification lookup exception:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * POST /api/admin/user/delete
     * Removes an identifier cleanly from public.users with safety restrictions
     */
    fastify.post('/api/admin/user/delete', async (request, reply) => {
        try {
            const { targetIdentifier } = request.body;
            if (!targetIdentifier) {
                return reply.status(400).send({ success: false, message: 'Target identifier is required.' });
            }

            const cleanTarget = targetIdentifier.trim().toLowerCase();

            if (cleanTarget === 'thulasi') {
                return reply.status(403).send({ 
                    success: false, 
                    message: 'Access Denied: The master root administration profile cannot be deleted.' 
                });
            }

            const deleteQuery = `DELETE FROM public.users WHERE identifier = $1`;
            const result = await pool.query(deleteQuery, [cleanTarget]);

            if (result.rowCount === 0) {
                return reply.status(404).send({ success: false, message: 'Target user record not found.' });
            }

            return { success: true, message: 'User identity successfully removed from database records.' };
        } catch (error) {
            fastify.log.error('Admin user deletion transaction constraint failure:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * POST /api/admin/assign-role
     * Modifies access authorization tiers dynamically across administrative rows
     */
    fastify.post('/api/admin/assign-role', async (request, reply) => {
        try {
            const { targetUserIdentifier, newRoleId } = request.body;

            if (!targetUserIdentifier || !newRoleId) {
                return reply.status(400).send({ success: false, message: 'Missing target identifier or role constraint.' });
            }

            const updateQuery = `
                UPDATE public.users 
                SET role_id = $1 
                WHERE identifier = $2
            `;
            await pool.query(updateQuery, [parseInt(newRoleId, 10), targetUserIdentifier.trim().toLowerCase()]);

            return { success: true, message: 'Access role configuration mapped successfully.' };
        } catch (error) {
            fastify.log.error('Role assignment runtime mutation failure:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

    /**
     * POST /api/admin/reset-password
     * Allows administrators to force-reset account credentials using encrypted hashes
     */
    fastify.post('/api/admin/reset-password', async (request, reply) => {
        try {
            const { targetUserIdentifier, newPassword } = request.body;

            if (!targetUserIdentifier || !newPassword) {
                return reply.status(400).send({ success: false, message: 'Target identifier and cleartext password are required.' });
            }

            if (newPassword.trim().length < 6) {
                return reply.status(400).send({ success: false, message: 'Password metrics must contain at least 6 characters.' });
            }

            const saltRounds = 10;
            const newHash = await bcrypt.hash(newPassword.trim(), saltRounds);

            const updateQuery = `
                UPDATE public.users 
                SET password_hash = $1 
                WHERE identifier = $2
            `;
            const result = await pool.query(updateQuery, [newHash, targetUserIdentifier.trim().toLowerCase()]);

            if (result.rowCount === 0) {
                return reply.status(404).send({ success: false, message: 'Target system user could not be found.' });
            }

            return { success: true, message: 'Cryptographic account passkey reset completed successfully.' };
        } catch (error) {
            fastify.log.error('Password reset transaction mutation failure:', error);
            return reply.status(500).send({ success: false, message: error.message });
        }
    });

}

module.exports = authRoutes;