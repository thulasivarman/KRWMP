const pool = require('../../config/database');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeEmail(value) {
  const email = cleanText(value);
  return email ? email.toLowerCase() : null;
}

function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'active'].includes(String(value).trim().toLowerCase());
}

function parseCoordinate(value, min, max, label) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${label} must be a valid number between ${min} and ${max}.`);
  }
  return numeric;
}

function validateInstitutionPayload(payload = {}, partial = false) {
  const institutionName = cleanText(payload.institution_name);
  const institutionCode = cleanText(payload.institution_code)?.toUpperCase() || null;
  const institutionType = cleanText(payload.institution_type);
  const contactPerson = cleanText(payload.contact_person);
  const contactPhone = cleanText(payload.contact_phone);
  const contactEmail = normalizeEmail(payload.contact_email);
  const website = cleanText(payload.website);
  const address = cleanText(payload.address);
  const district = cleanText(payload.district);
  const dsdName = cleanText(payload.dsd_name || payload.dsd);
  const gndName = cleanText(payload.gnd_name || payload.gnd);
  const description = cleanText(payload.description);
  const latitude = parseCoordinate(payload.latitude, -90, 90, 'Latitude');
  const longitude = parseCoordinate(payload.longitude, -180, 180, 'Longitude');

  if (!partial && !institutionName) throw new Error('Institution name is required.');
  if (institutionName && (institutionName.length < 3 || institutionName.length > 255)) throw new Error('Institution name must be 3–255 characters.');
  if (institutionCode && !/^[A-Z0-9_-]{2,50}$/.test(institutionCode)) throw new Error('Institution code must be 2–50 characters and may contain uppercase letters, numbers, hyphen or underscore only.');
  if (!partial && !institutionType) throw new Error('Institution type is required.');
  if (institutionType && institutionType.length > 100) throw new Error('Institution type must not exceed 100 characters.');
  if (contactPerson && contactPerson.length > 150) throw new Error('Contact person must not exceed 150 characters.');
  if (contactPhone && !/^[0-9+()\-\s]{7,30}$/.test(contactPhone)) throw new Error('Contact phone format is invalid.');
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Contact email format is invalid.');
  if (website && !/^https?:\/\/.+/i.test(website)) throw new Error('Website must start with http:// or https://.');
  if (!partial && !address) throw new Error('Institution address is required.');
  if ((latitude === null) !== (longitude === null)) throw new Error('Both latitude and longitude are required when setting institution location.');
  if (!partial && (latitude === null || longitude === null)) throw new Error('Institution location is required. Please select a location on the map.');

  return {
    institution_name: institutionName,
    institution_code: institutionCode,
    institution_type: institutionType,
    contact_person: contactPerson,
    contact_phone: contactPhone,
    contact_email: contactEmail,
    website,
    address,
    district,
    dsd_name: dsdName,
    gnd_name: gndName,
    description,
    latitude,
    longitude,
    active: parseBoolean(payload.active, true),
  };
}

async function listInstitutions(filters = {}) {
  const search = cleanText(filters.search);
  const institutionType = cleanText(filters.type || filters.institution_type);
  const active = filters.active === undefined || filters.active === '' ? null : parseBoolean(filters.active, true);
  const limit = Math.min(Math.max(Number(filters.limit || 100), 1), 500);
  const offset = Math.max(Number(filters.offset || 0), 0);

  const result = await pool.query(`
    SELECT
      id, institution_name, institution_code, institution_type, contact_person, contact_phone, contact_email,
      website, address, district, dsd_name, gnd_name, description, latitude, longitude, active,
      created_by, created_at, updated_by, updated_at,
      CASE WHEN geom IS NOT NULL THEN ST_AsGeoJSON(geom)::jsonb ELSE NULL END AS geometry
    FROM public.intervention_institutions
    WHERE ($1::text IS NULL OR institution_name ILIKE '%' || $1 || '%' OR institution_code ILIKE '%' || $1 || '%' OR contact_person ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR institution_type = $2)
      AND ($3::boolean IS NULL OR active = $3)
    ORDER BY active DESC, institution_name ASC
    LIMIT $4 OFFSET $5;
  `, [search, institutionType, active, limit, offset]);

  const countResult = await pool.query(`
    SELECT COUNT(*)::integer AS total
    FROM public.intervention_institutions
    WHERE ($1::text IS NULL OR institution_name ILIKE '%' || $1 || '%' OR institution_code ILIKE '%' || $1 || '%' OR contact_person ILIKE '%' || $1 || '%')
      AND ($2::text IS NULL OR institution_type = $2)
      AND ($3::boolean IS NULL OR active = $3);
  `, [search, institutionType, active]);

  return { institutions: result.rows, total: countResult.rows[0]?.total || 0 };
}

async function getInstitution(id) {
  const result = await pool.query(`
    SELECT *, CASE WHEN geom IS NOT NULL THEN ST_AsGeoJSON(geom)::jsonb ELSE NULL END AS geometry
    FROM public.intervention_institutions
    WHERE id = $1;
  `, [id]);
  return result.rows[0] || null;
}

async function createInstitution(payload, username) {
  const body = validateInstitutionPayload(payload, false);
  const result = await pool.query(`
    INSERT INTO public.intervention_institutions
      (institution_name, institution_code, institution_type, contact_person, contact_phone, contact_email,
       website, address, district, dsd_name, gnd_name, description, latitude, longitude, geom,
       active, created_by, updated_by)
    VALUES
      ($1::text,$2::varchar,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::varchar,$10::varchar,$11::varchar,$12::text,
       $13::numeric,$14::numeric,
       ST_SetSRID(ST_MakePoint(($14::numeric)::double precision, ($13::numeric)::double precision), 4326),
       $15::boolean,$16::text,$16::text)
    RETURNING *;
  `, [
    body.institution_name, body.institution_code, body.institution_type, body.contact_person, body.contact_phone,
    body.contact_email, body.website, body.address, body.district, body.dsd_name, body.gnd_name, body.description,
    body.latitude, body.longitude, body.active, username,
  ]);
  return result.rows[0];
}

async function updateInstitution(id, payload, username) {
  const body = validateInstitutionPayload(payload, true);
  const result = await pool.query(`
    UPDATE public.intervention_institutions SET
      institution_name = COALESCE($2::text, institution_name),
      institution_code = $3::varchar,
      institution_type = COALESCE($4::text, institution_type),
      contact_person = $5::text,
      contact_phone = $6::text,
      contact_email = $7::text,
      website = $8::text,
      address = $9::text,
      district = $10::varchar,
      dsd_name = $11::varchar,
      gnd_name = $12::varchar,
      description = $13::text,
      latitude = $14::numeric,
      longitude = $15::numeric,
      geom = CASE WHEN $14::numeric IS NOT NULL AND $15::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint(($15::numeric)::double precision, ($14::numeric)::double precision), 4326) ELSE NULL END,
      active = $16::boolean,
      updated_by = $17::text,
      updated_at = now()
    WHERE id = $1::bigint
    RETURNING *;
  `, [
    id, body.institution_name, body.institution_code, body.institution_type, body.contact_person, body.contact_phone,
    body.contact_email, body.website, body.address, body.district, body.dsd_name, body.gnd_name, body.description,
    body.latitude, body.longitude, body.active, username,
  ]);
  return result.rows[0] || null;
}

async function deactivateInstitution(id, username) {
  const result = await pool.query(`
    UPDATE public.intervention_institutions
    SET active = false, updated_by = $2, updated_at = now()
    WHERE id = $1
    RETURNING id;
  `, [id, username]);
  return result.rows[0] || null;
}

async function listInstitutionTypes() {
  const result = await pool.query(`
    SELECT type_name
    FROM public.institution_types
    WHERE active = true
    ORDER BY type_name;
  `);
  return result.rows;
}

module.exports = {
  validateInstitutionPayload,
  listInstitutions,
  getInstitution,
  createInstitution,
  updateInstitution,
  deactivateInstitution,
  listInstitutionTypes,
};
