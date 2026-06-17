const pool = require('../../config/database');

function normalizeLimit(value, fallback = 100) {
  const limit = Number(value || fallback);
  if (!Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

function rowToUploadedFile(row) {
  return row || null;
}

async function createUploadedFile(payload = {}, client = pool) {
  const result = await client.query(`
    INSERT INTO public.uploaded_files (
      module_key, record_id, record_kind, attachment_role, original_filename,
      storage_provider, bucket, object_key, public_url, mime_type, file_size_bytes,
      checksum_sha256, metadata, visibility, status, uploaded_by
    ) VALUES (
      $1,$2,$3,$4,$5,COALESCE($6,'cloudflare_r2'),$7,$8,$9,$10,COALESCE($11,0),
      $12,COALESCE($13::jsonb,'{}'::jsonb),COALESCE($14,'module'),COALESCE($15,'attached'),$16
    )
    RETURNING *;
  `, [
    payload.module_key,
    payload.record_id === undefined || payload.record_id === null || payload.record_id === '' ? null : String(payload.record_id),
    payload.record_kind || null,
    payload.attachment_role || 'attachment',
    payload.original_filename,
    payload.storage_provider || 'cloudflare_r2',
    payload.bucket,
    payload.object_key,
    payload.public_url || null,
    payload.mime_type || null,
    payload.file_size_bytes === undefined ? 0 : Number(payload.file_size_bytes),
    payload.checksum_sha256 || null,
    JSON.stringify(payload.metadata || {}),
    payload.visibility || 'module',
    payload.status || 'attached',
    payload.uploaded_by || null,
  ]);
  return rowToUploadedFile(result.rows[0]);
}

async function getUploadedFile(id, { includeDeleted = false } = {}, client = pool) {
  const result = await client.query(`
    SELECT *
    FROM public.uploaded_files
    WHERE id = $1
      AND ($2::boolean = true OR deleted_at IS NULL)
    LIMIT 1;
  `, [id, includeDeleted]);
  return rowToUploadedFile(result.rows[0]);
}

async function listUploadedFiles(filters = {}, client = pool) {
  const values = [];
  const clauses = [];

  if (filters.module_key) {
    values.push(filters.module_key);
    clauses.push(`module_key = $${values.length}`);
  }
  if (filters.record_id !== undefined && filters.record_id !== null && filters.record_id !== '') {
    values.push(String(filters.record_id));
    clauses.push(`record_id = $${values.length}`);
  }
  if (filters.attachment_role) {
    values.push(filters.attachment_role);
    clauses.push(`attachment_role = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }
  if (!filters.includeDeleted) clauses.push('deleted_at IS NULL');

  values.push(normalizeLimit(filters.limit));
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await client.query(`
    SELECT *
    FROM public.uploaded_files
    ${where}
    ORDER BY created_at DESC
    LIMIT $${values.length};
  `, values);
  return result.rows;
}

async function updateUploadedFile(id, patch = {}, client = pool) {
  const result = await client.query(`
    UPDATE public.uploaded_files
    SET record_id = COALESCE($2, record_id),
        record_kind = COALESCE($3, record_kind),
        attachment_role = COALESCE($4, attachment_role),
        public_url = COALESCE($5, public_url),
        mime_type = COALESCE($6, mime_type),
        file_size_bytes = COALESCE($7, file_size_bytes),
        checksum_sha256 = COALESCE($8, checksum_sha256),
        metadata = COALESCE($9::jsonb, metadata),
        visibility = COALESCE($10, visibility),
        status = COALESCE($11, status),
        updated_at = now()
    WHERE id = $1
      AND deleted_at IS NULL
    RETURNING *;
  `, [
    id,
    patch.record_id === undefined || patch.record_id === null || patch.record_id === '' ? null : String(patch.record_id),
    patch.record_kind || null,
    patch.attachment_role || null,
    patch.public_url || null,
    patch.mime_type || null,
    patch.file_size_bytes === undefined ? null : Number(patch.file_size_bytes),
    patch.checksum_sha256 || null,
    patch.metadata === undefined ? null : JSON.stringify(patch.metadata || {}),
    patch.visibility || null,
    patch.status || null,
  ]);
  return rowToUploadedFile(result.rows[0]);
}

async function markUploadedFileDeleted(id, deletedBy = null, client = pool) {
  const result = await client.query(`
    UPDATE public.uploaded_files
    SET status = 'deleted',
        deleted_at = now(),
        deleted_by = $2,
        updated_at = now()
    WHERE id = $1
      AND deleted_at IS NULL
    RETURNING *;
  `, [id, deletedBy]);
  return rowToUploadedFile(result.rows[0]);
}

module.exports = {
  createUploadedFile,
  getUploadedFile,
  listUploadedFiles,
  markUploadedFileDeleted,
  updateUploadedFile,
};
