process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/krwmp_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'route-test-secret';
process.env.NODE_ENV = 'test';
process.env.KRWMP_SUPERUSERS = 'master';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'test-account';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || 'test-access-key';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || 'test-secret-key';
process.env.R2_BUCKET = process.env.R2_BUCKET || 'krwmp-test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Fastify = require('fastify');

const pool = require('../config/database');
const { signToken } = require('../src/utils/jwt');
const authService = require('../src/services/auth.service');
const adminService = require('../src/services/admin.service');

const authRoutes = require('../src/routes/auth.routes');
const adminRoutes = require('../src/routes/admin.routes');
const communityIssueRoutes = require('../src/routes/community-issues.routes');
const interventionRoutes = require('../src/routes/intervention.routes');
const institutionRoutes = require('../src/routes/institution.routes');
const knowledgeRoutes = require('../src/routes/knowledge.routes');
const fileAttachmentRoutes = require('../src/routes/file-attachment.routes');
const personRoutes = require('../src/routes/person.routes');
const pollutionSourceRoutes = require('../src/routes/pollution-source.routes');
const rasterLayerRoutes = require('../src/routes/raster-layer.routes');
const reportsRoutes = require('../src/routes/reports.routes');
const spatialRoutes = require('../src/routes/spatial.routes');
const vectorLayerRoutes = require('../src/routes/vector-layer.routes');
const volunteerOrganisationRoutes = require('../src/routes/volunteer-organisation.routes');
const vwmcRoutes = require('../src/routes/vwmc.routes');
const waterQualityRoutes = require('../src/routes/water-quality.routes');
const uploadedFilesRepository = require('../src/services/uploaded-files.repository');
const fileAttachmentService = require('../src/services/file-attachment.service');
const personService = require('../src/services/person.service');
const communityIssuesService = require('../src/services/community-issues.service');
const interventionService = require('../src/services/intervention.service');
const vwmcService = require('../src/services/vwmc.service');

const defaultPoolQuery = pool.query.bind(pool);
const defaultPoolConnect = pool.connect.bind(pool);

function tokenFor(identifier, extra = {}) {
  return signToken({ identifier, username: identifier, name: identifier, ...extra });
}

async function buildApp(routes) {
  const app = Fastify({ logger: false });
  await app.register(require('@fastify/multipart'), { limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
  for (const route of routes) {
    await app.register(route, { prefix: '/api' });
  }
  await app.ready();
  return app;
}

function resetStubs() {
  fileAttachmentService.resetClientForTests();
  pool.query = async () => ({ rows: [], rowCount: 0 });
  pool.connect = async () => ({
    query: pool.query,
    release() {},
  });

  authService.login = async () => ({ success: false, message: 'Invalid credentials' });
  authService.getProfile = async () => null;
  authService.updateProfile = async () => {};

  adminService.getUsers = async () => ({ success: true, users: [] });
  adminService.registerUser = async () => ({ success: true, statusCode: 201 });
  adminService.updateUser = async () => {};
  adminService.deleteUser = async () => ({ success: true });
  adminService.assignRole = async () => {};
  adminService.createRole = async () => ({ id: 1 });
  adminService.updateRole = async () => ({ id: 1 });
  adminService.deleteRole = async () => {};
  adminService.savePrivilege = async () => ({ id: 1 });
  adminService.getRolePrivilegeMatrix = async () => ({ roles: [], privileges: [] });
  adminService.saveRolePrivilegeMatrix = async () => ({ saved: true });
  adminService.resetPassword = async () => {};
}

test.beforeEach(resetStubs);

test.after(() => {
  pool.query = defaultPoolQuery;
  pool.connect = defaultPoolConnect;
});

test('login sets an HttpOnly session cookie and omits the raw JWT from the body', async () => {
  const token = tokenFor('alice');
  authService.login = async (username, password) => {
    assert.equal(username, 'alice');
    assert.equal(password, 'secret');
    return { success: true, token, user: { identifier: 'alice' } };
  };

  const app = await buildApp([authRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/login',
    payload: { username: 'alice', password: 'secret' },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().success, true);
  assert.equal(Object.hasOwn(response.json(), 'token'), false);
  const cookie = response.headers['set-cookie'];
  assert.match(cookie, /krwmp_session=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
});

test('profile accepts bearer JWT auth and uses the token subject as identity', async () => {
  authService.getProfile = async (identifier) => {
    assert.equal(identifier, 'alice');
    return { identifier, name: 'Alice' };
  };

  const app = await buildApp([authRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/profile',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().user, { identifier: 'alice', name: 'Alice' });
});

test('profile accepts the secure session cookie as auth state', async () => {
  authService.getProfile = async (identifier) => ({ identifier });

  const app = await buildApp([authRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/auth/profile',
    headers: { cookie: `krwmp_session=${encodeURIComponent(tokenFor('cookie-user'))}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.identifier, 'cookie-user');
});

test('profile rejects missing and invalid auth tokens', async () => {
  const app = await buildApp([authRoutes]);
  test.after(() => app.close());

  const missing = await app.inject({ method: 'GET', url: '/api/auth/profile' });
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.json().message, 'Authentication required');

  const invalid = await app.inject({
    method: 'GET',
    url: '/api/auth/profile',
    headers: { authorization: 'Bearer not-a-real-token' },
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.json().message, 'Authentication required');
});

test('privileged write routes do not accept X-KRWMP-User as identity', async () => {
  let called = false;
  adminService.updateUser = async () => {
    called = true;
  };

  const app = await buildApp([adminRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/user/update',
    headers: { 'x-krwmp-user': 'master' },
    payload: { targetIdentifier: 'alice' },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(called, false);
});

test('RBAC denies authenticated users without the required privilege', async () => {
  let called = false;
  adminService.getUsers = async () => {
    called = true;
    return { success: true, users: [] };
  };
  pool.query = async (sql, params) => {
    assert.equal(params[0], 'alice');
    assert.equal(params[1], 'user_management_settings');
    assert.equal(params[2], 'view');
    return { rows: [{ allowed: false }], rowCount: 1 };
  };

  const app = await buildApp([adminRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
  });

  assert.equal(response.statusCode, 403);
  assert.match(response.json().message, /user_management_settings:view/);
  assert.equal(called, false);
});

test('RBAC allows authenticated users with the route action privilege', async () => {
  let registerPayload = null;
  adminService.registerUser = async (body) => {
    registerPayload = body;
    return { success: true, statusCode: 201, user: { identifier: body.identifier } };
  };
  pool.query = async (sql, params) => {
    assert.equal(params[0], 'alice');
    assert.equal(params[1], 'user_management_settings');
    assert.equal(params[2], 'create');
    return { rows: [{ allowed: true }], rowCount: 1 };
  };

  const app = await buildApp([adminRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/admin/register',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: { identifier: 'new-user' },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(registerPayload, { identifier: 'new-user' });
});

test('configured superusers bypass database privilege checks', async () => {
  let queryCount = 0;
  pool.query = async () => {
    queryCount += 1;
    throw new Error('superuser should not query privileges');
  };

  const app = await buildApp([adminRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/admin/users',
    headers: { authorization: `Bearer ${tokenFor('master')}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(queryCount, 0);
  assert.equal(response.json().success, true);
});

const protectedSmokeCases = [
  { name: 'admin users', route: adminRoutes, method: 'GET', url: '/api/admin/users' },
  { name: 'community reports', route: communityIssueRoutes, method: 'GET', url: '/api/community-reports' },
  { name: 'intervention registry', route: interventionRoutes, method: 'GET', url: '/api/interventions/registry' },
  { name: 'institutions', route: institutionRoutes, method: 'GET', url: '/api/institutions' },
  { name: 'knowledge dashboard', route: knowledgeRoutes, method: 'GET', url: '/api/knowledge/dashboard' },
  { name: 'file attachments', route: fileAttachmentRoutes, method: 'GET', url: '/api/files/knowledge_resources/record-1' },
  { name: 'person registry', route: personRoutes, method: 'GET', url: '/api/persons/search?q=alice' },
  { name: 'pollution sources', route: pollutionSourceRoutes, method: 'GET', url: '/api/pollution-sources' },
  { name: 'raster layers', route: rasterLayerRoutes, method: 'GET', url: '/api/raster-layers' },
  { name: 'reports export', route: reportsRoutes, method: 'GET', url: '/api/reports/community-complaints' },
  { name: 'spatial basin', route: spatialRoutes, method: 'GET', url: '/api/spatial/basin' },
  { name: 'vector layers', route: vectorLayerRoutes, method: 'GET', url: '/api/vector-layers' },
  { name: 'volunteer organisations', route: volunteerOrganisationRoutes, method: 'GET', url: '/api/volunteer-organisations' },
  { name: 'VWMC committees', route: vwmcRoutes, method: 'GET', url: '/api/vwmc/committees' },
  { name: 'water quality parameters', route: waterQualityRoutes, method: 'GET', url: '/api/water-quality/parameters' },
];

for (const smokeCase of protectedSmokeCases) {
  test(`protected ${smokeCase.name} route fails closed without auth`, async () => {
    const app = await buildApp([smokeCase.route]);
    test.after(() => app.close());

    const response = await app.inject({
      method: smokeCase.method,
      url: smokeCase.url,
    });

    assert.equal(response.statusCode, 401);
    assert.equal(response.json().success, false);
    assert.equal(response.json().message, 'Authentication required');
  });
}

test('critical public read routes stay reachable without auth', async () => {
  const communityService = require('../src/services/community-issues.service');
  const spatialService = require('../src/services/spatial.service');
  const knowledgeService = require('../src/services/knowledge.service');

  communityService.listCategories = async () => [{ id: 1, category_name: 'Waste' }];
  spatialService.identifyLocation = async () => ({ dsd_name: 'DSD', gnd_name: 'GND' });
  knowledgeService.listContent = async () => [{ id: 1, title: 'Public resource' }];

  const app = await buildApp([communityIssueRoutes, spatialRoutes, knowledgeRoutes]);
  test.after(() => app.close());

  const categories = await app.inject({ method: 'GET', url: '/api/issue-categories' });
  assert.equal(categories.statusCode, 200);
  assert.equal(categories.json().categories[0].category_name, 'Waste');

  const identify = await app.inject({ method: 'GET', url: '/api/spatial/identify?lat=7&lng=80' });
  assert.equal(identify.statusCode, 200);
  assert.equal(identify.json().dsd_name, 'DSD');

  const knowledge = await app.inject({ method: 'GET', url: '/api/knowledge?public=true' });
  assert.equal(knowledge.statusCode, 200);
  assert.equal(knowledge.json().resources[0].title, 'Public resource');
});

test('uploaded files repository creates metadata rows with text parent ids', async () => {
  pool.query = async (sql, params) => {
    assert.match(sql, /INSERT INTO public\.uploaded_files/);
    assert.equal(params[0], 'water_quality');
    assert.equal(params[1], '42');
    assert.equal(params[3], 'signed_report_pdf');
    assert.equal(params[10], 128);
    return { rows: [{ id: 'file-1', module_key: params[0], record_id: params[1], attachment_role: params[3], file_size_bytes: params[10] }], rowCount: 1 };
  };

  const row = await uploadedFilesRepository.createUploadedFile({
    module_key: 'water_quality',
    record_id: 42,
    attachment_role: 'signed_report_pdf',
    original_filename: 'report.pdf',
    bucket: 'krwmp',
    object_key: 'attachments/water_quality/42/report.pdf',
    file_size_bytes: 128,
    uploaded_by: 'alice',
  });

  assert.deepEqual(row, { id: 'file-1', module_key: 'water_quality', record_id: '42', attachment_role: 'signed_report_pdf', file_size_bytes: 128 });
});

test('uploaded files repository lists by module and record', async () => {
  pool.query = async (sql, params) => {
    assert.match(sql, /FROM public\.uploaded_files/);
    assert.equal(params[0], 'knowledge_resources');
    assert.equal(params[1], '11111111-1111-4111-8111-111111111111');
    assert.equal(params[2], 'attached');
    return { rows: [{ id: 'file-2', module_key: params[0], record_id: params[1], status: params[2] }], rowCount: 1 };
  };

  const rows = await uploadedFilesRepository.listUploadedFiles({
    module_key: 'knowledge_resources',
    record_id: '11111111-1111-4111-8111-111111111111',
    status: 'attached',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].record_id, '11111111-1111-4111-8111-111111111111');
});

test('uploaded files repository soft deletes rows', async () => {
  pool.query = async (sql, params) => {
    assert.match(sql, /SET status = 'deleted'/);
    assert.equal(params[0], 'file-3');
    assert.equal(params[1], 'alice');
    return { rows: [{ id: params[0], status: 'deleted', deleted_by: params[1] }], rowCount: 1 };
  };

  const row = await uploadedFilesRepository.markUploadedFileDeleted('file-3', 'alice');

  assert.equal(row.status, 'deleted');
  assert.equal(row.deleted_by, 'alice');
});

test('uploaded files migration enables RLS, revokes API roles, and adds lookup indexes', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '20260617_uploaded_files_attachment_service.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.uploaded_files/);
  assert.match(migration, /ALTER TABLE public\.uploaded_files ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.uploaded_files FROM anon/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.uploaded_files FROM authenticated/);
  assert.match(migration, /idx_uploaded_files_module_record_status/);
  assert.match(migration, /idx_uploaded_files_object_key_active/);
});

test('file attachment service creates presigned upload URLs and pending metadata', async () => {
  pool.query = async (sql, params) => {
    assert.match(sql, /INSERT INTO public\.uploaded_files/);
    assert.equal(params[0], 'knowledge_resources');
    assert.equal(params[1], '11111111-1111-4111-8111-111111111111');
    assert.equal(params[3], 'knowledge_file');
    assert.equal(params[6], 'krwmp-test');
    assert.match(params[7], /^attachments\/knowledge_resources\//);
    assert.equal(params[14], 'pending');
    return {
      rows: [{
        id: 'file-upload-1',
        module_key: params[0],
        record_id: params[1],
        attachment_role: params[3],
        original_filename: params[4],
        bucket: params[6],
        object_key: params[7],
        mime_type: params[9],
        status: params[14],
      }],
      rowCount: 1,
    };
  };

  const result = await fileAttachmentService.createPresignedUploadUrl({
    module_key: 'knowledge_resources',
    record_id: '11111111-1111-4111-8111-111111111111',
    record_kind: 'knowledge_content',
    attachment_role: 'knowledge_file',
    original_filename: '../basin report.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 4096,
    expires_in: 120,
  }, 'alice');

  assert.equal(result.attachment.status, 'pending');
  assert.equal(result.upload.method, 'PUT');
  assert.equal(result.upload.headers['Content-Type'], 'application/pdf');
  assert.match(result.upload.url, /^https:\/\/test-account\.r2\.cloudflarestorage\.com\/krwmp-test\//);
  assert.match(result.upload.url, /attachments\/knowledge_resources\/2026\/06\/11111111-1111-4111-8111-111111111111\//);
  assert.match(result.upload.url, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
});

test('file attachment service completes uploads by storing metadata', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push(sql);
    if (String(sql).includes('SELECT *')) {
      return {
        rows: [{
          id: params[0],
          metadata: { source: 'presigned' },
          status: 'pending',
        }],
        rowCount: 1,
      };
    }
    assert.match(sql, /UPDATE public\.uploaded_files/);
    assert.equal(params[0], 'file-upload-2');
    assert.equal(params[6], 2048);
    assert.equal(params[7], 'abc123');
    assert.deepEqual(JSON.parse(params[8]), { source: 'presigned', reviewed: true, completed_by: 'alice' });
    assert.equal(params[10], 'attached');
    return { rows: [{ id: params[0], status: params[10], metadata: JSON.parse(params[8]) }], rowCount: 1 };
  };

  const result = await fileAttachmentService.completeUpload('file-upload-2', {
    file_size_bytes: 2048,
    checksum_sha256: 'abc123',
    mime_type: 'application/pdf',
    metadata: { reviewed: true },
  }, 'alice');

  assert.equal(result.status, 'attached');
  assert.equal(calls.length, 2);
});

test('file attachment service creates presigned download URLs', async () => {
  pool.query = async (sql, params) => {
    assert.match(sql, /SELECT \*/);
    return {
      rows: [{
        id: params[0],
        bucket: 'krwmp-test',
        object_key: 'attachments/knowledge_resources/2026/06/abc/report.pdf',
        original_filename: 'report.pdf',
      }],
      rowCount: 1,
    };
  };

  const result = await fileAttachmentService.createPresignedDownloadUrl('file-download-1', { expires_in: 120 });

  assert.equal(result.download.method, 'GET');
  assert.match(result.download.url, /^https:\/\/test-account\.r2\.cloudflarestorage\.com\/krwmp-test\//);
  assert.match(result.download.url, /attachments\/knowledge_resources\/2026\/06\/abc\/report\.pdf/);
  assert.match(result.download.url, /response-content-disposition=/);
});

test('file attachment service lists and soft deletes attachments through repository', async () => {
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push(sql);
    if (String(sql).includes('SELECT *')) {
      assert.equal(params[0], 'vwmc');
      assert.equal(params[1], '42');
      assert.equal(params[2], 'supporting_document');
      assert.equal(params[3], 'attached');
      return { rows: [{ id: 'file-list-1', module_key: params[0], record_id: params[1] }], rowCount: 1 };
    }
    assert.match(sql, /SET status = 'deleted'/);
    assert.equal(params[0], 'file-list-1');
    assert.equal(params[1], 'alice');
    return { rows: [{ id: params[0], status: 'deleted', deleted_by: params[1] }], rowCount: 1 };
  };

  const rows = await fileAttachmentService.listAttachments({
    module_key: 'vwmc',
    record_id: 42,
    attachment_role: 'supporting_document',
  });
  const deleted = await fileAttachmentService.softDeleteAttachment('file-list-1', 'alice');

  assert.equal(rows[0].record_id, '42');
  assert.equal(deleted.status, 'deleted');
  assert.equal(queries.length, 2);
});

test('file attachment presign route ignores X-KRWMP-User and requires JWT auth', async () => {
  let insertCalled = false;
  pool.query = async (sql) => {
    if (String(sql).includes('INSERT INTO public.uploaded_files')) insertCalled = true;
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/files/presign-upload',
    headers: { 'x-krwmp-user': 'master' },
    payload: {
      module_key: 'knowledge_resources',
      original_filename: 'report.pdf',
      mime_type: 'application/pdf',
    },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(insertCalled, false);
});

test('person registry create route enforces create privilege', async () => {
  let insertCalled = false;
  const privilegeChecks = [];
  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT EXISTS')) {
      assert.equal(params[0], 'alice');
      privilegeChecks.push([params[1], params[2]]);
      return { rows: [{ allowed: false }], rowCount: 1 };
    }
    if (String(sql).includes('INSERT INTO public.persons')) insertCalled = true;
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp([personRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/persons',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: { full_name: 'Alice Perera' },
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(privilegeChecks, [
    ['person_registry', 'create'],
    ['vwmc_management', 'create'],
    ['vwmc_management', 'update'],
    ['intervention_progress_update', 'create'],
    ['intervention_progress_update', 'update'],
  ]);
  assert.equal(insertCalled, false);
});

test('VWMC managers can create persons through the shared selector flow', async () => {
  const privilegeChecks = [];
  let personInserted = false;
  pool.query = async (sql, params) => {
    const statement = String(sql);
    if (statement.includes('SELECT EXISTS')) {
      privilegeChecks.push([params[1], params[2]]);
      return { rows: [{ allowed: params[1] === 'vwmc_management' && params[2] === 'create' }], rowCount: 1 };
    }
    if (statement.includes('INSERT INTO public.persons')) {
      personInserted = true;
      return { rows: [{ id: '550e8400-e29b-41d4-a716-446655440000', full_name: params[0] }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp([personRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/persons',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: { full_name: 'Alice Perera', phone_number: '0712345678' },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().person.id, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(personInserted, true);
  assert.deepEqual(privilegeChecks, [
    ['person_registry', 'create'],
    ['vwmc_management', 'create'],
  ]);
});

test('VWMC member create returns clear validation errors for missing registry fields', async () => {
  const originalHasColumn = pool.query;
  pool.query = async (sql, params) => {
    const statement = String(sql);
    if (statement.includes('SELECT EXISTS')) {
      if (statement.includes('information_schema.columns')) return { rows: [{ exists: true }], rowCount: 1 };
      return { rows: [{ allowed: params[1] === 'vwmc_management' && params[2] === 'create' }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  test.after(() => { pool.query = originalHasColumn; });

  const app = await buildApp([vwmcRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/vwmc/committees/1/members',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: { member_name: 'Alice Perera', member_type: 'village_representative' },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.json().message, /Committee Role is required|Master Person Registry/);
});

test('person profile route enforces view privilege and returns module aggregate', async () => {
  const originalProfile = personService.getPersonProfile;
  test.after(() => { personService.getPersonProfile = originalProfile; });

  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT EXISTS')) {
      assert.equal(params[0], 'alice');
      assert.equal(params[1], 'person_registry');
      assert.equal(params[2], 'view');
      return { rows: [{ allowed: true }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  personService.getPersonProfile = async (id) => {
    assert.equal(id, '550e8400-e29b-41d4-a716-446655440000');
    return {
      person: { id, full_name: 'Alice Perera' },
      linked_user: null,
      vwmc_memberships: [{ committee_name: 'Kelani VWMC' }],
      complaints_reported: [],
      intervention_actions: [],
      volunteer_involvement: [],
      water_quality_involvement: [],
      pollution_involvement: [],
      contact_involvement: [],
    };
  };

  const app = await buildApp([personRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/persons/550e8400-e29b-41d4-a716-446655440000/profile',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().profile.person.full_name, 'Alice Perera');
  assert.equal(response.json().profile.vwmc_memberships.length, 1);
});

test('person promotion route requires person update and user create privileges', async () => {
  const originalPromote = personService.promotePersonToUser;
  test.after(() => { personService.promotePersonToUser = originalPromote; });

  const privilegeChecks = [];
  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT EXISTS')) {
      privilegeChecks.push([params[1], params[2]]);
      return { rows: [{ allowed: true }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  personService.promotePersonToUser = async (id, body) => {
    assert.equal(id, '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(body.identifier, 'alice.user');
    return {
      person: { id, linked_user_id: '42', is_system_user: true },
      user: { id: '42', identifier: 'alice.user' },
    };
  };

  const app = await buildApp([personRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/persons/550e8400-e29b-41d4-a716-446655440000/promote-user',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: { identifier: 'alice.user', password: 'TempPass123', role_id: 1 },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(privilegeChecks, [
    ['person_registry', 'update'],
    ['user_management_settings', 'create'],
  ]);
  assert.equal(response.json().person.is_system_user, true);
});

test('person promotion prevents duplicate user link for already linked person', async () => {
  const originalRegister = adminService.registerUser;
  test.after(() => { adminService.registerUser = originalRegister; });

  let registerCalled = false;
  adminService.registerUser = async () => {
    registerCalled = true;
    return { success: true, userId: 99 };
  };
  pool.query = async (sql) => {
    if (String(sql).includes('FROM public.persons') && String(sql).includes('WHERE id = $1')) {
      return {
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          full_name: 'Alice Perera',
          linked_user_id: '42',
          is_system_user: true,
          status: 'active',
        }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };

  await assert.rejects(
    () => personService.promotePersonToUser('550e8400-e29b-41d4-a716-446655440000', {
      identifier: 'alice.user',
      password: 'TempPass123',
      role_id: 1,
    }),
    /already linked/
  );
  assert.equal(registerCalled, false);
});

test('person duplicate detection normalizes NIC phone and email', async () => {
  pool.query = async (sql, params) => {
    assert.match(sql, /FROM public\.persons/);
    assert.equal(params[0], '123456789V');
    assert.equal(params[1], '0712345678');
    assert.equal(params[2], 'alice@example.com');
    assert.equal(params[3], 'Alice Perera');
    assert.equal(params[4], 'Colombo');
    assert.equal(params[5], 'Kelani');
    return {
      rows: [{
        id: 'person-1',
        full_name: 'Alice Perera',
        match_score: 100,
        match_reasons: ['nic_exact'],
      }],
      rowCount: 1,
    };
  };

  const matches = await personService.detectPossibleDuplicates({
    nic_number: '123456789 v',
    phone_number: '+94712345678',
    email: 'Alice@Example.COM',
    full_name: 'Alice Perera',
    dsd: 'Colombo',
    gnd: 'Kelani',
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].match_score, 100);
});

test('community report links reporter to existing person by phone', async () => {
  let personInsertCalled = false;
  pool.query = async (sql, params) => {
    const statement = String(sql);
    if (statement.includes('FROM public.persons')) {
      assert.equal(params[1], '0712345678');
      return {
        rows: [{
          id: '11111111-1111-4111-8111-111111111111',
          match_score: 90,
          match_reasons: ['phone_exact'],
        }],
        rowCount: 1,
      };
    }
    if (statement.includes('INSERT INTO public.persons')) {
      personInsertCalled = true;
      return { rows: [], rowCount: 0 };
    }
    if (statement.includes('INSERT INTO public.community_issue_reports')) {
      assert.equal(params[5], 'Alice Perera');
      assert.equal(params[6], '+94712345678');
      assert.equal(params[7], 'alice@example.com');
      assert.equal(params[20], '11111111-1111-4111-8111-111111111111');
      return {
        rows: [{ id: 42, report_code: params[0], reporter_person_id: params[20] }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };

  const report = await communityIssuesService.createPublicReport({
    fields: {
      issue_title: 'Blocked drain',
      reporter_name: 'Alice Perera',
      reporter_contact: '+94712345678',
      reporter_email: 'alice@example.com',
      latitude: '7.1',
      longitude: '80.1',
      dsd_name: 'Colombo',
      gnd_name: 'Kelani',
    },
  });

  assert.equal(report.reporter_person_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(personInsertCalled, false);
});

test('intervention actions store responsible person and keep explicit progress', async () => {
  const responsiblePersonId = '550e8400-e29b-41d4-a716-446655440000';
  let recalculated = false;

  pool.query = async (sql, params) => {
    const statement = String(sql);
    if (statement.includes('INSERT INTO public.intervention_action_timeline')) {
      assert.equal(params[0], 12);
      assert.equal(params[5], 60);
      assert.equal(params[8], responsiblePersonId);
      return {
        rows: [{
          id: 5,
          intervention_id: params[0],
          progress_percent: params[5],
          responsible_person_id: params[8],
        }],
        rowCount: 1,
      };
    }
    if (statement.includes('UPDATE public.intervention_registry')) {
      recalculated = true;
      return { rows: [{ progress_percent: 60 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const action = await interventionService.createTimeline(12, {
    action_title: 'Site visit',
    progress_percent: 60,
    responsible_person_id: responsiblePersonId,
    officer_name: 'Alice Perera',
    officer_contact: '0712345678',
  }, 'alice');

  assert.equal(action.responsible_person_id, responsiblePersonId);
  assert.equal(action.progress_percent, 60);
  assert.equal(recalculated, true);
});

test('file attachment presign route enforces module create privilege', async () => {
  let insertCalled = false;
  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT EXISTS')) {
      assert.equal(params[0], 'alice');
      assert.equal(params[1], 'knowledge_portal');
      assert.equal(params[2], 'create');
      return { rows: [{ allowed: false }], rowCount: 1 };
    }
    if (String(sql).includes('INSERT INTO public.uploaded_files')) insertCalled = true;
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/files/presign-upload',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: {
      module_key: 'knowledge_resources',
      original_filename: 'report.pdf',
      mime_type: 'application/pdf',
      expires_in: 120,
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(insertCalled, false);
});

test('file attachment presign route allows constrained public community photos', async () => {
  pool.query = async (sql, params) => {
    assert.match(sql, /INSERT INTO public\.uploaded_files/);
    assert.equal(params[0], 'community_issues');
    assert.equal(params[3], 'report_photo');
    assert.equal(params[9], 'image/webp');
    assert.equal(params[13], 'private');
    assert.equal(params[14], 'pending');
    assert.equal(params[15], 'public');
    return {
      rows: [{
        id: 'public-photo-1',
        module_key: params[0],
        attachment_role: params[3],
        original_filename: params[4],
        bucket: params[6],
        object_key: params[7],
        mime_type: params[9],
        visibility: params[13],
        status: params[14],
      }],
      rowCount: 1,
    };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/files/presign-upload',
    payload: {
      module_key: 'community_issues',
      attachment_role: 'report_photo',
      original_filename: 'issue.webp',
      mime_type: 'image/webp',
      file_size_bytes: 1024,
      visibility: 'public',
      expires_in: 120,
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().attachment.visibility, 'private');
  assert.equal(response.json().attachment.status, 'pending');
});

test('file attachment presign route rejects public non-image community files', async () => {
  let insertCalled = false;
  pool.query = async (sql) => {
    if (String(sql).includes('INSERT INTO public.uploaded_files')) insertCalled = true;
    return { rows: [], rowCount: 0 };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/files/presign-upload',
    payload: {
      module_key: 'community_issues',
      attachment_role: 'report_photo',
      original_filename: 'issue.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 1024,
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(insertCalled, false);
});

test('file attachment presign route creates pending metadata and upload URL', async () => {
  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT EXISTS')) {
      assert.equal(params[0], 'alice');
      assert.equal(params[1], 'knowledge_portal');
      assert.equal(params[2], 'update');
      return { rows: [{ allowed: true }], rowCount: 1 };
    }
    assert.match(sql, /INSERT INTO public\.uploaded_files/);
    assert.equal(params[0], 'knowledge_resources');
    assert.equal(params[1], 'record-1');
    assert.equal(params[3], 'source_document');
    assert.equal(params[14], 'pending');
    assert.equal(params[15], 'alice');
    return {
      rows: [{
        id: 'file-route-1',
        module_key: params[0],
        record_id: params[1],
        attachment_role: params[3],
        original_filename: params[4],
        bucket: params[6],
        object_key: params[7],
        status: params[14],
      }],
      rowCount: 1,
    };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/files/presign-upload',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: {
      module_key: 'knowledge_resources',
      record_id: 'record-1',
      attachment_role: 'source_document',
      original_filename: 'source.pdf',
      mime_type: 'application/pdf',
      expires_in: 120,
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().success, true);
  assert.equal(response.json().attachment.status, 'pending');
  assert.equal(response.json().upload.method, 'PUT');
  assert.match(response.json().upload.url, /X-Amz-Algorithm=AWS4-HMAC-SHA256/);
});

test('file attachment confirm route updates pending metadata after RBAC check', async () => {
  const calls = [];
  pool.query = async (sql, params) => {
    calls.push(String(sql));
    if (String(sql).includes('SELECT *')) {
      return {
        rows: [{
          id: params[0],
          module_key: 'knowledge_resources',
          record_id: null,
          metadata: { source: 'presign' },
          status: 'pending',
        }],
        rowCount: 1,
      };
    }
    if (String(sql).includes('SELECT EXISTS')) {
      assert.equal(params[1], 'knowledge_portal');
      assert.equal(params[2], 'update');
      return { rows: [{ allowed: true }], rowCount: 1 };
    }
    assert.match(sql, /UPDATE public\.uploaded_files/);
    assert.equal(params[0], 'file-route-2');
    assert.equal(params[1], 'record-2');
    assert.equal(params[6], 2048);
    assert.equal(params[10], 'attached');
    return {
      rows: [{
        id: params[0],
        record_id: params[1],
        status: params[10],
        metadata: JSON.parse(params[8]),
      }],
      rowCount: 1,
    };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/files/confirm-upload',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
    payload: {
      file_id: 'file-route-2',
      record_id: 'record-2',
      file_size_bytes: 2048,
      mime_type: 'application/pdf',
      metadata: { checked: true },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().attachment.status, 'attached');
  assert.equal(calls.length, 4);
});

test('file attachment list route returns module record attachments', async () => {
  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT EXISTS')) {
      assert.equal(params[1], 'vwmc_view');
      assert.equal(params[2], 'view');
      return { rows: [{ allowed: true }], rowCount: 1 };
    }
    assert.match(sql, /FROM public\.uploaded_files/);
    assert.equal(params[0], 'vwmc');
    assert.equal(params[1], '42');
    assert.equal(params[2], 'attached');
    return { rows: [{ id: 'file-route-3', module_key: params[0], record_id: params[1] }], rowCount: 1 };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/files/vwmc/42',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().files[0].record_id, '42');
});

test('file attachment download route returns a presigned URL after view privilege', async () => {
  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT *')) {
      return {
        rows: [{
          id: params[0],
          module_key: 'knowledge_resources',
          bucket: 'krwmp-test',
          object_key: 'attachments/knowledge_resources/2026/06/record/report.pdf',
          original_filename: 'report.pdf',
        }],
        rowCount: 1,
      };
    }
    assert.match(sql, /SELECT EXISTS/);
    assert.equal(params[1], 'knowledge_portal');
    assert.equal(params[2], 'view');
    return { rows: [{ allowed: true }], rowCount: 1 };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/files/file-route-4/download?expires_in=120',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().download.method, 'GET');
  assert.match(response.json().download.url, /response-content-disposition=/);
});

test('file attachment delete route soft deletes after delete privilege', async () => {
  pool.query = async (sql, params) => {
    if (String(sql).includes('SELECT *')) {
      return {
        rows: [{
          id: params[0],
          module_key: 'pollution_sources',
          record_id: '99',
          status: 'attached',
        }],
        rowCount: 1,
      };
    }
    if (String(sql).includes('SELECT EXISTS')) {
      assert.equal(params[1], 'pollution_source_management');
      assert.equal(params[2], 'delete');
      return { rows: [{ allowed: true }], rowCount: 1 };
    }
    assert.match(sql, /SET status = 'deleted'/);
    assert.equal(params[0], 'file-route-5');
    assert.equal(params[1], 'alice');
    return { rows: [{ id: params[0], status: 'deleted', deleted_by: params[1] }], rowCount: 1 };
  };

  const app = await buildApp([fileAttachmentRoutes]);
  test.after(() => app.close());

  const response = await app.inject({
    method: 'DELETE',
    url: '/api/files/file-route-5',
    headers: { authorization: `Bearer ${tokenFor('alice')}` },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().attachment.status, 'deleted');
  assert.equal(response.json().attachment.deleted_by, 'alice');
});
