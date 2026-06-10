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
      u.institution_id,
      i.institution_name,
      r.role_name,
      COALESCE(json_agg(DISTINCT jsonb_build_object('id', ur.role_id, 'role_name', r2.role_name)) FILTER (WHERE ur.role_id IS NOT NULL), '[]') AS roles
    FROM public.users u
    LEFT JOIN public.roles r ON u.role_id = r.id
    LEFT JOIN public.intervention_institutions i ON i.id = u.institution_id
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    LEFT JOIN public.roles r2 ON r2.id = ur.role_id
    GROUP BY u.id, i.institution_name, r.role_name
    ORDER BY u.id ASC;
  `;

  const rolesQuery = `SELECT id, role_name, description FROM public.roles ORDER BY id ASC;`;
  const institutionsQuery = `SELECT id, institution_name FROM public.intervention_institutions WHERE active = true ORDER BY institution_name ASC;`;
  const privilegesQuery = `SELECT rp.*, r.role_name FROM public.role_privileges rp JOIN public.roles r ON r.id = rp.role_id ORDER BY r.role_name, rp.privilege_key;`;

  const users = await pool.query(usersQuery);
  const roles = await pool.query(rolesQuery);
  const institutions = await pool.query(institutionsQuery);
  const privileges = await pool.query(privilegesQuery);

  return { success: true, users: users.rows, roles: roles.rows, institutions: institutions.rows, privileges: privileges.rows };
}

async function registerUser(data) {
  const { name, designation, initials, identifier, role_id, role_ids, institution_id, password } = data;
  const selectedRoles = Array.isArray(role_ids) ? role_ids : (role_id ? [role_id] : []);

  if (!name || !designation || !initials || !identifier || selectedRoles.length === 0 || !password) {
    return { success: false, statusCode: 400, message: 'All fields are required' };
  }

  const cleanIdentifier = identifier.trim().toLowerCase();
  const existing = await pool.query(`SELECT id FROM public.users WHERE identifier = $1`, [cleanIdentifier]);
  if (existing.rows.length > 0) return { success: false, statusCode: 409, message: 'User already exists' };

  const passwordHash = await bcrypt.hash(password.trim(), 10);
  const primaryRoleId = parseInt(selectedRoles[0], 10);
  const result = await pool.query(`
    INSERT INTO public.users (name, designation, initials, identifier, role_id, institution_id, password_hash)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    RETURNING id;
  `, [name.trim(), designation.trim(), initials.trim().toUpperCase(), cleanIdentifier, primaryRoleId, institution_id || null, passwordHash]);

  await setUserRolesById(result.rows[0].id, selectedRoles);
  return { success: true, message: 'User registered successfully', userId: result.rows[0].id };
}

async function updateUser(data) {
  const { name, designation, initials, identifier, institution_id } = data;
  await pool.query(`
    UPDATE public.users
    SET name = $1, designation = $2, initials = $3, institution_id = $4
    WHERE identifier = $5;
  `, [name.trim(), designation.trim(), initials.trim().toUpperCase(), institution_id || null, identifier.trim().toLowerCase()]);
}

async function deleteUser(targetIdentifier) {
  if (!targetIdentifier) return { success: false, statusCode: 400, message: 'Target identifier is required' };
  const cleanTarget = targetIdentifier.trim().toLowerCase();
  if (cleanTarget === 'thulasi') return { success: false, statusCode: 403, message: 'Master administrator cannot be deleted' };
  const result = await pool.query(`DELETE FROM public.users WHERE identifier = $1`, [cleanTarget]);
  if (result.rowCount === 0) return { success: false, statusCode: 404, message: 'User not found' };
  return { success: true, message: 'User deleted successfully' };
}

async function setUserRolesById(userId, roleIds = []) {
  await pool.query('DELETE FROM public.user_roles WHERE user_id = $1', [userId]);
  for (const roleId of roleIds) {
    await pool.query('INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, parseInt(roleId, 10)]);
  }
  if (roleIds.length > 0) await pool.query('UPDATE public.users SET role_id = $2 WHERE id = $1', [userId, parseInt(roleIds[0], 10)]);
}

async function assignRole(data) {
  const { targetUserIdentifier, newRoleId, role_ids } = data;
  const user = await pool.query('SELECT id FROM public.users WHERE identifier = $1', [targetUserIdentifier.trim().toLowerCase()]);
  if (!user.rows.length) return;
  await setUserRolesById(user.rows[0].id, Array.isArray(role_ids) ? role_ids : [newRoleId]);
}

async function createRole(data) {
  const result = await pool.query('INSERT INTO public.roles (role_name, description) VALUES ($1,$2) RETURNING *', [data.role_name, data.description || null]);
  return result.rows[0];
}

async function updateRole(data) {
  const result = await pool.query('UPDATE public.roles SET role_name=$2, description=$3 WHERE id=$1 RETURNING *', [data.id, data.role_name, data.description || null]);
  return result.rows[0];
}

async function deleteRole(id) {
  await pool.query('DELETE FROM public.roles WHERE id=$1', [id]);
}

async function savePrivilege(data) {
  const result = await pool.query(`
    INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (role_id, privilege_key)
    DO UPDATE SET privilege_name=EXCLUDED.privilege_name, can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_update=EXCLUDED.can_update, can_delete=EXCLUDED.can_delete, updated_at=now()
    RETURNING *;
  `, [data.role_id, data.privilege_key, data.privilege_name, !!data.can_view, !!data.can_create, !!data.can_update, !!data.can_delete]);
  return result.rows[0];
}

async function resetPassword(data) {
  const { targetUserIdentifier, newPassword } = data;
  const passwordHash = await bcrypt.hash(newPassword.trim(), 10);
  await pool.query(`UPDATE public.users SET password_hash = $1 WHERE identifier = $2`, [passwordHash, targetUserIdentifier.trim().toLowerCase()]);
}

module.exports = { getUsers, registerUser, updateUser, deleteUser, assignRole, createRole, updateRole, deleteRole, savePrivilege, resetPassword };
