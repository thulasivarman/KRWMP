const service = require('../services/water-quality.service');
const { requirePrivilegeInline, getRequestUser } = require('../middleware/privilege.middleware');
const { assertPdfUpload } = require('../utils/upload-validation');

function currentUser(request) {
  return getRequestUser(request) || 'system';
}

async function waterQualityRoutes(fastify) {
  fastify.get('/water-quality/parameters', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'water_quality_records', 'view')) return;
    const parameters = await service.listParameters();
    return { success: true, parameters };
  });

  fastify.get('/water-quality/tests', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'water_quality_records', 'view')) return;
    const tests = await service.listTests(request.query || {});
    return { success: true, tests };
  });

  fastify.get('/water-quality/tests/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'water_quality_records', 'view')) return;
    const test = await service.getTest(request.params.id);
    if (!test) return reply.status(404).send({ success: false, message: 'Water quality test record not found' });
    return { success: true, test };
  });

  fastify.post('/water-quality/tests', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'water_quality_records', 'create')) return;
    const contentType = String(request.headers['content-type'] || '');
    let fields = request.body || {};
    let pdfFile = null;

    if (contentType.includes('multipart/form-data')) {
      fields = {};
      for await (const part of request.parts()) {
        if (part.file && part.fieldname === 'signed_report_pdf') {
          const buffer = await part.toBuffer();
          const meta = { filename: part.filename, mimetype: part.mimetype, size: buffer.length, toBuffer: async () => buffer };
          assertPdfUpload(meta);
          pdfFile = meta;
        } else if (part.file) {
          await part.toBuffer();
        } else {
          fields[part.fieldname] = part.value;
        }
      }
    }

    const test = await service.createTest({ fields, pdfFile, user: currentUser(request) });
    return reply.status(201).send({ success: true, message: 'Water quality test record created successfully', test });
  });

  fastify.delete('/water-quality/tests/:id', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'water_quality_records', 'delete')) return;
    const deleted = await service.deleteTest(request.params.id);
    if (!deleted) return reply.status(404).send({ success: false, message: 'Water quality test record not found' });
    return { success: true, message: 'Water quality test record deleted successfully' };
  });

  fastify.get('/water-quality/latest.geojson', async (request, reply) => {
    if (!await requirePrivilegeInline(request, reply, 'water_quality_records', 'view')) return;
    const geojson = await service.latestGeoJson();
    return reply.header('Content-Type', 'application/json').send(geojson);
  });
}

module.exports = waterQualityRoutes;
