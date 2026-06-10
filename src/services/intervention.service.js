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
    SELECT r.*, l.intervention_name AS library_name, l.intervention_category,
      COALESCE(json_agg(DISTINCT o) FILTER (WHERE o.id IS NOT NULL), '[]') AS officers,
      COALESCE(json_agg(DISTINCT t) FILTER (WHERE t.id IS NOT NULL), '[]') AS timeline
    FROM public.intervention_registry r
    LEFT JOIN public.intervention_library l ON l.id = r.library_id
    LEFT JOIN public.intervention_officers o ON o.intervention_id = r.id
    LEFT JOIN public.intervention_action_timeline t ON t.intervention_id = r.id
    GROUP BY r.id, l.intervention_name, l.intervention_category
    ORDER BY r.updated_at DESC;
  `);
  return result.rows;
}

async function createRegistry(body = {}, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.intervention_registry (intervention_code, library_id, intervention_title, location_name, village_name, dsd_name, gnd_name, latitude, longitude, priority, status, progress_percent, planned_start_date, planned_end_date, actual_start_date, actual_end_date, lead_officer_name, lead_officer_contact, implementing_office, remarks, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21) RETURNING *;
  `, [body.intervention_code || code(), body.library_id || null, body.intervention_title, body.location_name || null, body.village_name || null, body.dsd_name || null, body.gnd_name || null, num(body.latitude), num(body.longitude), body.priority || 'medium', body.status || 'planned', Number(body.progress_percent || 0), body.planned_start_date || null, body.planned_end_date || null, body.actual_start_date || null, body.actual_end_date || null, body.lead_officer_name || null, body.lead_officer_contact || null, body.implementing_office || null, body.remarks || null, user]);
  return result.rows[0];
}

async function updateRegistry(id, body = {}, user = 'system') {
  const result = await pool.query(`
    UPDATE public.intervention_registry SET library_id=COALESCE($2,library_id), intervention_title=COALESCE($3,intervention_title), location_name=COALESCE($4,location_name), village_name=COALESCE($5,village_name), dsd_name=COALESCE($6,dsd_name), gnd_name=COALESCE($7,gnd_name), latitude=COALESCE($8,latitude), longitude=COALESCE($9,longitude), priority=COALESCE($10,priority), status=COALESCE($11,status), progress_percent=COALESCE($12,progress_percent), planned_start_date=COALESCE($13,planned_start_date), planned_end_date=COALESCE($14,planned_end_date), actual_start_date=COALESCE($15,actual_start_date), actual_end_date=COALESCE($16,actual_end_date), lead_officer_name=COALESCE($17,lead_officer_name), lead_officer_contact=COALESCE($18,lead_officer_contact), implementing_office=COALESCE($19,implementing_office), remarks=COALESCE($20,remarks), updated_by=$21, updated_at=now() WHERE id=$1 RETURNING *;
  `, [id, body.library_id || null, body.intervention_title || null, body.location_name || null, body.village_name || null, body.dsd_name || null, body.gnd_name || null, body.latitude === undefined ? null : num(body.latitude), body.longitude === undefined ? null : num(body.longitude), body.priority || null, body.status || null, body.progress_percent === undefined ? null : Number(body.progress_percent), body.planned_start_date || null, body.planned_end_date || null, body.actual_start_date || null, body.actual_end_date || null, body.lead_officer_name || null, body.lead_officer_contact || null, body.implementing_office || null, body.remarks || null, user]);
  return result.rows[0] || null;
}

async function deleteRegistry(id) {
  const result = await pool.query('DELETE FROM public.intervention_registry WHERE id = $1 RETURNING id;', [id]);
  return result.rowCount > 0;
}

async function createTimeline(interventionId, body = {}, user = 'system') {
  const result = await pool.query(`
    INSERT INTO public.intervention_action_timeline (intervention_id, action_date, action_title, action_description, action_status, progress_percent, officer_name, officer_contact, created_by, updated_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *;
  `, [interventionId, body.action_date || new Date().toISOString().slice(0, 10), body.action_title, body.action_description || null, body.action_status || 'completed', body.progress_percent === undefined ? null : Number(body.progress_percent), body.officer_name || null, body.officer_contact || null, user]);
  if (body.progress_percent !== undefined) await pool.query('UPDATE public.intervention_registry SET progress_percent=$2, updated_by=$3, updated_at=now() WHERE id=$1;', [interventionId, Number(body.progress_percent), user]);
  return result.rows[0];
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

module.exports = { listLibrary, createLibrary, updateLibrary, listRegistry, createRegistry, updateRegistry, deleteRegistry, createTimeline, createOfficer, getGeoJson };