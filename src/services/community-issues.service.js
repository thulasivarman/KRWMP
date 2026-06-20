const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');
const fileAttachmentService = require('./file-attachment.service');
const personService = require('./person.service');

const PHOTO_DIR = path.join(__dirname, '../../public/data/community-issue-photos');
const PHOTO_URL_PREFIX = '/data/community-issue-photos';

function ensurePhotoDir() {
  if (!fs.existsSync(PHOTO_DIR)) fs.mkdirSync(PHOTO_DIR, { recursive: true });
}

function sanitizeKey(value, fallback = 'item') {
  const cleaned = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  return cleaned || fallback;
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function safeFileName(value) {
  return String(value || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}

function toIdArray(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') return value.split(',').map(v => Number(v.trim())).filter(Number.isFinite);
  return [];
}

function toTextArray(value) {
  if (Array.isArray(value)) return value.map(v => cleanText(v)).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map(v => cleanText(v)).filter(Boolean);
  return [];
}

function personIdFromMatches(matches = []) {
  const strong = matches.find(match => {
    const reasons = Array.isArray(match.match_reasons) ? match.match_reasons : [];
    return reasons.includes('phone_exact') || reasons.includes('email_exact') || reasons.includes('nic_exact') || Number(match.match_score || 0) >= 85;
  });
  return strong?.id || null;
}

async function resolveReporterPerson(fields = {}) {
  const reporterName = cleanText(fields.reporter_name);
  const reporterContact = cleanText(fields.reporter_contact);
  const reporterEmail = cleanText(fields.reporter_email);
  if (!reporterName && !reporterContact && !reporterEmail) return null;

  try {
    const candidate = {
      full_name: reporterName || 'Community Reporter',
      phone_number: reporterContact,
      email: reporterEmail,
      dsd: cleanText(fields.dsd_name),
      gnd: cleanText(fields.gnd_name),
      address: cleanText(fields.location_description),
    };
    const matches = await personService.detectPossibleDuplicates(candidate);
    const existingPersonId = personIdFromMatches(matches);
    if (existingPersonId) return existingPersonId;
    if (!reporterName && !reporterContact && !reporterEmail) return null;
    const person = await personService.createPerson(candidate);
    return person?.id || null;
  } catch (_) {
    return null;
  }
}

async function listCategories({ activeOnly = true } = {}) {
  const result = await pool.query(`
    SELECT id, category_key, category_name, description, severity_level, active, created_at, updated_at,
           COALESCE(issue_count.count, 0)::integer AS issue_count
    FROM public.issue_categories c
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS count FROM public.specific_issues si WHERE si.category_id = c.id AND ($1::boolean = false OR si.active = true)
    ) issue_count ON true
    WHERE ($1::boolean = false OR c.active = true)
    ORDER BY c.category_name ASC;
  `, [activeOnly]);
  return result.rows;
}

async function createCategory(body = {}) {
  const categoryName = cleanText(body.category_name);
  if (!categoryName || categoryName.length < 3) throw new Error('Issue category name must be at least 3 characters.');
  const result = await pool.query(`
    INSERT INTO public.issue_categories (category_key, category_name, description, severity_level, active)
    VALUES ($1, $2, $3, $4, true)
    ON CONFLICT (category_key) DO UPDATE SET
      category_name = EXCLUDED.category_name,
      description = EXCLUDED.description,
      severity_level = EXCLUDED.severity_level,
      active = true,
      updated_at = now()
    RETURNING *;
  `, [sanitizeKey(body.category_key || categoryName), categoryName, cleanText(body.description), body.severity_level || 'medium']);
  return result.rows[0];
}

async function updateCategory(id, body = {}) {
  const result = await pool.query(`
    UPDATE public.issue_categories
    SET category_name = COALESCE($2, category_name), description = COALESCE($3, description), severity_level = COALESCE($4, severity_level), active = COALESCE($5, active), updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, cleanText(body.category_name), cleanText(body.description), body.severity_level || null, body.active === undefined ? null : Boolean(body.active)]);
  return result.rows[0] || null;
}

async function deleteCategory(id) {
  const result = await pool.query(`
    UPDATE public.issue_categories
    SET active = false,
        updated_at = now()
    WHERE id = $1
    RETURNING id;
  `, [id]);
  return result.rowCount > 0;
}

async function listSpecificIssues({ activeOnly = true, categoryId = null } = {}) {
  const result = await pool.query(`
    SELECT si.*, c.category_name, c.category_key,
           COALESCE(link_count.count, 0)::integer AS solution_count
    FROM public.specific_issues si
    LEFT JOIN public.issue_categories c ON c.id = si.category_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS count FROM public.solution_issue_links sil WHERE sil.issue_id = si.id
    ) link_count ON true
    WHERE ($1::boolean = false OR si.active = true)
      AND ($2::bigint IS NULL OR si.category_id = $2)
    ORDER BY c.category_name ASC, si.issue_name ASC;
  `, [activeOnly, categoryId]);
  return result.rows;
}

async function createSpecificIssue(body = {}, createdBy = 'admin') {
  const categoryId = Number(body.category_id);
  const issueName = cleanText(body.issue_name);
  if (!Number.isFinite(categoryId)) throw new Error('Issue category is required.');
  if (!issueName || issueName.length < 3) throw new Error('Specific issue name must be at least 3 characters.');

  const result = await pool.query(`
    INSERT INTO public.specific_issues (category_id, issue_key, issue_name, description, severity_level, active, created_by)
    VALUES ($1,$2,$3,$4,$5,true,$6)
    ON CONFLICT (category_id, issue_key) DO UPDATE SET
      issue_name = EXCLUDED.issue_name,
      description = EXCLUDED.description,
      severity_level = EXCLUDED.severity_level,
      active = true,
      updated_at = now()
    RETURNING *;
  `, [categoryId, sanitizeKey(body.issue_key || issueName), issueName, cleanText(body.description), body.severity_level || 'medium', createdBy]);
  return result.rows[0];
}

async function updateSpecificIssue(id, body = {}) {
  const result = await pool.query(`
    UPDATE public.specific_issues
    SET category_id = COALESCE($2, category_id), issue_name = COALESCE($3, issue_name), description = COALESCE($4, description), severity_level = COALESCE($5, severity_level), active = COALESCE($6, active), updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, body.category_id || null, cleanText(body.issue_name), cleanText(body.description), body.severity_level || null, body.active === undefined ? null : Boolean(body.active)]);
  return result.rows[0] || null;
}

async function deleteSpecificIssue(id) {
  const result = await pool.query(`
    UPDATE public.specific_issues
    SET active = false,
        updated_at = now()
    WHERE id = $1
    RETURNING id;
  `, [id]);
  return result.rowCount > 0;
}

async function setSolutionIssueLinks(client, solutionId, issueIds = []) {
  await client.query('DELETE FROM public.solution_issue_links WHERE solution_id = $1', [solutionId]);
  if (!issueIds.length) return;
  for (const issueId of issueIds) {
    await client.query(`
      INSERT INTO public.solution_issue_links (solution_id, issue_id)
      VALUES ($1, $2)
      ON CONFLICT (solution_id, issue_id) DO NOTHING;
    `, [solutionId, issueId]);
  }
}

async function listSolutions({ activeOnly = true, issueId = null, categoryId = null } = {}) {
  const result = await pool.query(`
    SELECT s.*,
           COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
             'id', si.id,
             'issue_name', si.issue_name,
             'category_id', c.id,
             'category_name', c.category_name,
             'severity_level', si.severity_level
           )) FILTER (WHERE si.id IS NOT NULL), '[]'::jsonb) AS linked_issues,
           MIN(c.category_name) AS category_name
    FROM public.solution_library s
    LEFT JOIN public.solution_issue_links sil ON sil.solution_id = s.id
    LEFT JOIN public.specific_issues si ON si.id = sil.issue_id
    LEFT JOIN public.issue_categories c ON c.id = si.category_id
    WHERE ($1::boolean = false OR s.active = true)
      AND ($2::bigint IS NULL OR sil.issue_id = $2)
      AND ($3::bigint IS NULL OR si.category_id = $3)
    GROUP BY s.id
    ORDER BY s.solution_title ASC;
  `, [activeOnly, issueId, categoryId]);
  return result.rows;
}

async function createSolution(body = {}, createdBy = 'admin') {
  const issueIds = toIdArray(body.issue_ids);
  const title = cleanText(body.solution_title);
  const description = cleanText(body.solution_description);
  if (!title || title.length < 3) throw new Error('Solution title must be at least 3 characters.');
  if (!description || description.length < 10) throw new Error('Solution description must be at least 10 characters.');
  if (!issueIds.length) throw new Error('Please link the solution to at least one specific issue.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO public.solution_library (category_id, solution_title, solution_description, recommended_actions, responsible_party, estimated_timeframe, priority_level, active, created_by)
      VALUES (NULL,$1,$2,$3,$4,$5,$6,true,$7)
      RETURNING *;
    `, [title, description, cleanText(body.recommended_actions), cleanText(body.responsible_party), cleanText(body.estimated_timeframe), body.priority_level || 'medium', createdBy]);
    await setSolutionIssueLinks(client, result.rows[0].id, issueIds);
    await client.query('COMMIT');
    return { ...result.rows[0], issue_ids: issueIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateSolution(id, body = {}) {
  const issueIds = toIdArray(body.issue_ids);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      UPDATE public.solution_library
      SET solution_title = COALESCE($2, solution_title), solution_description = COALESCE($3, solution_description), recommended_actions = COALESCE($4, recommended_actions), responsible_party = COALESCE($5, responsible_party), estimated_timeframe = COALESCE($6, estimated_timeframe), priority_level = COALESCE($7, priority_level), active = COALESCE($8, active), updated_at = now()
      WHERE id = $1
      RETURNING *;
    `, [id, cleanText(body.solution_title), cleanText(body.solution_description), cleanText(body.recommended_actions), cleanText(body.responsible_party), cleanText(body.estimated_timeframe), body.priority_level || null, body.active === undefined ? null : Boolean(body.active)]);
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      return null;
    }
    if (body.issue_ids !== undefined) await setSolutionIssueLinks(client, id, issueIds);
    await client.query('COMMIT');
    return { ...result.rows[0], issue_ids: issueIds };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteSolution(id) {
  const result = await pool.query(`
    UPDATE public.solution_library
    SET active = false,
        updated_at = now()
    WHERE id = $1
    RETURNING id;
  `, [id]);
  return result.rowCount > 0;
}

function generateReportCode() {
  const now = new Date();
  const stamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `KRWMP-${stamp}-${rand}`;
}

async function savePhoto(file) {
  if (!file) return null;
  ensurePhotoDir();
  const buffer = await file.toBuffer();
  const ext = path.extname(file.filename || '').toLowerCase() || '.jpg';
  const filename = `${Date.now()}_${safeFileName(file.filename || `photo${ext}`)}`;
  const savePath = path.join(PHOTO_DIR, filename);
  fs.writeFileSync(savePath, buffer);
  return `${PHOTO_URL_PREFIX}/${filename}`;
}

async function createPublicReport({ fields = {}, photoFile = null } = {}) {
  const lat = toNumber(fields.latitude);
  const lng = toNumber(fields.longitude);
  const photoUrl = await savePhoto(photoFile);
  const reportCode = generateReportCode();
  const issueId = toNullableId(fields.issue_id);
  const categoryId = toNullableId(fields.category_id);
  const assignedSolutionId = toNullableId(fields.assigned_solution_id);
  const otherCategoryName = cleanText(fields.other_category_name);
  const otherIssueName = cleanText(fields.other_issue_name);
  const issueTitle = cleanText(fields.issue_title) || otherIssueName || otherCategoryName || 'Community reported issue';
  const dsdName = cleanText(fields.dsd_name);
  const gndName = cleanText(fields.gnd_name);
  const subWatershedId = cleanText(fields.sub_watershed_id);
  const subWatershedName = cleanText(fields.sub_watershed_name);
  const reporterPersonId = await resolveReporterPerson({
    ...fields,
    dsd_name: dsdName,
    gnd_name: gndName,
  });

  const result = await pool.query(`
    INSERT INTO public.community_issue_reports (
      report_code, category_id, issue_id, issue_title, description, reporter_name, reporter_contact, reporter_email,
      location_description, latitude, longitude, geom, photo_url, status, severity_level, assigned_solution_id,
      dsd_name, gnd_name, sub_watershed_id, sub_watershed_name, other_category_name, other_issue_name, reporter_person_id
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
      CASE WHEN $10::numeric IS NOT NULL AND $11::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint(($11::numeric)::double precision, ($10::numeric)::double precision), 4326) ELSE NULL END,
      $12,'submitted',$13,$14,$15,$16,$17,$18,$19,$20,$21
    ) RETURNING *;
  `, [
    reportCode,
    categoryId,
    issueId,
    issueTitle,
    fields.description || null,
    fields.reporter_name || null,
    fields.reporter_contact || null,
    fields.reporter_email || null,
    fields.location_description || null,
    lat,
    lng,
    photoUrl,
    fields.severity_level || 'medium',
    assignedSolutionId,
    dsdName,
    gndName,
    subWatershedId,
    subWatershedName,
    otherCategoryName,
    otherIssueName,
    reporterPersonId
  ]);
  const report = result.rows[0];
  const attachmentIds = toTextArray(fields.attachment_ids);
  for (const attachmentId of attachmentIds.slice(0, 5)) {
    await fileAttachmentService.completeUpload(attachmentId, {
      record_id: report.id,
      record_kind: 'community_issue_report',
      attachment_role: 'report_photo',
      visibility: 'private',
      metadata: { report_code: report.report_code },
    }, 'public');
  }
  return report;
}

async function listReports({ status = null } = {}) {
  const mappingExists = await hasComplaintInterventionMapping();
  const result = await pool.query(mappingExists ? `
    SELECT
      r.*,
      c.category_name,
      c.category_key,
      si.issue_name,
      s.solution_title,
      s.responsible_party AS solution_responsible_party,
      linked.mapping_id AS linked_intervention_mapping_id,
      linked.intervention_id AS linked_intervention_id,
      linked.link_status AS linked_intervention_link_status,
      linked.intervention_code AS linked_intervention_code,
      linked.intervention_title AS linked_intervention_title,
      linked.intervention_status AS linked_intervention_status,
      linked.progress_percent AS linked_intervention_progress_percent,
      linked.responsible_agency AS linked_intervention_responsible_agency,
      p.full_name AS reporter_person_full_name,
      p.phone_number AS reporter_person_phone_number,
      p.email AS reporter_person_email,
      p.dsd AS reporter_person_dsd,
      p.gnd AS reporter_person_gnd,
      p.nic_number AS reporter_person_nic_number
    FROM public.community_issue_reports r
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
    LEFT JOIN public.specific_issues si ON si.id = r.issue_id
    LEFT JOIN public.solution_library s ON s.id = r.assigned_solution_id
    LEFT JOIN public.persons p ON p.id = r.reporter_person_id
    LEFT JOIN LATERAL (
      SELECT
        cim.id AS mapping_id,
        cim.intervention_id,
        cim.link_status,
        ir.intervention_code,
        ir.intervention_title,
        ir.status AS intervention_status,
        ir.progress_percent,
        COALESCE(ir.implementing_office, il.responsible_institution, ir.lead_officer_name) AS responsible_agency
      FROM public.complaint_intervention_mapping cim
      JOIN public.intervention_registry ir ON ir.id = cim.intervention_id
      LEFT JOIN public.intervention_library il ON il.id = ir.library_id
      WHERE cim.report_id = r.id
        AND cim.link_status <> 'not_applicable'
      ORDER BY
        CASE cim.link_status WHEN 'active' THEN 0 WHEN 'under_review' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
        cim.linked_at DESC
      LIMIT 1
    ) linked ON true
    WHERE ($1::text IS NULL OR r.status = $1)
    ORDER BY r.submitted_at DESC;
  ` : `
    SELECT
      r.*,
      c.category_name,
      c.category_key,
      si.issue_name,
      s.solution_title,
      s.responsible_party AS solution_responsible_party,
      NULL::bigint AS linked_intervention_mapping_id,
      NULL::bigint AS linked_intervention_id,
      NULL::text AS linked_intervention_link_status,
      NULL::text AS linked_intervention_code,
      NULL::text AS linked_intervention_title,
      NULL::text AS linked_intervention_status,
      NULL::integer AS linked_intervention_progress_percent,
      NULL::text AS linked_intervention_responsible_agency,
      p.full_name AS reporter_person_full_name,
      p.phone_number AS reporter_person_phone_number,
      p.email AS reporter_person_email,
      p.dsd AS reporter_person_dsd,
      p.gnd AS reporter_person_gnd,
      p.nic_number AS reporter_person_nic_number
    FROM public.community_issue_reports r
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
    LEFT JOIN public.specific_issues si ON si.id = r.issue_id
    LEFT JOIN public.solution_library s ON s.id = r.assigned_solution_id
    LEFT JOIN public.persons p ON p.id = r.reporter_person_id
    WHERE ($1::text IS NULL OR r.status = $1)
    ORDER BY r.submitted_at DESC;
  `, [status]);
  return result.rows;
}

async function hasComplaintInterventionMapping() {
  const result = await pool.query("SELECT to_regclass('public.complaint_intervention_mapping') AS table_name;");
  return Boolean(result.rows[0]?.table_name);
}

async function updateReport(id, body = {}, reviewedBy = 'admin') {
  const shouldSetSolution = hasOwn(body, 'assigned_solution_id');
  const assignedSolutionId = shouldSetSolution ? toNullableId(body.assigned_solution_id) : null;
  const result = await pool.query(`
    UPDATE public.community_issue_reports
    SET status = COALESCE($2, status),
        severity_level = COALESCE($3, severity_level),
        admin_notes = COALESCE($4, admin_notes),
        assigned_solution_id = CASE WHEN $5::boolean THEN $6::bigint ELSE assigned_solution_id END,
        reviewed_by = $7,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, body.status || null, body.severity_level || null, body.admin_notes || null, shouldSetSolution, assignedSolutionId, reviewedBy]);
  return result.rows[0] || null;
}

async function getReportsGeoJson({ status = null } = {}) {
  const result = await pool.query(`
    SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(feature),'[]'::jsonb)) AS geojson
    FROM (
      SELECT jsonb_build_object(
        'type','Feature',
        'id', r.id,
        'geometry', ST_AsGeoJSON(r.geom)::jsonb,
        'properties', jsonb_build_object(
          'id', r.id,
          'report_code', r.report_code,
          'issue_title', r.issue_title,
          'description', r.description,
          'status', r.status,
          'severity_level', r.severity_level,
          'category_name', COALESCE(c.category_name, r.other_category_name, 'Other'),
          'issue_name', COALESCE(si.issue_name, r.other_issue_name, r.issue_title),
          'solution_title', s.solution_title,
          'dsd_name', r.dsd_name,
          'gnd_name', r.gnd_name,
          'sub_watershed_name', r.sub_watershed_name,
          'photo_url', r.photo_url,
          'submitted_at', r.submitted_at
        )
      ) AS feature
      FROM public.community_issue_reports r
      LEFT JOIN public.issue_categories c ON c.id = r.category_id
      LEFT JOIN public.specific_issues si ON si.id = r.issue_id
      LEFT JOIN public.solution_library s ON s.id = r.assigned_solution_id
      WHERE r.geom IS NOT NULL
        AND ($1::text IS NULL OR r.status = $1)
    ) x;
  `, [status]);
  return result.rows[0].geojson;
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSpecificIssues,
  createSpecificIssue,
  updateSpecificIssue,
  deleteSpecificIssue,
  listSolutions,
  createSolution,
  updateSolution,
  deleteSolution,
  createPublicReport,
  listReports,
  updateReport,
  getReportsGeoJson,
};
