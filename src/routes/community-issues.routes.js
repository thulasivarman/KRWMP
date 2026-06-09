const communityService = require('../services/community-issues.service');

function getAdminUser(request) {
  return String(request.headers['x-krwmp-user'] || request.headers['x-user'] || 'admin').trim();
}

async function communityIssueRoutes(fastify) {
  fastify.get('/issue-categories', async () => {
    const categories = await communityService.listCategories({ activeOnly: true });
    return { success: true, categories };
  });

  fastify.post('/issue-categories', async (request) => {
    const category = await communityService.createCategory(request.body || {});
    return { success: true, category };
  });

  fastify.put('/issue-categories/:id', async (request, reply) => {
    const category = await communityService.updateCategory(request.params.id, request.body || {});
    if (!category) return reply.status(404).send({ success: false, message: 'Category not found' });
    return { success: true, category };
  });

  fastify.get('/solutions', async (request) => {
    const solutions = await communityService.listSolutions({ activeOnly: true, categoryId: request.query?.category_id || null });
    return { success: true, solutions };
  });

  fastify.post('/solutions', async (request) => {
    const solution = await communityService.createSolution(request.body || {}, getAdminUser(request));
    return { success: true, solution };
  });

  fastify.put('/solutions/:id', async (request, reply) => {
    const solution = await communityService.updateSolution(request.params.id, request.body || {});
    if (!solution) return reply.status(404).send({ success: false, message: 'Solution not found' });
    return { success: true, solution };
  });

  fastify.get('/community-reports', async (request) => {
    const reports = await communityService.listReports({ status: request.query?.status || null });
    return { success: true, reports };
  });

  fastify.post('/community-reports', async (request, reply) => {
    const contentType = String(request.headers['content-type'] || '');
    let report;

    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts();
      const fields = {};
      let photoFile = null;

      for await (const part of parts) {
        if (part.file && part.fieldname === 'photo') {
          photoFile = part;
        } else if (!part.file) {
          fields[part.fieldname] = part.value;
        }
      }
      report = await communityService.createPublicReport({ fields, photoFile });
    } else {
      report = await communityService.createPublicReport({ fields: request.body || {}, photoFile: null });
    }

    return reply.status(201).send({ success: true, message: 'Issue report submitted successfully', report });
  });

  fastify.put('/community-reports/:id', async (request, reply) => {
    const report = await communityService.updateReport(request.params.id, request.body || {}, getAdminUser(request));
    if (!report) return reply.status(404).send({ success: false, message: 'Report not found' });
    return { success: true, report };
  });

  fastify.get('/community-reports.geojson', async (request) => {
    return communityService.getReportsGeoJson({ status: request.query?.status || null });
  });
}

module.exports = communityIssueRoutes;
