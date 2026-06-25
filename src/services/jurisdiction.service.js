const pool = require('../../config/database');
const { isMasterAdmin } = require('../middleware/privilege.middleware');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function toInt(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function toIntArray(value) {
  if (Array.isArray(value)) return value.map(toInt).filter(Number.isInteger);
  if (typeof value === 'string') return value.split(',').map(v => toInt(v.trim())).filter(Number.isInteger);
  return [];
}

async function resolveIdgndFromPoint(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const result = await pool.query(`
    SELECT idgnd
    FROM public.gnd_boundary
    WHERE geom IS NOT NULL
      AND ST_Contains(geom, ST_SetSRID(ST_MakePoint($2::double precision, $1::double precision), 4326))
    ORDER BY area_ha ASC NULLS LAST
    LIMIT 1;
  `, [lat, lng]);
  return result.rows[0]?.idgnd || null;
}

async function listJurisdictions({ type = null, q = null, activeOnly = true } = {}) {
  const result = await pool.query(`
    SELECT j.*,
           COALESCE(g.gnd_count, 0)::integer AS gnd_count
    FROM public.jurisdictions j
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS gnd_count
      FROM public.jurisdiction_gnds jg
      WHERE jg.jurisdiction_id = j.id
    ) g ON true
    WHERE ($1::text IS NULL OR j.jurisdiction_type = $1)
      AND ($2::text IS NULL OR j.jurisdiction_name ILIKE '%' || $2 || '%')
      AND ($3::boolean = false OR j.is_active = true)
    ORDER BY j.jurisdiction_type, j.jurisdiction_name;
  `, [cleanText(type), cleanText(q), Boolean(activeOnly)]);
  return result.rows;
}

async function getJurisdictionGnds(jurisdictionId) {
  const result = await pool.query(`
    SELECT jg.idgnd, g.gnd_name, g.iddsd, d.dsd_n, d.iddistrict
    FROM public.jurisdiction_gnds jg
    LEFT JOIN public.gnd_boundary g ON g.idgnd = jg.idgnd
    LEFT JOIN public.dsd_boundary d ON d.iddsd = g.iddsd
    WHERE jg.jurisdiction_id = $1
    ORDER BY d.dsd_n, g.gnd_name;
  `, [jurisdictionId]);
  return result.rows;
}

async function createCustomJurisdiction(body = {}, createdBy = 'system') {
  const name = cleanText(body.jurisdiction_name);
  if (!name || name.length < 3) throw new Error('Jurisdiction name must be at least 3 characters.');
  const gndIds = [...new Set(toIntArray(body.idgnds || body.gnd_ids))];
  if (!gndIds.length) throw new Error('At least one GND must be selected.');
  const jurisdiction = await pool.query(`
    INSERT INTO public.jurisdictions (jurisdiction_name, jurisdiction_type, source_code, description, is_system_generated, created_by)
    VALUES ($1, COALESCE($2, 'CUSTOM'), NULL, $3, false, $4)
    RETURNING *;
  `, [name, cleanText(body.jurisdiction_type), cleanText(body.description), createdBy]);
  for (const idgnd of gndIds) {
    await pool.query('INSERT INTO public.jurisdiction_gnds (jurisdiction_id, idgnd) VALUES ($1, $2) ON CONFLICT DO NOTHING;', [jurisdiction.rows[0].id, idgnd]);
  }
  return jurisdiction.rows[0];
}

async function getUserByIdentifier(identifier) {
  const userIdentifier = cleanText(identifier)?.toLowerCase();
  if (!userIdentifier) return null;
  const result = await pool.query(`
    SELECT u.id, u.identifier, u.name, u.role_id, u.institution_id, r.role_name
    FROM public.users u
    LEFT JOIN public.roles r ON r.id = u.role_id
    WHERE u.identifier = $1
    LIMIT 1;
  `, [userIdentifier]);
  return result.rows[0] || null;
}

async function getUserAllowedGnds(identifier, { moduleKey = null } = {}) {
  const userIdentifier = cleanText(identifier)?.toLowerCase();
  if (!userIdentifier) return [];
  if (isMasterAdmin(userIdentifier)) return null;
  const user = await getUserByIdentifier(userIdentifier);
  if (!user) return [];
  if (String(user.role_name || '').toLowerCase() === 'admin') return null;
  const result = await pool.query(`
    SELECT DISTINCT jg.idgnd
    FROM public.jurisdiction_gnds jg
    JOIN (
      SELECT jurisdiction_id, module_key FROM public.user_jurisdictions WHERE user_id = $1
      UNION
      SELECT jurisdiction_id, module_key FROM public.organization_jurisdictions WHERE institution_id = $2
    ) access ON access.jurisdiction_id = jg.jurisdiction_id
    WHERE ($3::text IS NULL OR access.module_key IS NULL OR access.module_key = $3)
    ORDER BY jg.idgnd;
  `, [user.id, user.institution_id || null, cleanText(moduleKey)]);
  return result.rows.map(row => row.idgnd);
}

async function userCanAccessIdgnd(identifier, idgnd, { moduleKey = null } = {}) {
  const code = toInt(idgnd);
  if (!code) return false;
  const allowed = await getUserAllowedGnds(identifier, { moduleKey });
  if (allowed === null) return true;
  return allowed.includes(code);
}

module.exports = {
  resolveIdgndFromPoint,
  listJurisdictions,
  getJurisdictionGnds,
  createCustomJurisdiction,
  getUserAllowedGnds,
  userCanAccessIdgnd,
};
