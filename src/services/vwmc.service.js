const pool = require('../../config/database');

function generateCommitteeCode() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VWMC-${stamp}-${rand}`;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function uuidOrNull(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? value : null;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

let vwmcMemberPersonIdColumnCache;

async function hasVwmcMemberPersonIdColumn(client = pool, { refresh = false } = {}) {
  if (refresh) vwmcMemberPersonIdColumnCache = undefined;
  if (vwmcMemberPersonIdColumnCache !== undefined) return vwmcMemberPersonIdColumnCache;
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vwmc_members'
        AND column_name = 'person_id'
    ) AS exists;
  `);
  vwmcMemberPersonIdColumnCache = Boolean(result.rows[0]?.exists);
  return vwmcMemberPersonIdColumnCache;
}

async function ensureVwmcMemberPersonIdColumn(client = pool) {
  if (await hasVwmcMemberPersonIdColumn(client)) return true;
  try {
    await client.query(`
      ALTER TABLE public.vwmc_members
      ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vwmc_members_person_id
      ON public.vwmc_members(person_id)
      WHERE person_id IS NOT NULL;
    `);
    return hasVwmcMemberPersonIdColumn(client, { refresh: true });
  } catch (error) {
    if (['42P01', '42703', '42830'].includes(error?.code)) {
      vwmcMemberPersonIdColumnCache = false;
      return false;
    }
    throw error;
  }
}

function toTextArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(cleanText).filter(Boolean);
    } catch (_) {
      return value.split(',').map(cleanText).filter(Boolean);
    }
  }
  return [];
}

function authorizedGndsFromBody(body = {}) {
  const selected = toTextArray(body.authorized_gnds || body.authorizedGnds);
  return Array.from(new Set([cleanText(body.gnd_name), ...selected].filter(Boolean)));
}

function authorizedGndNames(rows = []) {
  const values = typeof rows === 'string' ? toTextArray(rows) : rows;
  if (!Array.isArray(values)) return [];
  return values
    .map(row => (typeof row === 'string' ? cleanText(row) : cleanText(row?.gnd_name)))
    .filter(Boolean);
}

function assertMemberPayload(body = {}, { requirePerson = false } = {}) {
  if (!cleanText(body.member_name) || cleanText(body.member_name).length < 3) {
    const error = new Error('Member name is required and must be at least 3 characters.');
    error.statusCode = 400;
    throw error;
  }
  if (!cleanText(body.role_in_committee || body.committee_role)) {
    const error = new Error('Committee Role is required.');
    error.statusCode = 400;
    throw error;
  }
  if (requirePerson && !uuidOrNull(body.person_id)) {
    const error = new Error('Select or create a person from the Master Person Registry before saving this member.');
    error.statusCode = 400;
    throw error;
  }
}

async function replaceAuthorizedGnds(client, committeeId, body = {}) {
  const gnds = authorizedGndsFromBody(body);
  await client.query('DELETE FROM public.vwmc_authorized_gnds WHERE vwmc_id = $1;', [committeeId]);
  for (const gndName of gnds) {
    await client.query(`
      INSERT INTO public.vwmc_authorized_gnds (vwmc_id, dsd_name, gnd_name)
      VALUES ($1, $2, $3)
      ON CONFLICT (vwmc_id, gnd_name) DO NOTHING;
    `, [committeeId, cleanText(body.dsd_name), gndName]);
  }
}

function committeeSelectSql(where = '', includePersonRegistry = true) {
  const memberJson = includePersonRegistry ? `
        to_jsonb(m) || jsonb_build_object(
          'committee_role', m.role_in_committee,
          'person_full_name', p.full_name,
          'person_phone_number', p.phone_number,
          'person_email', p.email,
          'person_dsd', p.dsd,
          'person_gnd', p.gnd,
          'person_nic_number', p.nic_number
        )
      ` : `
        to_jsonb(m) || jsonb_build_object(
          'committee_role', m.role_in_committee,
          'person_id', NULL,
          'person_full_name', NULL,
          'person_phone_number', NULL,
          'person_email', NULL,
          'person_dsd', NULL,
          'person_gnd', NULL,
          'person_nic_number', NULL
        )
      `;
  const personJoin = includePersonRegistry ? 'LEFT JOIN public.persons p ON p.id = m.person_id' : '';
  return `
    SELECT c.*,
      COALESCE(members.members, '[]'::jsonb) AS members,
      COALESCE(authorized.authorized_gnds, '[]'::jsonb) AS authorized_gnds
    FROM public.vwmc_committees c
    LEFT JOIN LATERAL (
      SELECT jsonb_agg((${memberJson}) ORDER BY m.id) AS members
      FROM public.vwmc_members m
      ${personJoin}
      WHERE m.committee_id = c.id AND m.active = true
    ) members ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ag.id,
          'dsd_name', ag.dsd_name,
          'gnd_name', ag.gnd_name,
          'gnd_code', ag.gnd_code
        )
        ORDER BY ag.gnd_name
      ) AS authorized_gnds
      FROM public.vwmc_authorized_gnds ag
      WHERE ag.vwmc_id = c.id
    ) authorized ON true
    ${where}
  `;
}

async function listCommittees() {
  const result = await pool.query(`${committeeSelectSql('', await hasVwmcMemberPersonIdColumn())} ORDER BY c.updated_at DESC, c.committee_name ASC;`);
  return result.rows;
}

async function getCommittee(id) {
  const result = await pool.query(`${committeeSelectSql('WHERE c.id = $1', await hasVwmcMemberPersonIdColumn())};`, [id]);
  return result.rows[0] || null;
}

async function createCommittee(body = {}, username = 'system') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO public.vwmc_committees (
        committee_code, committee_name, village_name, dsd_name, gnd_name, address,
        latitude, longitude, status, remarks, sub_watershed_id, sub_watershed_name, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      RETURNING *;
    `, [
      body.committee_code || generateCommitteeCode(),
      body.committee_name,
      body.village_name || null,
      body.dsd_name || null,
      body.gnd_name || null,
      body.address || null,
      num(body.latitude),
      num(body.longitude),
      body.status || 'active',
      body.remarks || null,
      uuidOrNull(body.sub_watershed_id),
      body.sub_watershed_name || null,
      username,
    ]);
    await replaceAuthorizedGnds(client, result.rows[0].id, body);
    await client.query('COMMIT');
    return getCommittee(result.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateCommittee(id, body = {}, username = 'system') {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE public.vwmc_committees
      SET committee_name = COALESCE($2, committee_name),
          village_name = COALESCE($3, village_name),
          dsd_name = COALESCE($4, dsd_name),
          gnd_name = COALESCE($5, gnd_name),
          address = COALESCE($6, address),
          latitude = COALESCE($7, latitude),
          longitude = COALESCE($8, longitude),
          status = COALESCE($9, status),
          remarks = COALESCE($10, remarks),
          sub_watershed_id = $11,
          sub_watershed_name = COALESCE($12, sub_watershed_name),
          updated_by = $13,
          updated_at = now()
      WHERE id = $1
      RETURNING *;
    `, [id, body.committee_name || null, body.village_name || null, body.dsd_name || null, body.gnd_name || null, body.address || null, body.latitude === undefined ? null : num(body.latitude), body.longitude === undefined ? null : num(body.longitude), body.status || null, body.remarks || null, uuidOrNull(body.sub_watershed_id), body.sub_watershed_name || null, username]);
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    if (body.authorized_gnds !== undefined || body.authorizedGnds !== undefined || body.gnd_name !== undefined) {
      await replaceAuthorizedGnds(client, id, body);
    }
    await client.query('COMMIT');
    return getCommittee(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteCommittee(id) {
  const result = await pool.query('DELETE FROM public.vwmc_committees WHERE id = $1 RETURNING id;', [id]);
  return result.rowCount > 0;
}

async function createMember(committeeId, body = {}, username = 'system') {
  const hasPersonId = await ensureVwmcMemberPersonIdColumn();
  assertMemberPayload(body, { requirePerson: hasPersonId });
  if (!hasPersonId) {
    const result = await pool.query(`
      INSERT INTO public.vwmc_members (
        committee_id, member_name, member_type, organization, designation, gender,
        phone, email, address, role_in_committee, active, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$11)
      RETURNING *;
    `, [committeeId, body.member_name, body.member_type || 'village_representative', body.organization || null, body.designation || null, body.gender || null, body.phone || null, body.email || null, body.address || null, body.role_in_committee || body.committee_role || null, username]);
    return { ...result.rows[0], person_id: null };
  }
  const result = await pool.query(`
    INSERT INTO public.vwmc_members (
      committee_id, member_name, member_type, organization, designation, gender,
      phone, email, address, role_in_committee, person_id, active, created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12,$12)
    RETURNING *;
  `, [committeeId, body.member_name, body.member_type || 'village_representative', body.organization || null, body.designation || null, body.gender || null, body.phone || null, body.email || null, body.address || null, body.role_in_committee || body.committee_role || null, uuidOrNull(body.person_id), username]);
  return result.rows[0];
}

async function updateMember(memberId, body = {}, username = 'system') {
  const hasPersonId = await ensureVwmcMemberPersonIdColumn();
  assertMemberPayload(body, { requirePerson: false });
  if (!hasPersonId) {
    const result = await pool.query(`
      UPDATE public.vwmc_members
      SET member_name = COALESCE($2, member_name),
          member_type = COALESCE($3, member_type),
          organization = COALESCE($4, organization),
          designation = COALESCE($5, designation),
          gender = COALESCE($6, gender),
          phone = COALESCE($7, phone),
          email = COALESCE($8, email),
          address = COALESCE($9, address),
          role_in_committee = COALESCE($10, role_in_committee),
          active = COALESCE($11, active),
          updated_by = $12,
          updated_at = now()
      WHERE id = $1
      RETURNING *;
    `, [memberId, body.member_name || null, body.member_type || null, body.organization || null, body.designation || null, body.gender || null, body.phone || null, body.email || null, body.address || null, body.role_in_committee || body.committee_role || null, body.active === undefined ? null : Boolean(body.active), username]);
    return result.rows[0] ? { ...result.rows[0], person_id: null } : null;
  }
  const result = await pool.query(`
    UPDATE public.vwmc_members
    SET member_name = COALESCE($2, member_name),
        member_type = COALESCE($3, member_type),
        organization = COALESCE($4, organization),
        designation = COALESCE($5, designation),
        gender = COALESCE($6, gender),
        phone = COALESCE($7, phone),
        email = COALESCE($8, email),
        address = COALESCE($9, address),
        role_in_committee = COALESCE($10, role_in_committee),
        person_id = COALESCE($11, person_id),
        active = COALESCE($12, active),
        updated_by = $13,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [memberId, body.member_name || null, body.member_type || null, body.organization || null, body.designation || null, body.gender || null, body.phone || null, body.email || null, body.address || null, body.role_in_committee || body.committee_role || null, body.person_id === undefined ? null : uuidOrNull(body.person_id), body.active === undefined ? null : Boolean(body.active), username]);
  return result.rows[0] || null;
}

async function deleteMember(memberId) {
  const result = await pool.query('DELETE FROM public.vwmc_members WHERE id = $1 RETURNING id;', [memberId]);
  return result.rowCount > 0;
}

async function getCommitteeDetails(id) {
  const committee = await getCommittee(id);
  if (!committee) return null;
  const gnds = authorizedGndNames(committee.authorized_gnds);
  let interventions = [];
  let complaints = [];
  try {
    const result = await pool.query(`
      SELECT id, intervention_code, intervention_title, status, priority, progress_percent,
             lead_officer_name, planned_start_date, planned_end_date, actual_start_date, actual_end_date
      FROM public.intervention_registry
      WHERE ($1::text[] IS NOT NULL AND gnd_name = ANY($1::text[]))
         OR implementing_office ILIKE '%' || $2 || '%'
      ORDER BY updated_at DESC
      LIMIT 50;
    `, [gnds.length ? gnds : null, committee.committee_name || '']);
    interventions = result.rows;
  } catch (_) {
    interventions = [];
  }
  try {
    const result = await pool.query(`
      SELECT r.id, r.report_code, r.issue_title, r.description, r.status, r.submitted_at,
             r.gnd_name, c.category_name, si.issue_name,
             linked.intervention_id, linked.intervention_title, linked.intervention_status
      FROM public.community_issue_reports r
      LEFT JOIN public.issue_categories c ON c.id = r.category_id
      LEFT JOIN public.specific_issues si ON si.id = r.issue_id
      LEFT JOIN LATERAL (
        SELECT cim.intervention_id, ir.intervention_title, ir.status AS intervention_status
        FROM public.complaint_intervention_mapping cim
        JOIN public.intervention_registry ir ON ir.id = cim.intervention_id
        WHERE cim.report_id = r.id
        ORDER BY cim.linked_at DESC
        LIMIT 1
      ) linked ON true
      WHERE $1::text[] IS NOT NULL
        AND r.gnd_name = ANY($1::text[])
      ORDER BY r.submitted_at DESC
      LIMIT 100;
    `, [gnds.length ? gnds : null]);
    complaints = result.rows;
  } catch (_) {
    complaints = [];
  }
  return { ...committee, interventions, complaints };
}

module.exports = {
  listCommittees,
  getCommittee,
  getCommitteeDetails,
  createCommittee,
  updateCommittee,
  deleteCommittee,
  createMember,
  updateMember,
  deleteMember,
};
