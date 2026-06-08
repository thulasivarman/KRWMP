const adminService = require('../services/admin.service');

async function adminRoutes(fastify) {
  fastify.get('/admin/users', async () => {
    return adminService.getUsers();
  });

  fastify.post('/admin/register', async (request, reply) => {
    const result = await adminService.registerUser(request.body);
    return reply.status(result.statusCode || 200).send(result);
  });

  fastify.post('/admin/user/update', async (request) => {
    await adminService.updateUser(request.body);
    return {
      success: true,
      message: 'User updated successfully',
    };
  });

  fastify.post('/admin/user/delete', async (request, reply) => {
    const result = await adminService.deleteUser(request.body.targetIdentifier);
    return reply.status(result.statusCode || 200).send(result);
  });

  fastify.post('/admin/assign-role', async (request) => {
    await adminService.assignRole(request.body);
    return {
      success: true,
      message: 'Role assigned successfully',
    };
  });

  fastify.post('/admin/reset-password', async (request) => {
    await adminService.resetPassword(request.body);
    return {
      success: true,
      message: 'Password reset successfully',
    };
  });
}

module.exports = adminRoutes;