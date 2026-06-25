const adminService = require('../services/admin.service');
const adminJurisdictionService = require('../services/admin-jurisdiction.service');
const auditArchiveService = require('../services/audit-archive.service');
const auditLogService = require('../services/audit-log.service');
const auditReportService = require('../services/audit-report.service');
const { getRequestUser, requirePrivilegeInline } = require('../middleware/privilege.middleware');

async function requireUserManagement(request, reply, action = 'view') {
  return requirePrivilegeInline(request, reply, 'user_management_settings', action);
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function hasArchiveSecret(request) {
  const expected = cleanText(process.env.AUDIT_ARCHIVE_SECRET);
  if (!expected) return false;
  const provided = cleanText(request.headers['x-audit-archive-secret'] || request.headers['x-krwmp-audit-secret']);
  return provided === expected;
}

async function requireArchiveAccess(request, reply) {
  if (hasArchiveSecret(request)) return true;
  return requireUserManagement(request, reply, 'update');
}

async function adminRoutes(fastify) {
  fastify.get('/admin/users', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    return adminService.getUsers();
  });

  fastify.get('/admin/jurisdiction-builder/districts', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    return { success: true, districts: await adminJurisdictionService.listDistricts() };
  });

  fastify.get('/admin/jurisdiction-builder/dsds', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    return { success: true, dsds: await adminJurisdictionService.listDsds(request.query || {}) };
  });

  fastify.get('/admin/jurisdiction-builder/gnds', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    return { success: true, gnds: await adminJurisdictionService.listGnds(request.query || {}) };
  });

  fastify.post('/admin/jurisdiction-builder/custom', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'create')) return;
    const user = getRequestUser(request) || 'system';
    const jurisdiction = await adminJurisdictionService.createJurisdictionFromGnds(request.body || {}, user);
    return reply.status(201).send({ success: true, jurisdiction });
  });

  fastify.post('/admin/register', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'create')) return;
    const result = await adminService.registerUser(request.body);
    return reply.status(result.statusCode || 200).send(result);
  });

  fastify.post('/admin/user/update', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'update')) return;
    const result = await adminService.updateUser(request.body);
    if (result && result.success === false) return reply.status(result.statusCode || 400).send(result);
    return { success: true, message: 'User updated successfully' };
  });

  fastify.post('/admin/user/delete', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'delete')) return;
    const result = await adminService.deleteUser(request.body.targetIdentifier);
    return reply.status(result.statusCode || 200).send(result);
  });

  fastify.post('/admin/assign-role', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'update')) return;
    await adminService.assignRole(request.body);
    return { success: true, message: 'Role assigned successfully' };
  });

  fastify.post('/admin/roles', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'create')) return;
    const role = await adminService.createRole(request.body || {});
    return reply.status(201).send({ success: true, role });
  });

  fastify.put('/admin/roles/:id', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'update')) return;
    const role = await adminService.updateRole({ ...(request.body || {}), id: request.params.id });
    return { success: true, role };
  });

  fastify.delete('/admin/roles/:id', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'delete')) return;
    await adminService.deleteRole(request.params.id);
    return { success: true, deleted: request.params.id };
  });

  fastify.post('/admin/role-privileges', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'update')) return;
    const privilege = await adminService.savePrivilege(request.body || {});
    return reply.status(201).send({ success: true, privilege });
  });

  fastify.get('/admin/role-privileges/matrix', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    const matrix = await adminService.getRolePrivilegeMatrix();
    return { success: true, ...matrix };
  });

  fastify.post('/admin/role-privileges/matrix', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'update')) return;
    const result = await adminService.saveRolePrivilegeMatrix(request.body || {});
    return { success: true, message: 'Role privileges saved successfully', ...result };
  });

  fastify.post('/admin/reset-password', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'update')) return;
    await adminService.resetPassword(request.body);
    return { success: true, message: 'Password reset successfully' };
  });

  fastify.post('/admin/audit/archive-run', async (request, reply) => {
    if (!await requireArchiveAccess(request, reply)) return;
    const result = await auditArchiveService.runDailyAuditArchiveJob({
      includeCsv: request.body?.include_csv !== false,
      dbRetentionDays: Number(request.body?.db_retention_days || process.env.AUDIT_RETENTION_DB_DAYS || 14),
      r2RetentionDays: Number(request.body?.r2_retention_days || process.env.AUDIT_RETENTION_R2_DAYS || 90),
      limit: Number(request.body?.limit || process.env.AUDIT_ARCHIVE_BATCH_LIMIT || 10000),
    });
    return { success: true, message: 'Audit archive job completed.', ...result };
  });

  fastify.get('/admin/audit/logs', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    const result = await auditLogService.searchAuditLogs(request.query || {});
    return { success: true, ...result };
  });

  fastify.get('/admin/audit/export.csv', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    const result = await auditReportService.buildCsvReport(request.query || {});
    const filename = `krwmp-audit-report-${new Date().toISOString().slice(0, 10)}.csv`;
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${filename}"`).header('X-KRWMP-Audit-Record-Count', String(result.rows.length)).send(result.body);
  });

  fastify.get('/admin/audit/export.pdf', async (request, reply) => {
    if (!await requireUserManagement(request, reply, 'view')) return;
    const result = await auditReportService.buildPdfReport(request.query || {}, getRequestUser(request) || 'Administrator');
    const filename = `krwmp-audit-report-${new Date().toISOString().slice(0, 10)}.pdf`;
    return reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="${filename}"`).header('X-KRWMP-Audit-Record-Count', String(result.rows.length)).send(result.body);
  });
}

module.exports = adminRoutes;