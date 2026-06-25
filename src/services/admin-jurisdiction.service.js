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

module.exports = { listJurisdictions, getUserJurisdictions, setUserJurisdictionsByIdentifier };
