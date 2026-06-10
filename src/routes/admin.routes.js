const adminService = require('../services/admin.service');

async function adminRoutes(fastify) {
  fastify.get('/admin/users', async () => adminService.getUsers());

  fastify.post('/admin/register', async (request, reply) => {
    const result = await adminService.registerUser(request.body);
    return reply.status(result.statusCode || 200).send(result);
  });

  fastify.post('/admin/user/update', async (request) => {
    await adminService.updateUser(request.body);
    return { success: true, message: 'User updated successfully' };
  });

  fastify.post('/admin/user/delete', async (request, reply) => {
    const result = await adminService.deleteUser(request.body.targetIdentifier);
    return reply.status(result.statusCode || 200).send(result);
  });

  fastify.post('/admin/assign-role', async (request) => {
    await adminService.assignRole(request.body);
    return { success: true, message: 'Role assigned successfully' };
  });

  fastify.post('/admin/roles', async (request, reply) => {
    const role = await adminService.createRole(request.body || {});
    return reply.status(201).send({ success: true, role });
  });

  fastify.put('/admin/roles/:id', async (request) => {
    const role = await adminService.updateRole({ ...(request.body || {}), id: request.params.id });
    return { success: true, role };
  });

  fastify.delete('/admin/roles/:id', async (request) => {
    await adminService.deleteRole(request.params.id);
    return { success: true, deleted: request.params.id };
  });

  fastify.post('/admin/role-privileges', async (request, reply) => {
    const privilege = await adminService.savePrivilege(request.body || {});
    return reply.status(201).send({ success: true, privilege });
  });

  fastify.post('/admin/reset-password', async (request) => {
    await adminService.resetPassword(request.body);
    return { success: true, message: 'Password reset successfully' };
  });
}

module.exports = adminRoutes;
