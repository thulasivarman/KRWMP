const service = require('../services/community-issues.service');

function adminUser(request) {
  return String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'admin').trim();
}

async function communityIssueRoutes(fastify) {
  fastify.get('/issue-categories', async () => {
    const categories = await service.listCategories({ activeOnly: true });
    return { success: true, categories };
  });

  fastify.post('/issue-categories', async (request) => {
    const category = await service.createCategory(request.body || {});
    return { success: true, category };
  });

  fastify.put('/issue-categories/:id', async (request, reply) => {
    const category = await service.updateCategory(request.params.id, request.body || {});
    if (!category) return reply.status(404).send({ success: false, message: 'Category not found' });
    return { success: true, category };
  });

  fastify.get('/solutions', async (request) => {
    const solutions = await service.listSolutions({ activeOnly: true, categoryId: request.query?.category_id || null });
    return { success: true, solutions };
  });

  fastify.post('/solutions', async (request) => {
    const solution = await service.createSolution(request.body || {}, adminUser(request));
    return { success: true, solution };
  });

  fastify.put('/solutions/:id', async (request, reply) => {
    const solution = await service.updateSolution(request.params.id, request.body || {});
    if (!solution) return reply.status(404).send({ success: false, message: 'Solution not found' });
    return { success: true, solution };
  });

  fastify.post('/community-reports', async (request, reply) => {
    const report = await service.createPublicReport({ fields: request.body || {}, photoFile: null });
    return reply.status(201).send({ success: true, message: 'Issue report submitted successfully', report });
  });

  fastify.get('/community-reports', async (request) => {
    const reports = await service.listReports({ status: request.query?.status || null });
    return { success: true, reports };
  });

  fastify.put('/community-reports/:id', async (request, reply) => {
    const report = await service.updateReport(request.params.id, request.body || {}, adminUser(request));
    if (!report) return reply.status(404).send({ success: false, message: 'Report not found' });
    return { success: true, report };
  });

  fastify.get('/community-reports.geojson', async (request) => {
    return service.getReportsGeoJson({ status: request.query?.status || null });
  });
}

module.exports = communityIssueRoutes;
