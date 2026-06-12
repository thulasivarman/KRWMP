const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');

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

function safeFileName(value) {
  return String(value || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIdArray(value) {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === 'string') return value.split(',').map(v => Number(v.trim())).filter(Number.isFinite);
  return [];
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
  const issueId = fields.issue_id || null;
  const categoryId = fields.category_id || null;

  const result = await pool.query(`
    INSERT INTO public.community_issue_reports (
      report_code, category_id, issue_id, issue_title, description, reporter_name, reporter_contact, reporter_email, location_description, latitude, longitude, geom, photo_url, status, severity_level
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
      CASE WHEN $10::numeric IS NOT NULL AND $11::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint(($11::numeric)::double precision, ($10::numeric)::double precision), 4326) ELSE NULL END,
      $12,'submitted',$13
    ) RETURNING *;
  `, [reportCode, categoryId, issueId, fields.issue_title, fields.description || null, fields.reporter_name || null, fields.reporter_contact || null, fields.reporter_email || null, fields.location_description || null, lat, lng, photoUrl, fields.severity_level || 'medium']);
  return result.rows[0];
}

async function listReports({ status = null } = {}) {
  const result = await pool.query(`
    SELECT r.*, c.category_name, c.category_key, si.issue_name, s.solution_title
    FROM public.community_issue_reports r
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
    LEFT JOIN public.specific_issues si ON si.id = r.issue_id
    LEFT JOIN public.solution_library s ON s.id = r.assigned_solution_id
    WHERE ($1::text IS NULL OR r.status = $1)
    ORDER BY r.submitted_at DESC;
  `, [status]);
  return result.rows;
}

async function updateReport(id, body = {}, reviewedBy = 'admin') {
  const result = await pool.query(`
    UPDATE public.community_issue_reports
    SET status = COALESCE($2, status), severity_level = COALESCE($3, severity_level), admin_notes = COALESCE($4, admin_notes), assigned_solution_id = COALESCE($5, assigned_solution_id), reviewed_by = $6, reviewed_at = now(), updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, body.status || null, body.severity_level || null, body.admin_notes || null, body.assigned_solution_id || null, reviewedBy]);
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
          'category_name', c.category_name,
          'issue_name', si.issue_name,
          'photo_url', r.photo_url,
          'submitted_at', r.submitted_at
        )
      ) AS feature
      FROM public.community_issue_reports r
      LEFT JOIN public.issue_categories c ON c.id = r.category_id
      LEFT JOIN public.specific_issues si ON si.id = r.issue_id
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
  listSpecificIssues,
  createSpecificIssue,
  updateSpecificIssue,
  listSolutions,
  createSolution,
  updateSolution,
  createPublicReport,
  listReports,
  updateReport,
  getReportsGeoJson,
};
