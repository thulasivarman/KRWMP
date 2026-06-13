const fs = require('fs');
const path = require('path');
const pool = require('../../config/database');

const PDF_DIR = path.join(__dirname, '../../public/data/water-quality-reports');
const PDF_URL_PREFIX = '/data/water-quality-reports';

function cleanText(value) { const text = String(value ?? '').trim(); return text || null; }
function toNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function ensureDir() { if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true }); }
function safeFileName(value) { return String(value || 'signed_report.pdf').replace(/[^a-zA-Z0-9._-]/g, '_'); }
function sampleCode() { return `WQ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,7).toUpperCase()}`; }

async function savePdf(file) {
  if (!file) return null;
  ensureDir();
  const buffer = await file.toBuffer();
  const filename = `${Date.now()}_${safeFileName(file.filename)}`;
  fs.writeFileSync(path.join(PDF_DIR, filename), buffer);
  return `${PDF_URL_PREFIX}/${filename}`;
}

async function listParameters() {
  const result = await pool.query('SELECT * FROM public.water_quality_parameters WHERE active = true ORDER BY category, parameter_name');
  return result.rows;
}

function statusFor(parameter, value, textValue) {
  if ((value === null || value === undefined || value === '') && !textValue) return 'not_tested';
  if (parameter.value_type !== 'numeric') return 'compliant';
  const n = Number(value);
  if (!Number.isFinite(n)) return 'not_tested';
  const fail = (parameter.min_standard !== null && n < Number(parameter.min_standard)) || (parameter.max_standard !== null && n > Number(parameter.max_standard));
  if (!fail) return 'compliant';
  return parameter.category === 'physical' ? 'caution' : 'non_compliant';
}

function overallStatus(items) {
  if (!items.length) return 'not_assessed';
  if (items.some(i => i.status === 'non_compliant')) return 'non_compliant';
  if (items.some(i => i.status === 'caution')) return 'caution';
  if (items.some(i => i.status === 'compliant')) return 'compliant';
  return 'not_assessed';
}

async function createTest({ fields = {}, pdfFile = null, user = 'system' }) {
  const lat = toNumber(fields.latitude);
  const lng = toNumber(fields.longitude);
  if (lat === null || lng === null) throw new Error('Valid latitude and longitude are required.');
  const parameters = await listParameters();
  const byId = new Map(parameters.map(p => [String(p.id), p]));
  const rawResults = Array.isArray(fields.results) ? fields.results : JSON.parse(fields.results || '[]');
  const prepared = rawResults.map(r => {
    const p = byId.get(String(r.parameter_id));
    if (!p) return null;
    const measured = r.measured_value === '' || r.measured_value === null || r.measured_value === undefined ? null : Number(r.measured_value);
    const textValue = cleanText(r.text_value);
    return { parameter: p, measured_value: Number.isFinite(measured) ? measured : null, text_value: textValue, unit: r.unit || p.unit, status: statusFor(p, measured, textValue), remarks: cleanText(r.remarks) };
  }).filter(Boolean);
  const pdfUrl = await savePdf(pdfFile);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`INSERT INTO public.water_quality_tests
      (sample_code, sample_location_name, latitude, longitude, geom, sample_collection_datetime, collected_by, dsd_name, gnd_name, sub_watershed_id, sub_watershed_name, overall_status, signed_report_pdf_url, remarks, created_by, updated_by)
      VALUES ($1,$2,$3,$4,ST_SetSRID(ST_MakePoint($4::double precision,$3::double precision),4326),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
      [cleanText(fields.sample_code) || sampleCode(), cleanText(fields.sample_location_name), lat, lng, fields.sample_collection_datetime, cleanText(fields.collected_by), cleanText(fields.dsd_name), cleanText(fields.gnd_name), cleanText(fields.sub_watershed_id), cleanText(fields.sub_watershed_name), overallStatus(prepared), pdfUrl, cleanText(fields.remarks), user]);
    for (const item of prepared) {
      await client.query('INSERT INTO public.water_quality_test_results (test_id, parameter_id, measured_value, text_value, unit, compliance_status, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7)', [inserted.rows[0].id, item.parameter.id, item.measured_value, item.text_value, item.unit, item.status, item.remarks]);
    }
    await client.query('COMMIT');
    return getTest(inserted.rows[0].id);
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function listTests({ status = null, q = null } = {}) {
  const result = await pool.query(`SELECT * FROM public.water_quality_tests WHERE ($1::text IS NULL OR overall_status=$1) AND ($2::text IS NULL OR sample_code ILIKE '%'||$2||'%' OR sample_location_name ILIKE '%'||$2||'%' OR collected_by ILIKE '%'||$2||'%') ORDER BY sample_collection_datetime DESC, created_at DESC`, [status || null, cleanText(q)]);
  return result.rows;
}

async function getTest(id) {
  const test = await pool.query('SELECT * FROM public.water_quality_tests WHERE id=$1', [id]);
  if (!test.rows[0]) return null;
  const results = await pool.query('SELECT r.*, p.category, p.parameter_key, p.parameter_name, p.min_standard, p.max_standard FROM public.water_quality_test_results r JOIN public.water_quality_parameters p ON p.id=r.parameter_id WHERE r.test_id=$1 ORDER BY p.category, p.parameter_name', [id]);
  return { ...test.rows[0], results: results.rows };
}

async function deleteTest(id) { const result = await pool.query('DELETE FROM public.water_quality_tests WHERE id=$1 RETURNING id', [id]); return result.rowCount > 0; }

async function latestGeoJson() {
  const result = await pool.query(`WITH ranked AS (SELECT t.*, ROW_NUMBER() OVER (PARTITION BY COALESCE((SELECT MIN(t2.id) FROM public.water_quality_tests t2 WHERE ST_DWithin(t.geom::geography,t2.geom::geography,200)),t.id) ORDER BY t.sample_collection_datetime DESC,t.created_at DESC) rn FROM public.water_quality_tests t WHERE t.geom IS NOT NULL) SELECT jsonb_build_object('type','FeatureCollection','features',COALESCE(jsonb_agg(jsonb_build_object('type','Feature','id',id,'geometry',ST_AsGeoJSON(geom)::jsonb,'properties',jsonb_build_object('id',id,'sample_code',sample_code,'sample_location_name',sample_location_name,'sample_collection_datetime',sample_collection_datetime,'collected_by',collected_by,'overall_status',overall_status,'dsd_name',dsd_name,'gnd_name',gnd_name,'sub_watershed_name',sub_watershed_name,'signed_report_pdf_url',signed_report_pdf_url))),'[]'::jsonb)) geojson FROM ranked WHERE rn=1`);
  return result.rows[0].geojson;
}

module.exports = { listParameters, createTest, listTests, getTest, deleteTest, latestGeoJson };
