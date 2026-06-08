const bcrypt = require('bcryptjs');
const pool = require('../../config/database');

async function login(username, password) {
  const cleanUsername = username.trim().toLowerCase();
  const cleanPassword = password.trim();

  const query = `
    SELECT 
      u.id,
      u.name,
      u.designation,
      u.initials,
      u.identifier,
      u.password_hash,
      r.role_name,
      r.visible_sections,
      COALESCE(
        json_agg(
          json_build_object(
            'section', p.section_name,
            'capability', p.capability_type
          )
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS capabilities
    FROM public.users u
    LEFT JOIN public.roles r ON u.role_id = r.id
    LEFT JOIN public.role_permissions rp ON r.id = rp.role_id
    LEFT JOIN public.permissions p ON rp.permission_id = p.id
    WHERE u.identifier = $1
    GROUP BY u.id, r.id
    LIMIT 1;
  `;

  const result = await pool.query(query, [cleanUsername]);

  if (result.rows.length === 0) {
    return {
      success: false,
      message: 'Invalid username or password',
    };
  }

  const user = result.rows[0];
  const passwordMatch = await bcrypt.compare(cleanPassword, user.password_hash);

  if (!passwordMatch) {
    return {
      success: false,
      message: 'Invalid username or password',
    };
  }

  delete user.password_hash;

  return {
    success: true,
    message: 'Login successful',
    user,
  };
}

async function getProfile(identifier) {
  const query = `
    SELECT 
      u.id,
      u.name,
      u.designation,
      u.initials,
      u.identifier,
      r.role_name,
      r.visible_sections
    FROM public.users u
    LEFT JOIN public.roles r ON u.role_id = r.id
    WHERE u.identifier = $1
    LIMIT 1;
  `;

  const result = await pool.query(query, [identifier]);
  return result.rows[0] || null;
}

async function updateProfile(data) {
  const { name, designation, initials, identifier } = data;

  const query = `
    UPDATE public.users
    SET name = $1,
        designation = $2,
        initials = $3
    WHERE identifier = $4;
  `;

  await pool.query(query, [
    name.trim(),
    designation.trim(),
    initials.trim().toUpperCase(),
    identifier.trim().toLowerCase(),
  ]);
}

module.exports = {
  login,
  getProfile,
  updateProfile,
};