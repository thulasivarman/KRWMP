const pool = require('../../config/database');
const { extractAuthToken, verifyToken } = require('../utils/jwt');

function getRequestUser(request) {
  if (request.auth?.identifier) return String(request.auth.identifier).trim().toLowerCase();
  const token = extractAuthToken(request);
  if (!token) return '';
  try {
    const decoded = verifyToken(token);
    request.auth = decoded;
    return String(decoded.identifier || decoded.sub || '').trim().toLowerCase();
  } catch (error) {
    request.authError = error;
    return '';
  }
}

function isMasterAdmin(identifier) {
  const configured = String(process.env.KRWMP_SUPERUSERS || 'thulasi').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  return configured.includes(String(identifier || '').trim().toLowerCase());
}

function isAdminRole(roleName) {
  return String(roleName || '').toLowerCase() === 'admin';
}

async function getUserPrivileges(identifier) {
  if (!identifier) return [];
  if (isMasterAdmin(identifier)) {
    return [{ privilege_key: 'system_admin', privilege_name: 'System Administration', can_view: true, can_create: true, can_update: true, can_delete: true, role_name: 'admin' }];
  }
  const result = await pool.query(`
    SELECT DISTINCT rp.privilege_key, rp.privilege_name, rp.can_view, rp.can_create, rp.can_update, rp.can_delete, r.role_name
    FROM public.users u
    LEFT JOIN public.user_roles ur ON ur.user_id = u.id
    LEFT JOIN public.roles r ON r.id = COALESCE(ur.role_id, u.role_id)
    LEFT JOIN public.role_privileges rp ON rp.role_id = r.id
    WHERE u.identifier = $1 AND rp.privilege_key IS NOT NULL
    ORDER BY rp.privilege_key;
  `, [identifier]);
  return result.rows;
}

async function hasPrivilege(identifier, privilegeKey, action = 'view') {
  if (!identifier) return false;
  if (isMasterAdmin(identifier)) return true;
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
    if (!identifier) {
      reply.status(401).send({ success: false, message: request.authError ? 'Invalid or expired authentication token' : 'Authentication required' });
      return false;
    }
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

module.exports = { getRequestUser, getUserPrivileges, hasPrivilege, requirePrivilege, requirePrivilegeInline, isAdminRole, isMasterAdmin };
