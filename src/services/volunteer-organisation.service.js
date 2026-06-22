const pool = require('../../config/database');

let documentTableReady = false;
let documentTableInitPromise = null;
let memberTableReady = false;
let memberTableInitPromise = null;
let programmeTablesReady = false;
let programmeTablesInitPromise = null;

function cleanText(value) { const text = String(value ?? '').trim(); return text || null; }
function normalizeEmail(value) { const email = cleanText(value); return email ? email.toLowerCase() : null; }
function parseBoolean(value, fallback = true) { if (value === undefined || value === null || value === '') return fallback; if (typeof value === 'boolean') return value; return ['true', '1', 'yes', 'active'].includes(String(value).trim().toLowerCase()); }
function parseCoordinate(value, min, max, label) { if (value === undefined || value === null || String(value).trim() === '') return null; const numeric = Number(value); if (!Number.isFinite(numeric) || numeric < min || numeric > max) throw new Error(`${label} must be a valid number between ${min} and ${max}.`); return numeric; }

function volunteerTypeWhere(alias = 'i') { return `LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%volunteer%' OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%community based%' OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%youth group%' OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%environmental ngo%' OR LOWER(COALESCE(${alias}.institution_type, '')) LIKE '%civil society%'`; }

function validateVolunteerPayload(payload = {}, partial = false) {
  const institutionName = cleanText(payload.institution_name || payload.organisation_name);
  const institutionCode = cleanText(payload.institution_code || payload.registration_no)?.toUpperCase() || null;
  const institutionType = cleanText(payload.institution_type || payload.organisation_type) || 'Volunteer Organisation';
  const contactEmail = normalizeEmail(payload.contact_email || payload.organisation_email);
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
  if (!partial && !institutionName) throw new Error('Organisation name is required.');
  if (institutionName && (institutionName.length < 3 || institutionName.length > 255)) throw new Error('Organisation name must be 3–255 characters.');
  if (institutionCode && !/^[A-Z0-9_-]{2,50}$/.test(institutionCode)) throw new Error('Registration/code must be 2–50 characters and may contain uppercase letters, numbers, hyphen or underscore only.');
  if (institutionType && institutionType.length > 100) throw new Error('Organisation type must not exceed 100 characters.');
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new Error('Organisation email format is invalid.');
  if (website && !/^https?:\/\/.+/i.test(website)) throw new Error('Website must start with http:// or https://.');
  if (!partial && !address) throw new Error('Organisation address is required.');
  if (!partial && (latitude === null || longitude === null)) throw new Error('Organisation location is required. Please mark the location on the map.');
  if (!partial && (!dsdName || !gndName)) throw new Error('DSD and GND could not be identified. Please select a location inside the Kelani River Basin administrative boundary.');
  return { institution_name: institutionName, institution_code: institutionCode, institution_type: institutionType, contact_person: null, contact_phone: null, contact_email: contactEmail, website, address, district, dsd_name: dsdName, gnd_name: gndName, sub_watershed_id: subWatershedId, sub_watershed_name: subWatershedName, description, latitude, longitude, active: parseBoolean(payload.active, true), supporting_document_url: supportingDocumentUrl, supporting_document_name: supportingDocumentName, supporting_document_mime_type: supportingDocumentMimeType };
}

async function ensureDocumentTable(client = pool) { if (documentTableReady) return; const createTable = async () => { try { await client.query(`CREATE TABLE IF NOT EXISTS public.volunteer_organisation_documents (id bigserial PRIMARY KEY, organisation_id bigint NOT NULL, file_name text NOT NULL, file_url text NOT NULL, mime_type text, uploaded_by text, uploaded_at timestamptz NOT NULL DEFAULT now());`); } catch (error) { const race = error.code === '23505' || String(error.message || '').includes('already exists') || String(error.message || '').includes('pg_type_typname_nsp_index'); if (!race) throw error; } documentTableReady = true; }; if (client !== pool) return createTable(); if (!documentTableInitPromise) documentTableInitPromise = createTable().finally(() => { documentTableInitPromise = null; }); await documentTableInitPromise; }
async function ensureMemberTable(client = pool) { if (memberTableReady) return; const createTable = async () => { await client.query(`CREATE TABLE IF NOT EXISTS public.volunteer_organisation_members (id bigserial PRIMARY KEY, organisation_id bigint NOT NULL REFERENCES public.intervention_institutions(id) ON DELETE CASCADE, person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT, organisation_role text NOT NULL DEFAULT 'Member', responsibility text, active boolean NOT NULL DEFAULT true, created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_by text, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organisation_id, person_id, organisation_role));`); memberTableReady = true; }; if (client !== pool) return createTable(); if (!memberTableInitPromise) memberTableInitPromise = createTable().finally(() => { memberTableInitPromise = null; }); await memberTableInitPromise; }

async function ensureProgrammeTables(client = pool) {
  if (programmeTablesReady) return;
  const createTables = async () => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.catchment_programme_activity_types (
        id bigserial PRIMARY KEY,
        activity_type_name text NOT NULL UNIQUE,
        description text,
        is_active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO public.catchment_programme_activity_types (activity_type_name, description, created_by, updated_by)
      VALUES ('Tree Planting','Tree planting and enrichment planting activities','system','system'),('Riverbank Cleaning','Cleaning and restoration of riverbanks','system','system'),('Awareness Programme','Community awareness, education or campaign activities','system','system'),('Waste Collection','Solid waste collection or clean-up activity','system','system'),('Water Quality Monitoring','Volunteer supported monitoring or sampling activity','system','system'),('Other','Other user-defined activity type','system','system')
      ON CONFLICT (activity_type_name) DO NOTHING;
      CREATE TABLE IF NOT EXISTS public.volunteer_catchment_programmes (
        id bigserial PRIMARY KEY,
        organisation_id bigint NOT NULL REFERENCES public.intervention_institutions(id) ON DELETE CASCADE,
        programme_name text NOT NULL,
        coordinator_person_id uuid REFERENCES public.persons(id),
        overall_status text NOT NULL DEFAULT 'Planned',
        recommendations text,
        active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS public.volunteer_catchment_programme_activities (
        id bigserial PRIMARY KEY,
        programme_id bigint NOT NULL REFERENCES public.volunteer_catchment_programmes(id) ON DELETE CASCADE,
        activity_type_id bigint REFERENCES public.catchment_programme_activity_types(id),
        other_activity_type text,
        activity_date date,
        partner_organisation_id bigint REFERENCES public.intervention_institutions(id),
        location_description text,
        latitude numeric,
        longitude numeric,
        district text,
        dsd_name text,
        gnd_name text,
        sub_watershed_id text,
        sub_watershed_name text,
        photo_url text,
        photo_name text,
        notes text,
        active boolean NOT NULL DEFAULT true,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_by text,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    programmeTablesReady = true;
  };
  if (client !== pool) return createTables();
  if (!programmeTablesInitPromise) programmeTablesInitPromise = createTables().finally(() => { programmeTablesInitPromise = null; });
  await programmeTablesInitPromise;
}

async function dashboard() { await ensureDocumentTable(); const result = await pool.query(`SELECT COUNT(*)::integer AS total_organisations, COUNT(*) FILTER (WHERE active = true)::integer AS active_organisations, NULL::numeric AS average_performance_score, COUNT(*) FILTER (WHERE active = true AND latitude IS NOT NULL AND longitude IS NOT NULL)::integer AS mapped_records FROM public.intervention_institutions i WHERE (${volunteerTypeWhere('i')});`); return { summary: result.rows[0] || {} }; }
async function listOrganisations() { await ensureDocumentTable(); await ensureMemberTable(); const result = await pool.query(`SELECT i.id, i.institution_name, i.institution_code, i.institution_type, i.institution_type AS organisation_type, i.contact_email, i.website, i.address, i.district, i.dsd_name, i.gnd_name, i.description, i.latitude, i.longitude, i.active, i.created_by, i.created_at, i.updated_by, i.updated_at, NULL::numeric AS performance_score, doc.file_url AS supporting_document_url, doc.file_name AS supporting_document_name, COALESCE(m.member_count, 0)::integer AS member_count FROM public.intervention_institutions i LEFT JOIN LATERAL (SELECT file_url, file_name FROM public.volunteer_organisation_documents d WHERE d.organisation_id = i.id ORDER BY uploaded_at DESC LIMIT 1) doc ON true LEFT JOIN LATERAL (SELECT COUNT(*) AS member_count FROM public.volunteer_organisation_members vm WHERE vm.organisation_id = i.id AND vm.active = true) m ON true WHERE (${volunteerTypeWhere('i')}) ORDER BY i.active DESC, i.created_at DESC, i.institution_name ASC LIMIT 500;`); return result.rows; }
async function listMembers(organisationId) { await ensureMemberTable(); const result = await pool.query(`SELECT vm.*, p.full_name, p.phone_number, p.email, p.dsd, p.gnd FROM public.volunteer_organisation_members vm JOIN public.persons p ON p.id = vm.person_id WHERE vm.organisation_id = $1 AND vm.active = true ORDER BY CASE LOWER(vm.organisation_role) WHEN 'president' THEN 1 WHEN 'secretary' THEN 2 WHEN 'treasurer' THEN 3 ELSE 4 END, p.full_name;`, [organisationId]); return result.rows; }
async function getOrganisation(id) { await ensureDocumentTable(); await ensureMemberTable(); await ensureProgrammeTables(); const result = await pool.query(`SELECT i.*, doc.file_url AS supporting_document_url, doc.file_name AS supporting_document_name FROM public.intervention_institutions i LEFT JOIN LATERAL (SELECT file_url, file_name FROM public.volunteer_organisation_documents d WHERE d.organisation_id = i.id ORDER BY uploaded_at DESC LIMIT 1) doc ON true WHERE i.id = $1 AND (${volunteerTypeWhere('i')});`, [id]); if (!result.rows[0]) return null; return { ...result.rows[0], members: await listMembers(id), programmes: await listProgrammes(id) }; }

async function createOrganisation(payload, username = 'system') { const body = validateVolunteerPayload(payload); await ensureDocumentTable(); const client = await pool.connect(); try { await client.query('BEGIN'); await ensureDocumentTable(client); const result = await client.query(`INSERT INTO public.intervention_institutions (institution_name, institution_code, institution_type, contact_person, contact_phone, contact_email, website, address, district, dsd_name, gnd_name, description, latitude, longitude, geom, active, created_by, updated_by) VALUES ($1::text,$2::varchar,$3::text,NULL,NULL,$4::text,$5::text,$6::text,$7::varchar,$8::varchar,$9::varchar,$10::text,$11::numeric,$12::numeric,ST_SetSRID(ST_MakePoint(($12::numeric)::double precision, ($11::numeric)::double precision),4326),$13::boolean,$14::text,$14::text) RETURNING *;`, [body.institution_name, body.institution_code, body.institution_type, body.contact_email, body.website, body.address, body.district, body.dsd_name, body.gnd_name, body.description, body.latitude, body.longitude, body.active, username]); const organisation = result.rows[0]; if (body.supporting_document_url) { await client.query('INSERT INTO public.volunteer_organisation_documents (organisation_id, file_name, file_url, mime_type, uploaded_by) VALUES ($1,$2,$3,$4,$5);', [organisation.id, body.supporting_document_name || 'supporting-document', body.supporting_document_url, body.supporting_document_mime_type, username]); organisation.supporting_document_url = body.supporting_document_url; organisation.supporting_document_name = body.supporting_document_name; } await client.query('COMMIT'); return organisation; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }
async function updateOrganisation(id, payload, username = 'system') { const body = validateVolunteerPayload(payload, true); await ensureDocumentTable(); const client = await pool.connect(); try { await client.query('BEGIN'); const existing = await client.query(`SELECT id FROM public.intervention_institutions i WHERE i.id = $1 AND (${volunteerTypeWhere('i')}) LIMIT 1;`, [id]); if (!existing.rows.length) { await client.query('ROLLBACK'); return null; } const result = await client.query(`UPDATE public.intervention_institutions SET institution_name = COALESCE($2, institution_name), institution_code = COALESCE($3, institution_code), institution_type = COALESCE($4, institution_type), contact_person = NULL, contact_phone = NULL, contact_email = $5, website = $6, address = COALESCE($7, address), district = COALESCE($8, district), dsd_name = COALESCE($9, dsd_name), gnd_name = COALESCE($10, gnd_name), description = $11, latitude = COALESCE($12, latitude), longitude = COALESCE($13, longitude), geom = CASE WHEN COALESCE($12, latitude) IS NOT NULL AND COALESCE($13, longitude) IS NOT NULL THEN ST_SetSRID(ST_MakePoint((COALESCE($13, longitude))::double precision, (COALESCE($12, latitude))::double precision),4326) ELSE geom END, active = COALESCE($14, active), updated_by = $15, updated_at = now() WHERE id = $1 RETURNING *;`, [id, body.institution_name, body.institution_code, body.institution_type, body.contact_email, body.website, body.address, body.district, body.dsd_name, body.gnd_name, body.description, body.latitude, body.longitude, body.active, username]); if (body.supporting_document_url) { await client.query('INSERT INTO public.volunteer_organisation_documents (organisation_id, file_name, file_url, mime_type, uploaded_by) VALUES ($1,$2,$3,$4,$5);', [id, body.supporting_document_name || 'supporting-document', body.supporting_document_url, body.supporting_document_mime_type, username]); result.rows[0].supporting_document_url = body.supporting_document_url; result.rows[0].supporting_document_name = body.supporting_document_name; } await client.query('COMMIT'); return result.rows[0]; } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); } }

async function addMember(organisationId, payload = {}, username = 'system') { await ensureMemberTable(); const personId = cleanText(payload.person_id); const role = cleanText(payload.organisation_role || payload.role) || 'Member'; if (!personId) throw new Error('Person is required.'); const result = await pool.query(`INSERT INTO public.volunteer_organisation_members (organisation_id, person_id, organisation_role, responsibility, active, created_by, updated_by) VALUES ($1,$2,$3,$4,true,$5,$5) ON CONFLICT (organisation_id, person_id, organisation_role) DO UPDATE SET responsibility = EXCLUDED.responsibility, active = true, updated_by = EXCLUDED.updated_by, updated_at = now() RETURNING *;`, [organisationId, personId, role, cleanText(payload.responsibility), username]); return result.rows[0]; }
async function removeMember(organisationId, memberId, username = 'system') { await ensureMemberTable(); const result = await pool.query(`UPDATE public.volunteer_organisation_members SET active = false, updated_by = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING id;`, [organisationId, memberId, username]); return result.rowCount > 0; }
async function deleteOrganisation(id) { await ensureDocumentTable(); await ensureMemberTable(); const result = await pool.query(`UPDATE public.intervention_institutions i SET active = false, updated_at = now() WHERE i.id = $1 AND (${volunteerTypeWhere('i')}) RETURNING id;`, [id]); return result.rows[0] || null; }

async function listActivityTypes() { await ensureProgrammeTables(); const result = await pool.query('SELECT * FROM public.catchment_programme_activity_types WHERE is_active = true ORDER BY activity_type_name;'); return result.rows; }
async function listPartnerInstitutions() { const result = await pool.query('SELECT id, institution_name, institution_type FROM public.intervention_institutions WHERE active = true ORDER BY institution_name ASC LIMIT 500;'); return result.rows; }
async function listProgrammes(organisationId) { await ensureProgrammeTables(); const programmes = await pool.query(`SELECT p.*, coordinator.full_name AS coordinator_name, coordinator.phone_number AS coordinator_phone, coordinator.email AS coordinator_email FROM public.volunteer_catchment_programmes p LEFT JOIN public.persons coordinator ON coordinator.id = p.coordinator_person_id WHERE p.organisation_id = $1 AND p.active = true ORDER BY p.created_at DESC;`, [organisationId]); const activities = await pool.query(`SELECT a.*, t.activity_type_name, partner.institution_name AS partner_organisation_name FROM public.volunteer_catchment_programme_activities a LEFT JOIN public.catchment_programme_activity_types t ON t.id = a.activity_type_id LEFT JOIN public.intervention_institutions partner ON partner.id = a.partner_organisation_id WHERE a.programme_id = ANY($1::bigint[]) AND a.active = true ORDER BY a.activity_date DESC NULLS LAST, a.created_at DESC;`, [programmes.rows.map(row => row.id)]); const byProgramme = new Map(); for (const row of activities.rows) { if (!byProgramme.has(String(row.programme_id))) byProgramme.set(String(row.programme_id), []); byProgramme.get(String(row.programme_id)).push(row); } return programmes.rows.map(row => ({ ...row, activities: byProgramme.get(String(row.id)) || [] })); }
async function createProgramme(organisationId, payload = {}, username = 'system') { await ensureProgrammeTables(); const name = cleanText(payload.programme_name); if (!name) throw new Error('Programme name is required.'); const result = await pool.query(`INSERT INTO public.volunteer_catchment_programmes (organisation_id, programme_name, coordinator_person_id, overall_status, recommendations, active, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,true,$6,$6) RETURNING *;`, [organisationId, name, cleanText(payload.coordinator_person_id), cleanText(payload.overall_status) || 'Planned', cleanText(payload.recommendations), username]); return result.rows[0]; }
async function updateProgramme(organisationId, programmeId, payload = {}, username = 'system') { await ensureProgrammeTables(); const result = await pool.query(`UPDATE public.volunteer_catchment_programmes SET programme_name = COALESCE($3, programme_name), coordinator_person_id = COALESCE($4, coordinator_person_id), overall_status = COALESCE($5, overall_status), recommendations = $6, updated_by = $7, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING *;`, [organisationId, programmeId, cleanText(payload.programme_name), cleanText(payload.coordinator_person_id), cleanText(payload.overall_status), cleanText(payload.recommendations), username]); return result.rows[0] || null; }
async function deleteProgramme(organisationId, programmeId, username = 'system') { await ensureProgrammeTables(); const result = await pool.query('UPDATE public.volunteer_catchment_programmes SET active = false, updated_by = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING id;', [organisationId, programmeId, username]); return result.rowCount > 0; }
async function createActivity(programmeId, payload = {}, username = 'system') { await ensureProgrammeTables(); const lat = parseCoordinate(payload.latitude, -90, 90, 'Latitude'); const lng = parseCoordinate(payload.longitude, -180, 180, 'Longitude'); const result = await pool.query(`INSERT INTO public.volunteer_catchment_programme_activities (programme_id, activity_type_id, other_activity_type, activity_date, partner_organisation_id, location_description, latitude, longitude, district, dsd_name, gnd_name, sub_watershed_id, sub_watershed_name, photo_url, photo_name, notes, active, created_by, updated_by) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,$17) RETURNING *;`, [programmeId, payload.activity_type_id || null, cleanText(payload.other_activity_type), payload.activity_date || null, payload.partner_organisation_id || null, cleanText(payload.location_description), lat, lng, cleanText(payload.district), cleanText(payload.dsd_name), cleanText(payload.gnd_name), cleanText(payload.sub_watershed_id), cleanText(payload.sub_watershed_name), cleanText(payload.photo_url), cleanText(payload.photo_name), cleanText(payload.notes), username]); return result.rows[0]; }
async function deleteActivity(programmeId, activityId, username = 'system') { await ensureProgrammeTables(); const result = await pool.query('UPDATE public.volunteer_catchment_programme_activities SET active = false, updated_by = $3, updated_at = now() WHERE programme_id = $1 AND id = $2 RETURNING id;', [programmeId, activityId, username]); return result.rowCount > 0; }

module.exports = { dashboard, listOrganisations, getOrganisation, createOrganisation, updateOrganisation, deleteOrganisation, listMembers, addMember, removeMember, ensureDocumentTable, ensureMemberTable, ensureProgrammeTables, listActivityTypes, listPartnerInstitutions, listProgrammes, createProgramme, updateProgramme, deleteProgramme, createActivity, deleteActivity };
