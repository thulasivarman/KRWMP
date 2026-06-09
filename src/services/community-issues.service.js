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

function safeFileName(value) {
  return String(value || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function listCategories({ activeOnly = true } = {}) {
  const result = await pool.query(`
    SELECT id, category_key, category_name, description, severity_level, sort_order, active, created_at, updated_at
    FROM public.issue_categories
    WHERE ($1::boolean = false OR active = true)
    ORDER BY sort_order ASC, category_name ASC;
  `, [activeOnly]);
  return result.rows;
}

async function createCategory(body = {}) {
  const result = await pool.query(`
    INSERT INTO public.issue_categories (category_key, category_name, description, severity_level, sort_order, active)
    VALUES ($1, $2, $3, $4, $5, true)
    RETURNING *;
  `, [sanitizeKey(body.category_key || body.category_name), body.category_name, body.description || null, body.severity_level || 'medium', Number(body.sort_order || 100)]);
  return result.rows[0];
}

async function updateCategory(id, body = {}) {
  const result = await pool.query(`
    UPDATE public.issue_categories
    SET category_name = COALESCE($2, category_name), description = COALESCE($3, description), severity_level = COALESCE($4, severity_level), sort_order = COALESCE($5, sort_order), active = COALESCE($6, active), updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, body.category_name || null, body.description || null, body.severity_level || null, body.sort_order === undefined ? null : Number(body.sort_order), body.active === undefined ? null : Boolean(body.active)]);
  return result.rows[0] || null;
}

async function listSolutions({ activeOnly = true, categoryId = null } = {}) {
  const result = await pool.query(`
    SELECT s.*, c.category_name, c.category_key
    FROM public.solution_library s
    LEFT JOIN public.issue_categories c ON c.id = s.category_id
    WHERE ($1::boolean = false OR s.active = true)
      AND ($2::bigint IS NULL OR s.category_id = $2)
    ORDER BY c.sort_order ASC, s.priority_level ASC, s.solution_title ASC;
  `, [activeOnly, categoryId]);
  return result.rows;
}

async function createSolution(body = {}, createdBy = 'admin') {
  const result = await pool.query(`
    INSERT INTO public.solution_library (category_id, solution_title, solution_description, recommended_actions, responsible_party, estimated_timeframe, priority_level, active, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
    RETURNING *;
  `, [body.category_id || null, body.solution_title, body.solution_description, body.recommended_actions || null, body.responsible_party || null, body.estimated_timeframe || null, body.priority_level || 'medium', createdBy]);
  return result.rows[0];
}

async function updateSolution(id, body = {}) {
  const result = await pool.query(`
    UPDATE public.solution_library
    SET category_id = COALESCE($2, category_id), solution_title = COALESCE($3, solution_title), solution_description = COALESCE($4, solution_description), recommended_actions = COALESCE($5, recommended_actions), responsible_party = COALESCE($6, responsible_party), estimated_timeframe = COALESCE($7, estimated_timeframe), priority_level = COALESCE($8, priority_level), active = COALESCE($9, active), updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, body.category_id || null, body.solution_title || null, body.solution_description || null, body.recommended_actions || null, body.responsible_party || null, body.estimated_timeframe || null, body.priority_level || null, body.active === undefined ? null : Boolean(body.active)]);
  return result.rows[0] || null;
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

  const result = await pool.query(`
    INSERT INTO public.community_issue_reports (
      report_code, category_id, issue_title, description, reporter_name, reporter_contact, reporter_email, location_description, latitude, longitude, geom, photo_url, status, severity_level
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      CASE WHEN $9::numeric IS NOT NULL AND $10::numeric IS NOT NULL THEN ST_SetSRID(ST_MakePoint($10, $9), 4326) ELSE NULL END,
      $11,'submitted',$12
    ) RETURNING *;
  `, [reportCode, fields.category_id || null, fields.issue_title, fields.description || null, fields.reporter_name || null, fields.reporter_contact || null, fields.reporter_email || null, fields.location_description || null, lat, lng, photoUrl, fields.severity_level || 'medium']);
  return result.rows[0];
}

async function listReports({ status = null } = {}) {
  const result = await pool.query(`
    SELECT r.*, c.category_name, c.category_key, s.solution_title
    FROM public.community_issue_reports r
    LEFT JOIN public.issue_categories c ON c.id = r.category_id
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
          'photo_url', r.photo_url,
          'submitted_at', r.submitted_at
        )
      ) AS feature
      FROM public.community_issue_reports r
      LEFT JOIN public.issue_categories c ON c.id = r.category_id
      WHERE r.geom IS NOT NULL
        AND ($1::text IS NULL OR r.status = $1)
    ) x;
  `, [status]);
  return result.rows[0].geojson;
}

module.exports = { listCategories, createCategory, updateCategory, listSolutions, createSolution, updateSolution, createPublicReport, listReports, updateReport, getReportsGeoJson };
