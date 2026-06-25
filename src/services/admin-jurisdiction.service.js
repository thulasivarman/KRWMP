const pool = require('../../config/database');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toNumberArray(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') return value.split(',').map(v => Number(v.trim())).filter(Number.isFinite);
  return [];
}

async function listJurisdictions() {
  const result = await pool.query(`
    SELECT j.id, j.jurisdiction_name, j.jurisdiction_type, j.source_code,
           COALESCE(g.count, 0)::integer AS gnd_count
    FROM public.jurisdictions j
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS count FROM public.jurisdiction_gnds jg WHERE jg.jurisdiction_id = j.id
    ) g ON true
    WHERE j.is_active = true
    ORDER BY j.jurisdiction_type, j.jurisdiction_name;
  `);
  return result.rows;
}

async function listDistricts() {
  const result = await pool.query(`
    SELECT iddistrict, COALESCE(MAX(district_n), 'District ' || iddistrict::text) AS district_name,
           COUNT(DISTINCT iddsd)::integer AS dsd_count
    FROM public.dsd_boundary
    WHERE iddistrict IS NOT NULL
    GROUP BY iddistrict
    ORDER BY district_name;
  `);
  return result.rows;
}

async function listDsds({ iddistrict = null } = {}) {
  const result = await pool.query(`
    SELECT d.iddsd, COALESCE(MAX(d.dsd_n), 'DSD ' || d.iddsd::text) AS dsd_name,
           MAX(d.iddistrict) AS iddistrict,
           COUNT(DISTINCT g.idgnd)::integer AS gnd_count
    FROM public.dsd_boundary d
    LEFT JOIN public.gnd_boundary g ON g.iddsd = d.iddsd
    WHERE d.iddsd IS NOT NULL
      AND ($1::integer IS NULL OR d.iddistrict = $1)
    GROUP BY d.iddsd
    ORDER BY dsd_name;
  `, [Number.isFinite(Number(iddistrict)) ? Number(iddistrict) : null]);
  return result.rows;
}

async function listGnds({ iddistrict = null, iddsd = null, q = null, limit = 1000 } = {}) {
  const result = await pool.query(`
    SELECT DISTINCT g.idgnd, g.gnd_name, g.iddsd, d.dsd_n AS dsd_name, d.iddistrict
    FROM public.gnd_boundary g
    LEFT JOIN public.dsd_boundary d ON d.iddsd = g.iddsd
    WHERE g.idgnd IS NOT NULL
      AND ($1::integer IS NULL OR d.iddistrict = $1)
      AND ($2::integer IS NULL OR g.iddsd = $2)
      AND ($3::text IS NULL OR g.gnd_name ILIKE '%' || $3 || '%')
    ORDER BY d.dsd_n, g.gnd_name
    LIMIT LEAST(GREATEST($4::integer, 1), 5000);
  `, [
    Number.isFinite(Number(iddistrict)) ? Number(iddistrict) : null,
    Number.isFinite(Number(iddsd)) ? Number(iddsd) : null,
    cleanText(q),
    Number(limit || 1000),
  ]);
  return result.rows;
}

async function createJurisdictionFromGnds(body = {}, createdBy = 'system') {
  const ids = [...new Set(toNumberArray(body.idgnds || body.gnd_ids))];
  if (!ids.length) throw new Error('At least one GND must be selected.');
  const name = cleanText(body.jurisdiction_name) || `Custom Jurisdiction - ${new Date().toISOString().slice(0, 10)}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(`
      INSERT INTO public.jurisdictions (jurisdiction_name, jurisdiction_type, source_code, description, is_system_generated, created_by)
      VALUES ($1, 'CUSTOM', NULL, $2, false, $3)
      RETURNING *;
    `, [name, cleanText(body.description), createdBy]);
    for (const idgnd of ids) {
      await client.query('INSERT INTO public.jurisdiction_gnds (jurisdiction_id, idgnd) VALUES ($1, $2) ON CONFLICT DO NOTHING;', [created.rows[0].id, idgnd]);
    }
    await client.query('COMMIT');
    return created.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getUserJurisdictions(userId) {
  const result = await pool.query(`
    SELECT uj.user_id, uj.jurisdiction_id, uj.module_key, uj.access_level,
           j.jurisdiction_name, j.jurisdiction_type
    FROM public.user_jurisdictions uj
    JOIN public.jurisdictions j ON j.id = uj.jurisdiction_id
    WHERE uj.user_id = $1
    ORDER BY j.jurisdiction_type, j.jurisdiction_name;
  `, [userId]);
  return result.rows;
}

async function setUserJurisdictionsByIdentifier(identifier, jurisdictionIds = [], options = {}) {
  const cleanIdentifier = cleanText(identifier)?.toLowerCase();
  if (!cleanIdentifier) throw new Error('User identifier is required.');
  const user = await pool.query('SELECT id FROM public.users WHERE identifier = $1 LIMIT 1;', [cleanIdentifier]);
  if (!user.rows[0]) throw new Error('User not found.');
  const userId = user.rows[0].id;
  const ids = [...new Set(toNumberArray(jurisdictionIds))];
  const moduleKey = cleanText(options.module_key || options.moduleKey);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM public.user_jurisdictions WHERE user_id = $1 AND COALESCE(module_key, \'\') = COALESCE($2, \'\');', [userId, moduleKey]);
    for (const jurisdictionId of ids) {
      await client.query(`
        INSERT INTO public.user_jurisdictions (user_id, jurisdiction_id, module_key, access_level, assigned_by)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING;
      `, [userId, jurisdictionId, moduleKey, cleanText(options.access_level) || 'manage', cleanText(options.assigned_by) || 'system']);
    }
    await client.query('COMMIT');
    return { user_id: userId, assigned: ids.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listJurisdictions, listDistricts, listDsds, listGnds, createJurisdictionFromGnds, getUserJurisdictions, setUserJurisdictionsByIdentifier };