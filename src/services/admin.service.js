const bcrypt = require('bcryptjs');
const pool = require('../../config/database');

async function getUsers() {
  const usersQuery = `
    SELECT 
      u.id,
      u.name,
      u.designation,
      u.initials,
      u.identifier,
      u.role_id,
      r.role_name
    FROM public.users u
    LEFT JOIN public.roles r ON u.role_id = r.id
    ORDER BY u.id ASC;
  `;

  const rolesQuery = `
    SELECT id, role_name, description
    FROM public.roles
    ORDER BY id ASC;
  `;

  const users = await pool.query(usersQuery);
  const roles = await pool.query(rolesQuery);

  return {
    success: true,
    users: users.rows,
    roles: roles.rows,
  };
}

async function registerUser(data) {
  const { name, designation, initials, identifier, role_id, password } = data;

  if (!name || !designation || !initials || !identifier || !role_id || !password) {
    return {
      success: false,
      statusCode: 400,
      message: 'All fields are required',
    };
  }

  const cleanIdentifier = identifier.trim().toLowerCase();

  const existing = await pool.query(
    `SELECT id FROM public.users WHERE identifier = $1`,
    [cleanIdentifier]
  );

  if (existing.rows.length > 0) {
    return {
      success: false,
      statusCode: 409,
      message: 'User already exists',
    };
  }

  const passwordHash = await bcrypt.hash(password.trim(), 10);

  const insertQuery = `
    INSERT INTO public.users 
    (name, designation, initials, identifier, role_id, password_hash)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id;
  `;

  const result = await pool.query(insertQuery, [
    name.trim(),
    designation.trim(),
    initials.trim().toUpperCase(),
    cleanIdentifier,
    parseInt(role_id, 10),
    passwordHash,
  ]);

  return {
    success: true,
    message: 'User registered successfully',
    userId: result.rows[0].id,
  };
}

async function updateUser(data) {
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

async function deleteUser(targetIdentifier) {
  if (!targetIdentifier) {
    return {
      success: false,
      statusCode: 400,
      message: 'Target identifier is required',
    };
  }

  const cleanTarget = targetIdentifier.trim().toLowerCase();

  if (cleanTarget === 'thulasi') {
    return {
      success: false,
      statusCode: 403,
      message: 'Master administrator cannot be deleted',
    };
  }

  const result = await pool.query(
    `DELETE FROM public.users WHERE identifier = $1`,
    [cleanTarget]
  );

  if (result.rowCount === 0) {
    return {
      success: false,
      statusCode: 404,
      message: 'User not found',
    };
  }

  return {
    success: true,
    message: 'User deleted successfully',
  };
}

async function assignRole(data) {
  const { targetUserIdentifier, newRoleId } = data;

  await pool.query(
    `UPDATE public.users SET role_id = $1 WHERE identifier = $2`,
    [parseInt(newRoleId, 10), targetUserIdentifier.trim().toLowerCase()]
  );
}

async function resetPassword(data) {
  const { targetUserIdentifier, newPassword } = data;

  const passwordHash = await bcrypt.hash(newPassword.trim(), 10);

  await pool.query(
    `UPDATE public.users SET password_hash = $1 WHERE identifier = $2`,
    [passwordHash, targetUserIdentifier.trim().toLowerCase()]
  );
}

module.exports = {
  getUsers,
  registerUser,
  updateUser,
  deleteUser,
  assignRole,
  resetPassword,
};