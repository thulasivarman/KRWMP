const bcrypt = require('bcrypt');
const pool = require('../../config/database');

async function authRoutes(fastify, options) {
    
    // User Registration Endpoint
    fastify.post('/register', async (request, reply) => {
        const { name, phone_number, designation, organization, password } = request.body;

        if (!name || !phone_number || !designation || !organization || !password) {
            return reply.code(400).send({ success: false, message: "All fields are required." });
        }

        try {
            const userCheck = await pool.query('SELECT id FROM public.users WHERE phone_number = $1', [phone_number]);
            if (userCheck.rows.length > 0) {
                return reply.code(409).send({ success: false, message: "An account with this phone number already exists." });
            }

            const saltRounds = 10;
            const passwordHash = await bcrypt.hash(password, saltRounds);

            const insertQuery = `
                INSERT INTO public.users (name, phone_number, designation, organization, password_hash)
                VALUES ($1, $2, $3, $4, $5) RETURNING id;
            `;
            await pool.query(insertQuery, [name, phone_number, designation, organization, passwordHash]);

            return reply.code(201).send({ success: true, message: "Account created successfully!" });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ success: false, message: "Internal server database error." });
        }
    });

    // User Login Endpoint
    fastify.post('/login', async (request, reply) => {
        const { phone_number, password } = request.body;

        if (!phone_number || !password) {
            return reply.code(400).send({ success: false, message: "Credentials are required." });
        }

        try {
            const queryResult = await pool.query('SELECT id, name, password_hash FROM public.users WHERE phone_number = $1', [phone_number]);
            if (queryResult.rows.length === 0) {
                return reply.code(401).send({ success: false, message: "Invalid credentials." });
            }

            const user = queryResult.rows[0];
            const passwordMatch = await bcrypt.compare(password, user.password_hash);
            if (!passwordMatch) {
                return reply.code(401).send({ success: false, message: "Invalid credentials." });
            }

            return reply.code(200).send({
                success: true,
                message: `Welcome back, ${user.name}!`,
                user: { id: user.id, name: user.name }
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({ success: false, message: "Internal authentication error." });
        }
    });
}

module.exports = authRoutes;