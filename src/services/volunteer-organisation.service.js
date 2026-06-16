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

function validateVolunteerPayload(payload = {}) {
  const institutionName = cleanText(payload.institution_name || payload.organisation_name);
  const institutionCode = cleanText(payload.institution_code || payload.registration_no)?.toUpperCase() || null;
  const institutionType = cleanText(payload.institution_type || payload.organisation_type) || 'Volunteer Organisation';
  const contactPerson = cleanText(payload.contact_person);
  const contactPhone = cleanText(payload.contact_phone);
  const contactEmail = normalizeEmail(payload.contact_email);
  const website = cleanText(payload.website);
  const address = cleanText(payload.address);
  const district = cleanText(payload.district);
  const dsdName = cleanText(payload.dsd_name || payload.dsd);
  const gndName = cleanText(payload.gnd_name || payload.gnd);
  const subWatershedId = cleanText(payload.sub_watershed_id);
  const subWatershedName = cleanText(payload.sub_watershed_name);
  const description = cleanText(payload.description);
  const latitude = parseCoordinate(payload.latitude, -90, 90, 'Latitude');
  const longitude = parseCoordinate(payload.longitude, -180, 180, 'Longitude');
  const supportingDocumentUrl = cleanText(payload.supporting_document_url);
  const supportingDocumentName = cleanText(payload.supporting_document_name);
  const supportingDocumentMimeType = cleanText(payload.supporting_document_mime_type);

  if (!institutionName) throw new Error('Organisation name is required.');
  if (institutionName.length < 3 || institutionName.length > 255) throw new Error('Organisation name must be 3–255 characters.');
  if (institutionCode && !/^[A-Z0-9_-]{2,50}$/.test(institutionCode)) throw new Error('Registration/code must be 2–50 characters and may contain uppercase letters, numbers, hyphen or underscore only.');
  if (institutionType.length > 100) throw new Error('Organisation type must not exceed 100 characters.');
  if (contactPerson && contactPerson.length > 150) throw new Error('Contact person must not exceed 150 characters.');
  if (contactPhone && !/^[0-9+()\-\s]{7,30}$/.test(contactPhone)) throw new Error('Contact phone format is invalid.');
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Contact email format is invalid.');
  if (website && !/^https?:\/\/.+/i.test(website)) throw new Error('Website must start with http:// or https://.');
  if (!address) throw new Error('Organisation address is required.');
  if (latitude === null || longitude === null) throw new Error('Organisation location is required. Please mark the location on the map.');
  if (!dsdName || !gndName) throw new Error('DSD and GND could not be identified. Please select a location inside the Kelani River Basin administrative boundary.');

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
    sub_watershed_id: subWatershedId,
    sub_watershed_name: subWatershedName,
    description,
    latitude,
    longitude,
    active: parseBoolean(payload.active, true),
    supporting_document_url: supportingDocumentUrl,
    supporting_document_name: supportingDocumentName,
    supporting_document_mime_type: supportingDocumentMimeType,
  };
}

async function ensureDocumentTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.volunteer_organisation_documents (
      id bigserial PRIMARY KEY,
      organisation_id bigint NOT NULL,
      file_name text NOT NULL,
      file_url text NOT NULL,
      mime_type text,
      uploaded_by text,
      uploaded_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function dashboard() {
  const summary = await pool.query('SELECT * FROM public.vw_volunteer_dashboard_summary;');
  return { summary: summary.rows[0] || {} };
}

async function listOrganisations() {
  const result = await pool.query(`
    SELECT vo.*, doc.file_url AS supporting_document_url, doc.file_name AS supporting_document_name
    FROM public.vw_volunteer_organisation_performance vo
    LEFT JOIN LATERAL (
      SELECT file_url, file_name
      FROM public.volunteer_organisation_documents d
      WHERE d.organisation_id = vo.id
      ORDER BY uploaded_at DESC
      LIMIT 1
    ) doc ON true
    ORDER BY vo.active DESC, vo.performance_score DESC NULLS LAST, vo.institution_name
    LIMIT 500;
  `).catch(async error => {
    if (String(error.message || '').includes('volunteer_organisation_documents')) {
      const fallback = await pool.query('SELECT * FROM public.vw_volunteer_organisation_performance ORDER BY active DESC, performance_score DESC NULLS LAST, institution_name LIMIT 500;');
      return fallback;
    }
    throw error;
  });
  return result.rows;
}

async function getOrganisation(id) {
  const result = await pool.query('SELECT * FROM public.vw_volunteer_organisation_performance WHERE id = $1;', [id]);
  return result.rows[0] || null;
}

async function createOrganisation(payload, username = 'system') {
  const body = validateVolunteerPayload(payload);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
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
      body.institution_name,
      body.institution_code,
      body.institution_type,
      body.contact_person,
      body.contact_phone,
      body.contact_email,
      body.website,
      body.address,
      body.district,
      body.dsd_name,
      body.gnd_name,
      body.description,
      body.latitude,
      body.longitude,
      body.active,
      username,
    ]);

    const organisation = result.rows[0];

    if (body.supporting_document_url) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.volunteer_organisation_documents (
          id bigserial PRIMARY KEY,
          organisation_id bigint NOT NULL,
          file_name text NOT NULL,
          file_url text NOT NULL,
          mime_type text,
          uploaded_by text,
          uploaded_at timestamptz NOT NULL DEFAULT now()
        );
      `);
      await client.query(`
        INSERT INTO public.volunteer_organisation_documents
          (organisation_id, file_name, file_url, mime_type, uploaded_by)
        VALUES ($1, $2, $3, $4, $5);
      `, [organisation.id, body.supporting_document_name || 'supporting-document', body.supporting_document_url, body.supporting_document_mime_type, username]);
      organisation.supporting_document_url = body.supporting_document_url;
      organisation.supporting_document_name = body.supporting_document_name;
    }

    await client.query('COMMIT');
    return organisation;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { dashboard, listOrganisations, getOrganisation, createOrganisation, ensureDocumentTable };
