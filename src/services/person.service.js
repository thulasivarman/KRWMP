const pool = require('../../config/database');
const adminService = require('./admin.service');

const PERSON_FIELDS = [
  'full_name',
  'preferred_name',
  'nic_number',
  'phone_number',
  'email',
  'gender',
  'date_of_birth',
  'address',
  'dsd',
  'gnd',
  'status',
];

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeEmail(value) {
  const email = cleanText(value);
  return email ? email.toLowerCase() : null;
}

function normalizeNic(value) {
  const nic = cleanText(value);
  return nic ? nic.replace(/\s+/g, '').toUpperCase() : null;
}

function normalizePhone(value) {
  const phone = cleanText(value);
  if (!phone) return null;
  const compact = phone.replace(/[\s()-]/g, '');
  if (/^\+94\d{9}$/.test(compact)) return `0${compact.slice(3)}`;
  if (/^94\d{9}$/.test(compact)) return `0${compact.slice(2)}`;
  return compact;
}

function normalizePersonPayload(body = {}) {
  const person = {};
  for (const field of PERSON_FIELDS) {
    if (body[field] === undefined) continue;
    if (field === 'email') person[field] = normalizeEmail(body[field]);
    else if (field === 'nic_number') person[field] = normalizeNic(body[field]);
    else if (field === 'phone_number') person[field] = normalizePhone(body[field]);
    else person[field] = cleanText(body[field]);
  }
  if (body.linked_user_id !== undefined) person.linked_user_id = cleanText(body.linked_user_id);
  if (body.is_system_user !== undefined) person.is_system_user = Boolean(body.is_system_user);
  return person;
}

function assertCreatePayload(person) {
  if (!person.full_name || person.full_name.length < 2) {
    const error = new Error('Full name is required.');
    error.statusCode = 400;
    throw error;
  }
}

function initialsFromName(name = '') {
  return String(name || '')
    .split(/\s+/)
    .map(part => part[0])
    .filter(Boolean)
    .join('')
    .slice(0, 4)
    .toUpperCase() || 'USR';
}

function buildUpdateSet(person) {
  const entries = Object.entries(person);
  if (!entries.length) {
    const error = new Error('No person fields supplied.');
    error.statusCode = 400;
    throw error;
  }
  const assignments = entries.map(([field], index) => `${field} = $${index + 2}`);
  return {
    assignments: [...assignments, 'updated_at = now()'].join(', '),
    values: entries.map(([, value]) => value),
  };
}

async function createPerson(body = {}) {
  const person = normalizePersonPayload(body);
  assertCreatePayload(person);
  const result = await pool.query(`
    INSERT INTO public.persons (
      full_name, preferred_name, nic_number, phone_number, email, gender,
      date_of_birth, address, dsd, gnd, status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,'active'))
    RETURNING *;
  `, [
    person.full_name,
    person.preferred_name || null,
    person.nic_number || null,
    person.phone_number || null,
    person.email || null,
    person.gender || null,
    person.date_of_birth || null,
    person.address || null,
    person.dsd || null,
    person.gnd || null,
    person.status || null,
  ]);
  return result.rows[0];
}

async function updatePerson(id, body = {}) {
  const person = normalizePersonPayload(body);
  const { assignments, values } = buildUpdateSet(person);
  const result = await pool.query(`
    UPDATE public.persons
    SET ${assignments}
    WHERE id = $1 AND status <> 'deleted'
    RETURNING *;
  `, [id, ...values]);
  return result.rows[0] || null;
}

async function getPerson(id) {
  const result = await pool.query(`
    SELECT *
    FROM public.persons
    WHERE id = $1 AND status <> 'deleted';
  `, [id]);
  return result.rows[0] || null;
}

async function optionalRows(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result.rows;
  } catch (error) {
    if (['42P01', '42703', '42883'].includes(error?.code)) return [];
    throw error;
  }
}

async function getLinkedUser(person = {}) {
  if (!person.linked_user_id) return null;
  const rows = await optionalRows(`
    SELECT u.id, u.identifier, u.name, u.designation, u.email, u.phone_number, r.role_name
    FROM public.users u
    LEFT JOIN public.roles r ON r.id = u.role_id
    WHERE u.id::text = $1::text OR u.identifier = $1::text
    LIMIT 1;
  `, [person.linked_user_id]);
  return rows[0] || null;
}

async function getPersonProfile(id) {
  const person = await getPerson(id);
  if (!person) return null;

  const name = person.full_name || '';
  const phone = person.phone_number || '';
  const email = person.email || '';

  const [
    linkedUser,
    vwmcMemberships,
    complaintsReported,
    interventionActions,
    volunteerInvolvement,
    waterQualityInvolvement,
    pollutionInvolvement,
    contactInvolvement,
  ] = await Promise.all([
    getLinkedUser(person),
    optionalRows(`
      SELECT
        m.id AS membership_id,
        m.committee_id,
        m.member_name,
        m.member_type,
        m.organization,
        m.designation,
        m.role_in_committee,
        m.phone,
        m.email,
        m.active,
        c.committee_code,
        c.committee_name,
        c.village_name,
        c.dsd_name,
        c.gnd_name,
        c.status AS committee_status
      FROM public.vwmc_members m
      JOIN public.vwmc_committees c ON c.id = m.committee_id
      WHERE m.person_id = $1
      ORDER BY m.active DESC, c.committee_name ASC, m.id DESC
      LIMIT 50;
    `, [id]),
    optionalRows(`
      SELECT
        r.id,
        r.report_code,
        r.issue_title,
        r.status,
        r.severity_level,
        r.location_description,
        r.dsd_name,
        r.gnd_name,
        r.submitted_at,
        c.category_name,
        si.issue_name
      FROM public.community_issue_reports r
      LEFT JOIN public.issue_categories c ON c.id = r.category_id
      LEFT JOIN public.specific_issues si ON si.id = r.issue_id
      WHERE r.reporter_person_id = $1
      ORDER BY r.submitted_at DESC
      LIMIT 50;
    `, [id]),
    optionalRows(`
      SELECT
        t.id AS action_id,
        t.intervention_id,
        t.action_date,
        t.action_title,
        t.action_description,
        t.action_status,
        t.progress_percent,
        t.officer_name,
        t.officer_contact,
        r.intervention_code,
        r.intervention_title,
        r.status AS intervention_status,
        r.progress_percent AS intervention_progress_percent,
        r.implementing_office,
        officer.designation,
        officer.institution,
        officer.responsibility
      FROM public.intervention_action_timeline t
      JOIN public.intervention_registry r ON r.id = t.intervention_id
      LEFT JOIN LATERAL (
        SELECT o.designation, o.institution, o.responsibility
        FROM public.intervention_officers o
        WHERE o.intervention_id = t.intervention_id
          AND (
            lower(COALESCE(o.officer_name, '')) = lower(COALESCE(t.officer_name, $2, ''))
            OR COALESCE(o.phone, '') = COALESCE(t.officer_contact, $3, '')
          )
        ORDER BY o.active DESC, o.updated_at DESC NULLS LAST, o.created_at DESC
        LIMIT 1
      ) officer ON true
      WHERE t.responsible_person_id = $1
      ORDER BY t.action_date DESC, t.created_at DESC
      LIMIT 50;
    `, [id, name, phone]),
    optionalRows(`
      SELECT *
      FROM (
        SELECT
          v.id AS organisation_id,
          COALESCE(i.institution_name, i.institution_code, 'Volunteer Organisation') AS organisation_name,
          v.organisation_category,
          v.approval_status,
          v.registration_status,
          i.contact_person,
          i.contact_phone,
          i.contact_email,
          i.dsd_name,
          i.gnd_name,
          'organisation_contact'::text AS involvement_type
        FROM public.volunteer_organisation_profiles v
        JOIN public.intervention_institutions i ON i.id = v.institution_id
        WHERE lower(COALESCE(i.contact_person, '')) = lower($1)
          OR COALESCE(i.contact_phone, '') = $2
          OR lower(COALESCE(i.contact_email, '')) = lower($3)
        UNION ALL
        SELECT
          v.id AS organisation_id,
          COALESCE(i.institution_name, i.institution_code, 'Volunteer Organisation') AS organisation_name,
          v.organisation_category,
          v.approval_status,
          v.registration_status,
          vc.contact_name AS contact_person,
          vc.phone AS contact_phone,
          vc.email AS contact_email,
          i.dsd_name,
          i.gnd_name,
          COALESCE(vc.designation, 'volunteer_contact') AS involvement_type
        FROM public.volunteer_contacts vc
        JOIN public.volunteer_organisation_profiles v ON v.id = vc.volunteer_org_id
        JOIN public.intervention_institutions i ON i.id = v.institution_id
        WHERE vc.active = true
          AND (
            lower(COALESCE(vc.contact_name, '')) = lower($1)
            OR COALESCE(vc.phone, '') = $2
            OR lower(COALESCE(vc.email, '')) = lower($3)
          )
      ) involvement
      ORDER BY organisation_name ASC
      LIMIT 50;
    `, [name, phone, email]),
    optionalRows(`
      SELECT id, sample_code, sample_location_name, sample_collection_datetime, collected_by, overall_status, dsd_name, gnd_name
      FROM public.water_quality_tests
      WHERE lower(COALESCE(collected_by, '')) = lower($1)
      ORDER BY sample_collection_datetime DESC, created_at DESC
      LIMIT 50;
    `, [name]),
    optionalRows(`
      SELECT
        m.id AS monitoring_id,
        ps.id AS pollution_source_id,
        ps.source_code,
        ps.source_name,
        ps.status,
        ps.dsd_name,
        ps.gnd_name,
        m.inspection_date,
        m.inspected_by,
        m.inspection_agency,
        m.follow_up_status,
        m.observation_summary
      FROM public.pollution_source_monitoring m
      JOIN public.pollution_sources ps ON ps.id = m.pollution_source_id
      WHERE lower(COALESCE(m.inspected_by, '')) = lower($1)
      ORDER BY m.inspection_date DESC, m.created_at DESC
      LIMIT 50;
    `, [name]),
    optionalRows(`
      SELECT id, institution_name, institution_code, institution_type, contact_person, contact_phone, contact_email, dsd_name, gnd_name, active
      FROM public.intervention_institutions
      WHERE lower(COALESCE(contact_person, '')) = lower($1)
        OR COALESCE(contact_phone, '') = $2
        OR lower(COALESCE(contact_email, '')) = lower($3)
      ORDER BY institution_name ASC
      LIMIT 50;
    `, [name, phone, email]),
  ]);

  return {
    person,
    linked_user: linkedUser,
    vwmc_memberships: vwmcMemberships,
    complaints_reported: complaintsReported,
    intervention_actions: interventionActions,
    volunteer_involvement: volunteerInvolvement,
    water_quality_involvement: waterQualityInvolvement,
    pollution_involvement: pollutionInvolvement,
    contact_involvement: contactInvolvement,
  };
}

async function searchPersons({ q = '', limit = 20 } = {}) {
  const query = cleanText(q);
  const cappedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  if (!query) {
    const result = await pool.query(`
      SELECT *
      FROM public.persons
      WHERE status <> 'deleted'
      ORDER BY updated_at DESC, full_name ASC
      LIMIT $1;
    `, [cappedLimit]);
    return result.rows;
  }
  const phone = normalizePhone(query);
  const email = normalizeEmail(query);
  const nic = normalizeNic(query);
  const like = `%${query.toLowerCase()}%`;
  const result = await pool.query(`
    SELECT *
    FROM public.persons
    WHERE status <> 'deleted'
      AND (
        lower(full_name) LIKE $1
        OR lower(COALESCE(preferred_name, '')) LIKE $1
        OR upper(COALESCE(nic_number, '')) = $2
        OR COALESCE(phone_number, '') = $3
        OR lower(COALESCE(email, '')) = $4
      )
    ORDER BY
      CASE
        WHEN upper(COALESCE(nic_number, '')) = $2 THEN 1
        WHEN COALESCE(phone_number, '') = $3 THEN 2
        WHEN lower(COALESCE(email, '')) = $4 THEN 3
        ELSE 4
      END,
      full_name ASC
    LIMIT $5;
  `, [like, nic || '', phone || '', email || '', cappedLimit]);
  return result.rows;
}

async function detectPossibleDuplicates(body = {}) {
  const person = normalizePersonPayload(body);
  const result = await pool.query(`
    SELECT *,
      CASE
        WHEN $1::text IS NOT NULL AND upper(COALESCE(nic_number, '')) = $1 THEN 100
        WHEN $2::text IS NOT NULL AND COALESCE(phone_number, '') = $2 THEN 90
        WHEN $3::text IS NOT NULL AND lower(COALESCE(email, '')) = $3 THEN 85
        WHEN $4::text IS NOT NULL
          AND lower(full_name) = lower($4)
          AND COALESCE(dsd, '') = COALESCE($5, '')
          AND COALESCE(gnd, '') = COALESCE($6, '') THEN 70
        ELSE 0
      END AS match_score,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN $1::text IS NOT NULL AND upper(COALESCE(nic_number, '')) = $1 THEN 'nic_exact' END,
        CASE WHEN $2::text IS NOT NULL AND COALESCE(phone_number, '') = $2 THEN 'phone_exact' END,
        CASE WHEN $3::text IS NOT NULL AND lower(COALESCE(email, '')) = $3 THEN 'email_exact' END,
        CASE WHEN $4::text IS NOT NULL
          AND lower(full_name) = lower($4)
          AND COALESCE(dsd, '') = COALESCE($5, '')
          AND COALESCE(gnd, '') = COALESCE($6, '') THEN 'name_dsd_gnd_exact' END
      ], NULL) AS match_reasons
    FROM public.persons
    WHERE status <> 'deleted'
      AND (
        ($1::text IS NOT NULL AND upper(COALESCE(nic_number, '')) = $1)
        OR ($2::text IS NOT NULL AND COALESCE(phone_number, '') = $2)
        OR ($3::text IS NOT NULL AND lower(COALESCE(email, '')) = $3)
        OR ($4::text IS NOT NULL
          AND lower(full_name) = lower($4)
          AND COALESCE(dsd, '') = COALESCE($5, '')
          AND COALESCE(gnd, '') = COALESCE($6, ''))
      )
    ORDER BY match_score DESC, updated_at DESC
    LIMIT 20;
  `, [
    person.nic_number || null,
    person.phone_number || null,
    person.email || null,
    person.full_name || null,
    person.dsd || null,
    person.gnd || null,
  ]);
  return result.rows;
}

async function linkPersonToUser(id, linkedUserId) {
  const userId = cleanText(linkedUserId);
  if (!userId) {
    const error = new Error('linked_user_id is required.');
    error.statusCode = 400;
    throw error;
  }
  const current = await getPerson(id);
  if (!current) return null;
  if (current.linked_user_id && String(current.linked_user_id) !== String(userId)) {
    const error = new Error('This person is already linked to a different system user.');
    error.statusCode = 409;
    throw error;
  }
  const existingLink = await pool.query(`
    SELECT id
    FROM public.persons
    WHERE linked_user_id = $1
      AND id <> $2
      AND status <> 'deleted'
    LIMIT 1;
  `, [userId, id]);
  if (existingLink.rows.length > 0) {
    const error = new Error('This system user is already linked to another person.');
    error.statusCode = 409;
    throw error;
  }
  const result = await pool.query(`
    UPDATE public.persons
    SET linked_user_id = $2,
        is_system_user = true,
        updated_at = now()
    WHERE id = $1 AND status <> 'deleted'
    RETURNING *;
  `, [id, userId]);
  return result.rows[0] || null;
}

async function promotePersonToUser(id, body = {}) {
  const person = await getPerson(id);
  if (!person) {
    const error = new Error('Person not found.');
    error.statusCode = 404;
    throw error;
  }
  if (person.linked_user_id || person.is_system_user) {
    const error = new Error('This person is already linked to a system user.');
    error.statusCode = 409;
    throw error;
  }

  const identifier = cleanText(body.identifier || body.username);
  const password = cleanText(body.password || body.temporary_password);
  const roleId = cleanText(body.role_id);
  if (!identifier || !password || !roleId) {
    const error = new Error('Username, password, and user group are required.');
    error.statusCode = 400;
    throw error;
  }

  const registerResult = await adminService.registerUser({
    name: body.name || person.full_name,
    designation: body.designation || 'System User',
    initials: body.initials || initialsFromName(person.full_name),
    identifier,
    email: body.email === undefined ? person.email : body.email,
    phone_number: body.phone_number === undefined ? person.phone_number : body.phone_number,
    role_id: roleId,
    role_ids: body.role_ids || [roleId],
    institution_id: body.institution_id || null,
    password,
  });

  if (!registerResult.success) {
    const error = new Error(registerResult.message || 'Unable to create system user.');
    error.statusCode = registerResult.statusCode || 400;
    throw error;
  }

  const userId = cleanText(registerResult.userId);
  const linked = await linkPersonToUser(id, userId);
  return {
    person: linked,
    user: {
      id: userId,
      identifier: identifier.trim().toLowerCase(),
      name: body.name || person.full_name,
      email: body.email === undefined ? person.email : body.email,
      phone_number: body.phone_number === undefined ? person.phone_number : body.phone_number,
    },
  };
}

async function deactivatePerson(id) {
  const result = await pool.query(`
    UPDATE public.persons
    SET status = 'inactive',
        updated_at = now()
    WHERE id = $1 AND status <> 'deleted'
    RETURNING *;
  `, [id]);
  return result.rows[0] || null;
}

module.exports = {
  createPerson,
  updatePerson,
  getPerson,
  getPersonProfile,
  searchPersons,
  detectPossibleDuplicates,
  linkPersonToUser,
  promotePersonToUser,
  deactivatePerson,
  normalizePhone,
  normalizeEmail,
  normalizeNic,
};
