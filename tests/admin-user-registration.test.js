process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/krwmp_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-registration-test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pool = require('../config/database');
const adminService = require('../src/services/admin.service');

const originalQuery = pool.query.bind(pool);

test.after(() => {
  pool.query = originalQuery;
});

function stubRegistrationQueries(assertInsertParams) {
  pool.query = async (sql, params = []) => {
    if (/SELECT id FROM public\.users WHERE identifier/.test(sql)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO public\.users/.test(sql)) {
      assertInsertParams(params);
      return { rows: [{ id: 42 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  };
}

test('admin registration accepts optional email and phone fields', async () => {
  stubRegistrationQueries((params) => {
    assert.equal(params[4], null);
    assert.equal(params[5], null);
  });

  const result = await adminService.registerUser({
    name: 'Test User',
    designation: 'Officer',
    initials: 'TU',
    identifier: 'test-user',
    role_ids: [1],
    password: 'temporary-password',
  });

  assert.equal(result.success, true);
});

test('admin registration stores provided phone number and normalized email', async () => {
  stubRegistrationQueries((params) => {
    assert.equal(params[4], 'person@example.lk');
    assert.equal(params[5], '+94 71 234 5678');
  });

  const result = await adminService.registerUser({
    name: 'Contact User',
    designation: 'Officer',
    initials: 'CU',
    identifier: 'contact-user',
    email: ' Person@Example.LK ',
    phone_number: '+94 71 234 5678',
    role_ids: [1],
    password: 'temporary-password',
  });

  assert.equal(result.success, true);
});

test('admin user contact migration adds nullable email and phone fields', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'database', 'migrations', '20260617_admin_user_contact_fields.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS email text/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS phone_number text/i);
  assert.match(migration, /ALTER COLUMN email DROP NOT NULL/i);
});

test('admin update saves provided phone number and normalized email', async () => {
  pool.query = async (sql, params = []) => {
    assert.match(sql, /email = \$5/);
    assert.match(sql, /phone_number = \$6/);
    assert.equal(params[4], 'editor@example.lk');
    assert.equal(params[5], '077 123 4567');
    assert.equal(params[6], 'existing-user');
    return { rows: [], rowCount: 1 };
  };

  const result = await adminService.updateUser({
    name: 'Existing User',
    designation: 'Officer',
    initials: 'EU',
    identifier: 'Existing-User',
    email: ' Editor@Example.LK ',
    phone_number: '077 123 4567',
  });

  assert.equal(result.success, true);
});

test('admin update can clear existing email', async () => {
  pool.query = async (sql, params = []) => {
    assert.equal(params[4], null);
    assert.equal(params[5], '+94 77 123 4567');
    return { rows: [], rowCount: 1 };
  };

  const result = await adminService.updateUser({
    name: 'Existing User',
    designation: 'Officer',
    initials: 'EU',
    identifier: 'existing-user',
    email: '',
    phone_number: '+94 77 123 4567',
  });

  assert.equal(result.success, true);
});

test('admin update rejects invalid optional email', async () => {
  pool.query = async () => {
    throw new Error('database should not be called for invalid email');
  };

  const result = await adminService.updateUser({
    name: 'Existing User',
    designation: 'Officer',
    initials: 'EU',
    identifier: 'existing-user',
    email: 'not-an-email',
  });

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.message, 'Email format is invalid');
});
