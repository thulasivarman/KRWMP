const pool = require('../../config/database');
const spatialService = require('./spatial.service');

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function hasOwn(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload || {}, key);
}

function cleanOptionalUrl(value, label = 'URL') {
  const text = cleanText(value);
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch (_) {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${label} must use http or https.`);
  return text;
}

function toNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'y'].includes(String(value).toLowerCase());
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch (_) {}
    return value.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

function validateCoordinates(latitude, longitude) {
  if (latitude === null && longitude === null) return;
  if (latitude === null || longitude === null) throw new Error('Both latitude and longitude are required when adding a GIS location.');
  if (latitude < 5 || latitude > 10) throw new Error('Latitude must be within Sri Lanka coordinate range.');
  if (longitude < 79 || longitude > 82) throw new Error('Longitude must be within Sri Lanka coordinate range.');
}

async function deriveLocation(latitude, longitude) {
  if (latitude === null || longitude === null) return {};
  const identified = await spatialService.identifyLocation(latitude, longitude);
  return {
    dsd_name: identified.dsd?.dsd_name || null,
    gnd_name: identified.gnd?.gnd_name || null,
    sub_watershed_id: identified.sub_watershed?.id || null,
    sub_watershed_name: identified.sub_watershed?.watershed_name || null
  };
}

async function listCategories({ includeInactive = false } = {}) {
  const result = await pool.query(`
    SELECT c.*, COALESCE(k.count, 0)::integer AS content_count
    FROM public.knowledge_categories c
    LEFT JOIN (
      SELECT category_id, COUNT(*) AS count
      FROM public.knowledge_content
      WHERE status = 'published'
      GROUP BY category_id
    ) k ON k.category_id = c.id
    WHERE ($1::boolean = true OR c.is_active = true)
    ORDER BY c.is_active DESC, c.category_name;
  `, [includeInactive]);
  return result.rows;
}

async function createCategory(body = {}, user = 'system') {
  const name = cleanText(body.category_name || body.name);
  if (!name || name.length < 3) throw new Error('Category name must be at least 3 characters.');
  const result = await pool.query(`
    INSERT INTO public.knowledge_categories (category_name, description, is_active, created_by, updated_by)
    VALUES ($1, $2, COALESCE($3::boolean, true), $4, $4)
    RETURNING *;
  `, [name, cleanText(body.description), body.is_active, user]);
  return result.rows[0];
}

async function updateCategory(id, body = {}, user = 'system') {
  const result = await pool.query(`
    UPDATE public.knowledge_categories
    SET category_name = COALESCE($2, category_name),
        description = COALESCE($3, description),
        is_active = COALESCE($4::boolean, is_active),
        updated_by = $5,
        updated_at = now()
    WHERE id = $1
    RETURNING *;
  `, [id, cleanText(body.category_name || body.name), cleanText(body.description), body.is_active, user]);
  return result.rows[0] || null;
}

async function listTags({ includeInactive = false } = {}) {
  const result = await pool.query(`
    SELECT t.*, COALESCE(k.count, 0)::integer AS content_count
    FROM public.knowledge_tags t
    LEFT JOIN (
      SELECT tag_id, COUNT(*) AS count
      FROM public.knowledge_content_tags
      GROUP BY tag_id
    ) k ON k.tag_id = t.id
    WHERE ($1::boolean = true OR t.is_active = true)
    ORDER BY t.is_active DESC, t.tag_name;
  `, [includeInactive]);
  return result.rows;
}

async function ensureTags(tagNames = [], user = 'system') {
  const names = normalizeArray(tagNames);
  if (!names.length) return [];
  const result = await pool.query(`
    INSERT INTO public.knowledge_tags (tag_name, created_by, updated_by)
    SELECT DISTINCT trim(name), $2, $2
    FROM unnest($1::text[]) AS name
    WHERE trim(name) <> ''
    ON CONFLICT (lower(tag_name)) DO UPDATE SET updated_at = now()
    RETURNING id, tag_name;
  `, [names, user]);
  return result.rows;
}

async function setContentTags(client, contentId, tagNames = [], user = 'system') {
  await client.query('DELETE FROM public.knowledge_content_tags WHERE content_id = $1;', [contentId]);
  const tags = await ensureTags(tagNames, user);
  for (const tag of tags) {
    await client.query(`
      INSERT INTO public.knowledge_content_tags (content_id, tag_id, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING;
    `, [contentId, tag.id, user]);
  }
  return tags;
}

async function listContent(query = {}, { publicOnly = false } = {}) {
  const values = [];
  const filters = [];
  if (publicOnly) filters.push(`kc.status = 'published'`);
  if (query.status) { values.push(query.status); filters.push(`kc.status = $${values.length}`); }
  if (query.content_type) { values.push(query.content_type); filters.push(`kc.content_type = $${values.length}`); }
  if (query.category_id) { values.push(query.category_id); filters.push(`kc.category_id = $${values.length}`); }
  if (query.language) { values.push(query.language); filters.push(`kc.language = $${values.length}`); }
  if (query.publication_year) { values.push(Number(query.publication_year)); filters.push(`kc.publication_year = $${values.length}`); }
  if (query.sub_watershed_id) { values.push(query.sub_watershed_id); filters.push(`kc.sub_watershed_id = $${values.length}`); }
  if (query.dsd_name) { values.push(query.dsd_name); filters.push(`kc.dsd_name ILIKE '%' || $${values.length} || '%'`); }
  if (query.featured !== undefined) { values.push(toBool(query.featured)); filters.push(`kc.is_featured = $${values.length}`); }
  if (query.tag) { values.push(query.tag); filters.push(`EXISTS (SELECT 1 FROM public.knowledge_content_tags kct JOIN public.knowledge_tags kt ON kt.id = kct.tag_id WHERE kct.content_id = kc.id AND kt.tag_name ILIKE '%' || $${values.length} || '%')`); }
  if (query.q) {
    values.push(cleanText(query.q));
    filters.push(`(kc.title ILIKE '%' || $${values.length} || '%' OR kc.summary ILIKE '%' || $${values.length} || '%' OR kc.abstract ILIKE '%' || $${values.length} || '%' OR kc.keywords ILIKE '%' || $${values.length} || '%')`);
  }
  const limit = Math.min(Math.max(Number(query.limit || 100), 1), 500);
  values.push(limit);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const result = await pool.query(`
    SELECT kc.*, c.category_name,
      pub.institution_name AS publisher_institution_name,
      auth.institution_name AS author_institution_name,
      COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', kt.id, 'tag_name', kt.tag_name)) FILTER (WHERE kt.id IS NOT NULL), '[]'::jsonb) AS tags,
      ST_Y(kc.geom) AS latitude,
      ST_X(kc.geom) AS longitude
    FROM public.knowledge_content kc
    LEFT JOIN public.knowledge_categories c ON c.id = kc.category_id
    LEFT JOIN public.intervention_institutions pub ON pub.id = kc.publisher_institution_id
    LEFT JOIN public.intervention_institutions auth ON auth.id = kc.author_institution_id
    LEFT JOIN public.knowledge_content_tags kct ON kct.content_id = kc.id
    LEFT JOIN public.knowledge_tags kt ON kt.id = kct.tag_id
    ${where}
    GROUP BY kc.id, c.category_name, pub.institution_name, auth.institution_name
    ORDER BY kc.is_featured DESC, kc.published_at DESC NULLS LAST, kc.created_at DESC
    LIMIT $${values.length};
  `, values);
  return result.rows;
}

async function getContent(id, { publicOnly = false, incrementView = false } = {}) {
  if (incrementView) await pool.query('UPDATE public.knowledge_content SET view_count = COALESCE(view_count,0) + 1 WHERE id = $1 AND status = $2;', [id, 'published']);
  const rows = await listContent({ id, limit: 1 }, { publicOnly });
  let item = rows.find(row => String(row.id) === String(id));
  if (!item) {
    const result = await pool.query(`
      SELECT kc.*, c.category_name, pub.institution_name AS publisher_institution_name, auth.institution_name AS author_institution_name,
        COALESCE(jsonb_agg(DISTINCT jsonb_build_object('id', kt.id, 'tag_name', kt.tag_name)) FILTER (WHERE kt.id IS NOT NULL), '[]'::jsonb) AS tags,
        ST_Y(kc.geom) AS latitude, ST_X(kc.geom) AS longitude
      FROM public.knowledge_content kc
      LEFT JOIN public.knowledge_categories c ON c.id = kc.category_id
      LEFT JOIN public.intervention_institutions pub ON pub.id = kc.publisher_institution_id
      LEFT JOIN public.intervention_institutions auth ON auth.id = kc.author_institution_id
      LEFT JOIN public.knowledge_content_tags kct ON kct.content_id = kc.id
      LEFT JOIN public.knowledge_tags kt ON kt.id = kct.tag_id
      WHERE kc.id = $1 AND ($2::boolean = false OR kc.status = 'published')
      GROUP BY kc.id, c.category_name, pub.institution_name, auth.institution_name;
    `, [id, publicOnly]);
    item = result.rows[0] || null;
  }
  return item;
}

async function createContent(body = {}, user = 'system') {
  const title = cleanText(body.title);
  if (!title || title.length < 5) throw new Error('Knowledge title must be at least 5 characters.');
  const contentType = cleanText(body.content_type) || 'article';
  const latitude = toNumber(body.latitude);
  const longitude = toNumber(body.longitude);
  validateCoordinates(latitude, longitude);
  const derived = await deriveLocation(latitude, longitude);
  const externalUrl = cleanOptionalUrl(body.external_url, 'External URL');
  const fileUrl = cleanOptionalUrl(body.file_url, 'File URL');
  const thumbnailUrl = cleanOptionalUrl(body.thumbnail_url, 'Thumbnail URL');
  const videoUrl = cleanOptionalUrl(body.video_url, 'Video URL');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      INSERT INTO public.knowledge_content
        (title, summary, content_type, category_id, publisher_institution_id, author_institution_id, publication_year, language, keywords, abstract, body_content, external_url, file_url, thumbnail_url, video_url, status, is_featured, geom, dsd_name, gnd_name, sub_watershed_id, sub_watershed_name, created_by, updated_by, published_at, published_by)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16,'draft'),COALESCE($17::boolean,false),CASE WHEN $18::double precision IS NULL OR $19::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($19::double precision,$18::double precision),4326) END,$20,$21,$22,$23,$24,$24,CASE WHEN COALESCE($16,'draft') = 'published' THEN now() ELSE NULL END,CASE WHEN COALESCE($16,'draft') = 'published' THEN $24 ELSE NULL END)
      RETURNING id;
    `, [title, cleanText(body.summary), contentType, body.category_id || null, body.publisher_institution_id || null, body.author_institution_id || null, body.publication_year ? Number(body.publication_year) : null, cleanText(body.language) || 'English', cleanText(body.keywords), cleanText(body.abstract), cleanText(body.body_content), externalUrl, fileUrl, thumbnailUrl, videoUrl, cleanText(body.status) || 'draft', body.is_featured, latitude, longitude, derived.dsd_name, derived.gnd_name, derived.sub_watershed_id, derived.sub_watershed_name, user]);
    await setContentTags(client, result.rows[0].id, body.tags || body.tag_names || [], user);
    await client.query('COMMIT');
    return getContent(result.rows[0].id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateContent(id, body = {}, user = 'system') {
  const existing = await getContent(id);
  if (!existing) return null;
  const latitude = toNumber(body.latitude ?? existing.latitude);
  const longitude = toNumber(body.longitude ?? existing.longitude);
  validateCoordinates(latitude, longitude);
  const derived = await deriveLocation(latitude, longitude);
  const externalUrl = hasOwn(body, 'external_url') ? cleanOptionalUrl(body.external_url, 'External URL') : existing.external_url;
  const fileUrl = hasOwn(body, 'file_url') ? cleanOptionalUrl(body.file_url, 'File URL') : existing.file_url;
  const thumbnailUrl = hasOwn(body, 'thumbnail_url') ? cleanOptionalUrl(body.thumbnail_url, 'Thumbnail URL') : existing.thumbnail_url;
  const videoUrl = hasOwn(body, 'video_url') ? cleanOptionalUrl(body.video_url, 'Video URL') : existing.video_url;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      UPDATE public.knowledge_content
      SET title = COALESCE($2, title), summary = COALESCE($3, summary), content_type = COALESCE($4, content_type), category_id = COALESCE($5::uuid, category_id), publisher_institution_id = $6::uuid, author_institution_id = $7::uuid, publication_year = $8::integer, language = COALESCE($9, language), keywords = $10, abstract = $11, body_content = $12, external_url = $13, file_url = $14, thumbnail_url = $15, video_url = $16, status = COALESCE($17, status), is_featured = COALESCE($18::boolean, is_featured), geom = CASE WHEN $19::double precision IS NULL OR $20::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($20::double precision,$19::double precision),4326) END, dsd_name = $21, gnd_name = $22, sub_watershed_id = $23::uuid, sub_watershed_name = $24, updated_by = $25, updated_at = now(), published_at = CASE WHEN COALESCE($17, status) = 'published' AND published_at IS NULL THEN now() ELSE published_at END, published_by = CASE WHEN COALESCE($17, status) = 'published' AND published_by IS NULL THEN $25 ELSE published_by END
      WHERE id = $1;
    `, [id, cleanText(body.title), cleanText(body.summary), cleanText(body.content_type), body.category_id || existing.category_id || null, body.publisher_institution_id || null, body.author_institution_id || null, body.publication_year ? Number(body.publication_year) : existing.publication_year || null, cleanText(body.language), cleanText(body.keywords), cleanText(body.abstract), cleanText(body.body_content), externalUrl, fileUrl, thumbnailUrl, videoUrl, cleanText(body.status), body.is_featured, latitude, longitude, derived.dsd_name, derived.gnd_name, derived.sub_watershed_id, derived.sub_watershed_name, user]);
    if (body.tags !== undefined || body.tag_names !== undefined) await setContentTags(client, id, body.tags || body.tag_names || [], user);
    await client.query('COMMIT');
    return getContent(id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteContent(id, user = 'system') {
  const result = await pool.query(`
    UPDATE public.knowledge_content
    SET status = 'archived', updated_by = $2, updated_at = now()
    WHERE id = $1
    RETURNING id;
  `, [id, user]);
  return result.rowCount > 0;
}

async function dashboard() {
  const [summary, byType, byCategory, byStatus, byWatershed, recent, pending] = await Promise.all([
    pool.query('SELECT * FROM public.vw_knowledge_dashboard_summary;'),
    pool.query('SELECT content_type, COUNT(*)::integer AS count FROM public.knowledge_content GROUP BY content_type ORDER BY count DESC, content_type;'),
    pool.query(`SELECT COALESCE(c.category_name, 'Uncategorised') AS category_name, COUNT(kc.*)::integer AS count FROM public.knowledge_content kc LEFT JOIN public.knowledge_categories c ON c.id = kc.category_id GROUP BY COALESCE(c.category_name, 'Uncategorised') ORDER BY count DESC, category_name LIMIT 15;`),
    pool.query('SELECT status, COUNT(*)::integer AS count FROM public.knowledge_content GROUP BY status ORDER BY status;'),
    pool.query(`SELECT COALESCE(sub_watershed_name, 'Not Located') AS sub_watershed_name, COUNT(*)::integer AS count FROM public.knowledge_content GROUP BY COALESCE(sub_watershed_name, 'Not Located') ORDER BY count DESC LIMIT 15;`),
    pool.query(`SELECT id, title, content_type, status, is_featured, created_at, published_at FROM public.knowledge_content ORDER BY created_at DESC LIMIT 10;`),
    pool.query(`SELECT id, title, content_type, status, updated_at FROM public.knowledge_content WHERE status IN ('draft','submitted','reviewed') ORDER BY updated_at DESC LIMIT 20;`)
  ]);
  return { summary: summary.rows[0] || {}, by_type: byType.rows, by_category: byCategory.rows, by_status: byStatus.rows, by_sub_watershed: byWatershed.rows, recent: recent.rows, pending_review: pending.rows };
}

async function geoJson(query = {}) {
  const rows = await listContent({ ...query, limit: query.limit || 500 }, { publicOnly: query.public === 'true' });
  return {
    type: 'FeatureCollection',
    features: rows.filter(row => row.latitude !== null && row.longitude !== null).map(row => ({
      type: 'Feature',
      id: row.id,
      geometry: { type: 'Point', coordinates: [Number(row.longitude), Number(row.latitude)] },
      properties: {
        id: row.id,
        title: row.title,
        content_type: row.content_type,
        category_name: row.category_name,
        status: row.status,
        publication_year: row.publication_year,
        language: row.language,
        dsd_name: row.dsd_name,
        gnd_name: row.gnd_name,
        sub_watershed_name: row.sub_watershed_name,
        external_url: row.external_url,
        file_url: row.file_url,
        video_url: row.video_url
      }
    }))
  };
}

async function report(query = {}) {
  const records = await listContent({ ...query, limit: 500 });
  const summary = await dashboard();
  return { summary: summary.summary, by_type: summary.by_type, by_category: summary.by_category, records };
}

module.exports = { listCategories, createCategory, updateCategory, listTags, ensureTags, listContent, getContent, createContent, updateContent, deleteContent, dashboard, geoJson, report };
