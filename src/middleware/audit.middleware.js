const audit = require('../services/audit-log.service');
const { getRequestUser } = require('./privilege.middleware');

const IMPORTANT_PAGES = new Set([
  '/',
  '/index.html',
  '/map.html',
  '/admin.html',
  '/admin-audit-logs.html',
  '/admin-community-issues.html',
  '/admin-solution-library.html',
  '/admin-raster-layers.html',
  '/admin-vector-layers.html',
  '/institution-management.html',
  '/intervention-library.html',
  '/intervention-registry.html',
  '/knowledge.html',
  '/privilege-group-management.html',
  '/reports.html',
  '/volunteer-organisations.html',
  '/vwmc-management.html',
  '/water-quality-records.html',
  '/pollution-sources.html',
]);

const API_EXCLUSIONS = [
  /^\/api\/login$/,
  /^\/api\/logout$/,
  /^\/api\/auth\/profile$/,
  /^\/api\/admin\/audit\/archive-run$/,
  /^\/api\/community-reports\/\d+$/,
  /^\/api\/community-issue-interventions/,
];

function pathnameFor(request) {
  try {
    return new URL(request.url, 'http://krwmp.local').pathname;
  } catch (_) {
    return String(request.url || '').split('?')[0] || '';
  }
}

function isSuccessful(reply) {
  const code = Number(reply.statusCode || 0);
  return code >= 200 && code < 400;
}

function isImportantPage(pathname) {
  return IMPORTANT_PAGES.has(pathname);
}

function shouldSkipGenericApi(pathname) {
  return API_EXCLUSIONS.some(pattern => pattern.test(pathname));
}

function actionForMethod(method) {
  const verb = String(method || '').toUpperCase();
  if (verb === 'POST') return 'create';
  if (verb === 'PUT' || verb === 'PATCH') return 'update';
  if (verb === 'DELETE') return 'delete';
  return null;
}

function actionForRoute(method, pathname) {
  if (pathname === '/api/files/confirm-upload' && String(method || '').toUpperCase() === 'POST') return 'upload';
  if (/^\/api\/files\/[^/]+\/download$/.test(pathname) && String(method || '').toUpperCase() === 'GET') return 'download';
  if (/^\/api\/files\/[^/]+$/.test(pathname) && String(method || '').toUpperCase() === 'DELETE') return 'soft_delete';
  return actionForMethod(method);
}

function moduleFromPath(pathname = '') {
  const parts = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  return parts[0] || 'api';
}

function summaryFor(action, method, pathname) {
  return `${String(action || '').replace(/_/g, ' ')} ${String(method || '').toUpperCase()} ${pathname}`;
}

function registerAuditMiddleware(fastify) {
  fastify.addHook('onResponse', async (request, reply) => {
    if (!isSuccessful(reply)) return;
    const pathname = pathnameFor(request);

    if (String(request.method || '').toUpperCase() === 'GET' && isImportantPage(pathname)) {
      const username = getRequestUser(request);
      if (!username) return;
      await audit.logPageView({
        request,
        module_name: 'navigation',
        request_url: request.url,
        summary: `Opened ${pathname}`,
        details: { page_path: pathname },
      });
      return;
    }

    if (!pathname.startsWith('/api/') || shouldSkipGenericApi(pathname)) return;
    const action = actionForRoute(request.method, pathname);
    if (!action) return;

    await audit.logActivity({
      request,
      action_type: action,
      module_name: moduleFromPath(pathname),
      request_url: request.url,
      summary: summaryFor(action, request.method, pathname),
      details: {
        params: request.params || null,
        query: request.query || null,
        request_body: request.body || null,
        status_code: reply.statusCode,
      },
    });
  });
}

module.exports = registerAuditMiddleware;
