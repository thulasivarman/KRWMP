const pool = require('../../config/database');

function getRequestUser(request) {
  return String(request.headers['x-krwmp-user'] || request.headers['x-user'] || '').trim().toLowerCase();
}

function isAdminRole(roleName) {
  return String(roleName || '').toLowerCase() === 'admin';
}

async function getUserPrivileges(identifier) {
  if (!identifier) return [];
  const result = await pool.query(`
    SELECT DISTINCT
      rp.privilege_key,
      rp.privilege_name,
      rp.can_view,
      rp.can_create,
      rp.can_update,
      rp.can_delete,
      r.role_name
    FROM public.users u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    LEFT JOIN public.roles r ON r.id = COALESCE(ur.role_id, u.role_id)
    LEFT JOIN public.role_privileges rp ON rp.role_id = r.id
    WHERE u.identifier = $1
      AND rp.privilege_key IS NOT NULL
    ORDER BY rp.privilege_key;
  `, [identifier]);
  return result.rows;
}

async function hasPrivilege(identifier, privilegeKey, action = 'view') {
  if (!identifier) return false;
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM public.users u
      LEFT JOIN public.user_roles ur ON ur.user_id = u.id
      LEFT JOIN public.roles r ON r.id = COALESCE(ur.role_id, u.role_id)
      LEFT JOIN public.role_privileges rp ON rp.role_id = r.id
      WHERE u.identifier = $1
        AND (
          lower(r.role_name) = 'admin'
          OR (
            rp.privilege_key = $2
            AND CASE $3
              WHEN 'view' THEN rp.can_view
              WHEN 'create' THEN rp.can_create
              WHEN 'update' THEN rp.can_update
              WHEN 'delete' THEN rp.can_delete
              ELSE rp.can_view
            END = true
          )
        )
    ) AS allowed;
  `, [identifier, privilegeKey, action]);
  return !!result.rows[0]?.allowed;
}

function requirePrivilege(privilegeKey, action = 'view') {
  return async function privilegeGuard(request, reply) {
    const identifier = getRequestUser(request);
    const allowed = await hasPrivilege(identifier, privilegeKey, action);
    if (!allowed) {
      reply.status(403).send({ success: false, message: `Access denied. Required privilege: ${privilegeKey}:${action}` });
      return false;
    }
    return true;
  };
}

async function requirePrivilegeInline(request, reply, privilegeKey, action = 'view') {
  const guard = requirePrivilege(privilegeKey, action);
  return guard(request, reply);
}

module.exports = { getRequestUser, getUserPrivileges, hasPrivilege, requirePrivilege, requirePrivilegeInline, isAdminRole };
