const pool = require('../../config/database');

function safeKey(value, fallback = 'intervention') {
  return String(value || fallback).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || fallback;
}

function code() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `INT-${stamp}-${rand}`;
}

function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

function uuidOrNull(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? value : null;
}

function progressValue(value, required = false) {
  if ((value === undefined || value === null || String(value).trim() === '') && !required) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    const error = new Error('Action Progress (%) must be a number between 0 and 100.');
    error.statusCode = 400;
    throw error;
  }
  return Math.round(n);
}

async function recalculateRegistryProgress(interventionId, user = 'system') {
  const result = await pool.query(`
    WITH progress AS (
      SELECT COALESCE(ROUND(AVG(COALESCE(progress_percent, 0)))::integer, 0) AS calculated_progress
      FROM public.intervention_action_timeline
      WHERE intervention_id = $1
    )
    UPDATE public.intervention_registry
    SET progress_percent = progress.calculated_progress,
        updated_by = $2,
        updated_at = now()
    FROM progress
    WHERE id = $1
    RETURNING progress_percent;
  `, [interventionId, user]);
  return result.rows[0]?.progress_percent || 0;
}

async function listLibrary() {
  const result = await pool.query('SELECT * FROM public.intervention_library ORDER BY active DESC, intervention_category, intervention_name;');
  return result.rows;
}

async function createLibrary(body = {}, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.intervention_library (intervention_key, intervention_name, intervention_category, description, standard_actions, expected_outputs, responsible_institution, default_priority, active, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$9) RETURNING *;
  `, [safeKey(body.intervention_key || body.intervention_name), body.intervention_name, body.intervention_category || null, body.description || null, body.standard_actions || null, body.expected_outputs || null, body.responsible_institution || null, body.default_priority || 'medium', user]);
  return result.rows[0];
}

async function updateLibrary(id, body = {}, user = 'system') {
  const result = await pool.query(`
    UPDATE public.intervention_library SET intervention_name=COALESCE($2,intervention_name), intervention_category=COALESCE($3,intervention_category), description=COALESCE($4,description), standard_actions=COALESCE($5,standard_actions), expected_outputs=COALESCE($6,expected_outputs), responsible_institution=COALESCE($7,responsible_institution), default_priority=COALESCE($8,default_priority), active=COALESCE($9,active), updated_by=$10, updated_at=now() WHERE id=$1 RETURNING *;
  `, [id, body.intervention_name || null, body.intervention_category || null, body.description || null, body.standard_actions || null, body.expected_outputs || null, body.responsible_institution || null, body.default_priority || null, body.active === undefined ? null : Boolean(body.active), user]);
  return result.rows[0] || null;
}

async function listRegistry() {
  const result = await pool.query(`
    SELECT r.*,
      COALESCE(progress.calculated_progress, 0)::integer AS progress_percent,
      l.intervention_name AS library_name, l.intervention_category,
      COALESCE(json_agg(DISTINCT o) FILTER (WHERE o.id IS NOT NULL), '[]') AS officers,
      COALESCE(timeline.timeline, '[]'::jsonb) AS timeline
    FROM public.intervention_registry r
    LEFT JOIN public.intervention_library l ON l.id = r.library_id
    LEFT JOIN public.intervention_officers o ON o.intervention_id = r.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg((
        to_jsonb(t) || jsonb_build_object(
          'responsible_person_full_name', p.full_name,
          'responsible_person_phone_number', p.phone_number,
          'responsible_person_email', p.email,
          'responsible_person_dsd', p.dsd,
          'responsible_person_gnd', p.gnd
        )
      ) ORDER BY t.action_date DESC, t.created_at DESC) AS timeline
      FROM public.intervention_action_timeline t
      LEFT JOIN public.persons p ON p.id = t.responsible_person_id
      WHERE t.intervention_id = r.id
    ) timeline ON true
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(COALESCE(progress_percent, 0)))::integer AS calculated_progress
      FROM public.intervention_action_timeline
      WHERE intervention_id = r.id
    ) progress ON true
    GROUP BY r.id, progress.calculated_progress, l.intervention_name, l.intervention_category, timeline.timeline
    ORDER BY r.updated_at DESC;
  `);
  return result.rows;
}

async function getRegistry(id) {
  const result = await pool.query(`
    SELECT r.*,
      COALESCE(progress.calculated_progress, 0)::integer AS progress_percent,
      l.intervention_name AS library_name, l.intervention_category,
      COALESCE(json_agg(DISTINCT o) FILTER (WHERE o.id IS NOT NULL), '[]') AS officers,
      COALESCE(timeline.timeline, '[]'::jsonb) AS timeline
    FROM public.intervention_registry r
    LEFT JOIN public.intervention_library l ON l.id = r.library_id
    LEFT JOIN public.intervention_officers o ON o.intervention_id = r.id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg((
        to_jsonb(t) || jsonb_build_object(
          'responsible_person_full_name', p.full_name,
          'responsible_person_phone_number', p.phone_number,
          'responsible_person_email', p.email,
          'responsible_person_dsd', p.dsd,
          'responsible_person_gnd', p.gnd
        )
      ) ORDER BY t.action_date DESC, t.created_at DESC) AS timeline
      FROM public.intervention_action_timeline t
      LEFT JOIN public.persons p ON p.id = t.responsible_person_id
      WHERE t.intervention_id = r.id
    ) timeline ON true
    LEFT JOIN LATERAL (
      SELECT ROUND(AVG(COALESCE(progress_percent, 0)))::integer AS calculated_progress
      FROM public.intervention_action_timeline
      WHERE intervention_id = r.id
    ) progress ON true
    WHERE r.id = $1
    GROUP BY r.id, progress.calculated_progress, l.intervention_name, l.intervention_category, timeline.timeline;
  `, [id]);
  return result.rows[0] || null;
}

async function createRegistry(body = {}, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.intervention_registry (intervention_code, library_id, intervention_title, location_name, village_name, dsd_name, gnd_name, latitude, longitude, priority, status, progress_percent, planned_start_date, planned_end_date, actual_start_date, actual_end_date, lead_officer_name, lead_officer_contact, implementing_office, remarks, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21) RETURNING *;
  `, [body.intervention_code || code(), body.library_id || null, body.intervention_title, body.location_name || null, body.village_name || null, body.dsd_name || null, body.gnd_name || null, num(body.latitude), num(body.longitude), body.priority || 'medium', body.status || 'planned', 0, body.planned_start_date || null, body.planned_end_date || null, body.actual_start_date || null, body.actual_end_date || null, body.lead_officer_name || null, body.lead_officer_contact || null, body.implementing_office || null, body.remarks || null, user]);
  return result.rows[0];
}

async function updateRegistry(id, body = {}, user = 'system') {
  const result = await pool.query(`
    UPDATE public.intervention_registry SET library_id=COALESCE($2,library_id), intervention_title=COALESCE($3,intervention_title), location_name=COALESCE($4,location_name), village_name=COALESCE($5,village_name), dsd_name=COALESCE($6,dsd_name), gnd_name=COALESCE($7,gnd_name), latitude=COALESCE($8,latitude), longitude=COALESCE($9,longitude), priority=COALESCE($10,priority), status=COALESCE($11,status), planned_start_date=COALESCE($12,planned_start_date), planned_end_date=COALESCE($13,planned_end_date), actual_start_date=COALESCE($14,actual_start_date), actual_end_date=COALESCE($15,actual_end_date), lead_officer_name=COALESCE($16,lead_officer_name), lead_officer_contact=COALESCE($17,lead_officer_contact), implementing_office=COALESCE($18,implementing_office), remarks=COALESCE($19,remarks), updated_by=$20, updated_at=now() WHERE id=$1 RETURNING *;
  `, [id, body.library_id || null, body.intervention_title || null, body.location_name || null, body.village_name || null, body.dsd_name || null, body.gnd_name || null, body.latitude === undefined ? null : num(body.latitude), body.longitude === undefined ? null : num(body.longitude), body.priority || null, body.status || null, body.planned_start_date || null, body.planned_end_date || null, body.actual_start_date || null, body.actual_end_date || null, body.lead_officer_name || null, body.lead_officer_contact || null, body.implementing_office || null, body.remarks || null, user]);
  return result.rows[0] || null;
}

async function deleteRegistry(id) {
  const result = await pool.query('DELETE FROM public.intervention_registry WHERE id = $1 RETURNING id;', [id]);
  return result.rowCount > 0;
}

async function createTimeline(interventionId, body = {}, user = 'system') {
  const progress = progressValue(body.progress_percent, true);
  const result = await pool.query(`
    INSERT INTO public.intervention_action_timeline (intervention_id, action_date, action_title, action_description, action_status, progress_percent, officer_name, officer_contact, responsible_person_id, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *;
  `, [interventionId, body.action_date || new Date().toISOString().slice(0, 10), body.action_title, body.action_description || null, body.action_status || 'completed', progress, body.officer_name || null, body.officer_contact || null, uuidOrNull(body.responsible_person_id), user]);
  await recalculateRegistryProgress(interventionId, user);
  return result.rows[0];
}

async function listTimeline(interventionId) {
  const result = await pool.query(`
    SELECT t.*,
           p.full_name AS responsible_person_full_name,
           p.phone_number AS responsible_person_phone_number,
           p.email AS responsible_person_email,
           p.dsd AS responsible_person_dsd,
           p.gnd AS responsible_person_gnd
    FROM public.intervention_action_timeline t
    LEFT JOIN public.persons p ON p.id = t.responsible_person_id
    WHERE t.intervention_id = $1
    ORDER BY t.action_date DESC, t.created_at DESC;
  `, [interventionId]);
  return result.rows;
}

async function updateTimeline(interventionId, actionId, body = {}, user = 'system') {
  const progress = progressValue(body.progress_percent, true);
  const result = await pool.query(`
    UPDATE public.intervention_action_timeline
    SET action_date = COALESCE($3, action_date),
        action_title = COALESCE($4, action_title),
        action_description = $5,
        action_status = COALESCE($6, action_status),
        progress_percent = $7,
        officer_name = COALESCE($8, officer_name),
        officer_contact = COALESCE($9, officer_contact),
        responsible_person_id = COALESCE($10, responsible_person_id),
        updated_by = $11,
        updated_at = now()
    WHERE intervention_id = $1
      AND id = $2
    RETURNING *;
  `, [interventionId, actionId, body.action_date || null, body.action_title || null, body.action_description || null, body.action_status || 'completed', progress, body.officer_name || null, body.officer_contact || null, body.responsible_person_id === undefined ? null : uuidOrNull(body.responsible_person_id), user]);
  if (result.rows[0]) await recalculateRegistryProgress(interventionId, user);
  return result.rows[0] || null;
}

async function deleteTimeline(interventionId, actionId, user = 'system') {
  const result = await pool.query(`
    DELETE FROM public.intervention_action_timeline
    WHERE intervention_id = $1
      AND id = $2
    RETURNING id;
  `, [interventionId, actionId]);
  if (result.rowCount > 0) await recalculateRegistryProgress(interventionId, user);
  return result.rowCount > 0;
}

async function createOfficer(interventionId, body = {}, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.intervention_officers (intervention_id, officer_name, designation, institution, phone, email, responsibility, active, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$8) RETURNING *;
  `, [interventionId, body.officer_name, body.designation || null, body.institution || null, body.phone || null, body.email || null, body.responsibility || null, user]);
  return result.rows[0];
}

async function getGeoJson() {
  const result = await pool.query(`
    SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(feature),'[]'::jsonb)) AS geojson
    FROM (
      SELECT jsonb_build_object('type','Feature','id',r.id,'geometry',ST_AsGeoJSON(r.geom)::jsonb,'properties',jsonb_build_object('id',r.id,'intervention_code',r.intervention_code,'intervention_title',r.intervention_title,'status',r.status,'priority',r.priority,'progress_percent',r.progress_percent,'location_name',r.location_name,'village_name',r.village_name,'gnd_name',r.gnd_name,'dsd_name',r.dsd_name,'lead_officer_name',r.lead_officer_name,'implementing_office',r.implementing_office,'updated_by',r.updated_by,'updated_at',r.updated_at,'library_name',l.intervention_name)) AS feature
      FROM public.intervention_registry r LEFT JOIN public.intervention_library l ON l.id=r.library_id WHERE r.geom IS NOT NULL
    ) x;
  `);
  return result.rows[0].geojson;
}

module.exports = { listLibrary, createLibrary, updateLibrary, listRegistry, getRegistry, createRegistry, updateRegistry, deleteRegistry, createTimeline, listTimeline, updateTimeline, deleteTimeline, createOfficer, getGeoJson };
