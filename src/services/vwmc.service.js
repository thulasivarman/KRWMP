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

async function listCommittees() {
  const result = await pool.query(`
    SELECT c.*, COALESCE(json_agg(m ORDER BY m.id) FILTER (WHERE m.id IS NOT NULL), '[]') AS members
    FROM public.vwmc_committees c
    LEFT JOIN public.vwmc_members m ON m.committee_id = c.id
    GROUP BY c.id
    ORDER BY c.updated_at DESC, c.committee_name ASC;
  `);
  return result.rows;
}

async function getCommittee(id) {
  const result = await pool.query(`
    SELECT c.*, COALESCE(json_agg(m ORDER BY m.id) FILTER (WHERE m.id IS NOT NULL), '[]') AS members
    FROM public.vwmc_committees c
    LEFT JOIN public.vwmc_members m ON m.committee_id = c.id
    WHERE c.id = $1
    GROUP BY c.id;
  `, [id]);
  return result.rows[0] || null;
}

async function createCommittee(body = {}, username = 'system') {
  const result = await pool.query(`
    INSERT INTO public.vwmc_committees (
      committee_code, committee_name, village_name, dsd_name, gnd_name, address,
      latitude, longitude, status, remarks, created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
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
    username
  ]);
  return result.rows[0];
}

async function updateCommittee(id, body = {}, username = 'system') {
  const result = await pool.query(`
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
        updated_by = $11,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, body.committee_name || null, body.village_name || null, body.dsd_name || null, body.gnd_name || null, body.address || null, body.latitude === undefined ? null : num(body.latitude), body.longitude === undefined ? null : num(body.longitude), body.status || null, body.remarks || null, username]);
  return result.rows[0] || null;
}

async function deleteCommittee(id) {
  const result = await pool.query('DELETE FROM public.vwmc_committees WHERE id = $1 RETURNING id;', [id]);
  return result.rowCount > 0;
}

async function createMember(committeeId, body = {}, username = 'system') {
  const result = await pool.query(`
    INSERT INTO public.vwmc_members (
      committee_id, member_name, member_type, organization, designation, gender,
      phone, email, address, role_in_committee, active, created_by, updated_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$11)
    RETURNING *;
  `, [committeeId, body.member_name, body.member_type || 'village_representative', body.organization || null, body.designation || null, body.gender || null, body.phone || null, body.email || null, body.address || null, body.role_in_committee || null, username]);
  return result.rows[0];
}

async function updateMember(memberId, body = {}, username = 'system') {
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
  `, [memberId, body.member_name || null, body.member_type || null, body.organization || null, body.designation || null, body.gender || null, body.phone || null, body.email || null, body.address || null, body.role_in_committee || null, body.active === undefined ? null : Boolean(body.active), username]);
  return result.rows[0] || null;
}

async function deleteMember(memberId) {
  const result = await pool.query('DELETE FROM public.vwmc_members WHERE id = $1 RETURNING id;', [memberId]);
  return result.rowCount > 0;
}

module.exports = { listCommittees, getCommittee, createCommittee, updateCommittee, deleteCommittee, createMember, updateMember, deleteMember };
