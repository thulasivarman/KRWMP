'use strict';

const pool = require('../../config/database');

const REVIEW_STATUSES = new Set(['pending_review', 'under_review', 'approved', 'rejected', 'needs_revision', 'sync_conflict']);
const DECISIONS = new Set(['under_review', 'approved', 'rejected', 'needs_revision']);

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function jsonValue(value, fallback) {
  if (value === undefined) return fallback;
  return value === null ? null : value;
}

function assertReviewStatus(status) {
  if (!REVIEW_STATUSES.has(status)) throw new Error(`Unsupported review status: ${status}`);
}

function assertDecision(decision) {
  if (!DECISIONS.has(decision)) throw new Error(`Unsupported review decision: ${decision}`);
}

async function createReviewItem({
  moduleName,
  recordKind,
  recordId,
  recordCode = null,
  title = null,
  submittedBy = null,
  validationResult = null,
  duplicateWarnings = [],
  payloadSnapshot = {},
  assignedReviewer = null,
} = {}) {
  if (!moduleName) throw new Error('moduleName is required for review queue item.');
  if (!recordKind) throw new Error('recordKind is required for review queue item.');
  if (!recordId) throw new Error('recordId is required for review queue item.');

  const result = await pool.query(`
    INSERT INTO public.review_queue (
      module_name, record_kind, record_id, record_code, title, review_status,
      submitted_by, validation_result, duplicate_warnings, payload_snapshot, assigned_reviewer
    ) VALUES ($1,$2,$3,$4,$5,'pending_review',$6,$7::jsonb,$8::jsonb,$9::jsonb,$10)
    ON CONFLICT (record_kind, record_id) DO UPDATE SET
      module_name = EXCLUDED.module_name,
      record_code = EXCLUDED.record_code,
      title = EXCLUDED.title,
      review_status = CASE WHEN review_queue.review_status IN ('approved','rejected') THEN review_queue.review_status ELSE 'pending_review' END,
      validation_result = EXCLUDED.validation_result,
      duplicate_warnings = EXCLUDED.duplicate_warnings,
      payload_snapshot = EXCLUDED.payload_snapshot,
      assigned_reviewer = COALESCE(EXCLUDED.assigned_reviewer, review_queue.assigned_reviewer),
      updated_at = now()
    RETURNING *;
  `, [
    moduleName,
    recordKind,
    String(recordId),
    cleanText(recordCode),
    cleanText(title),
    cleanText(submittedBy),
    JSON.stringify(validationResult || {}),
    JSON.stringify(Array.isArray(duplicateWarnings) ? duplicateWarnings : []),
    JSON.stringify(payloadSnapshot || {}),
    cleanText(assignedReviewer),
  ]);
  return result.rows[0];
}

async function listReviewItems({ status = null, moduleName = null, recordKind = null, limit = 100 } = {}) {
  const requestedStatus = cleanText(status);
  if (requestedStatus) assertReviewStatus(requestedStatus);
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const result = await pool.query(`
    SELECT *
    FROM public.review_queue
    WHERE ($1::text IS NULL OR review_status = $1)
      AND ($2::text IS NULL OR module_name = $2)
      AND ($3::text IS NULL OR record_kind = $3)
    ORDER BY submitted_at DESC, updated_at DESC
    LIMIT $4;
  `, [requestedStatus, cleanText(moduleName), cleanText(recordKind), safeLimit]);
  return result.rows;
}

async function getReviewItem(id) {
  const result = await pool.query('SELECT * FROM public.review_queue WHERE id = $1;', [id]);
  return result.rows[0] || null;
}

async function updateLinkedRecordStatus(client, item, decision, reviewer, comment) {
  if (item.record_kind === 'community_issue_report') {
    const mappedStatus = decision === 'approved' ? 'verified' : decision;
    await client.query(`
      UPDATE public.community_issue_reports
      SET status = $2,
          admin_notes = COALESCE($3, admin_notes),
          reviewed_by = $4,
          reviewed_at = now(),
          updated_at = now()
      WHERE id::text = $1;
    `, [item.record_id, mappedStatus, cleanText(comment), cleanText(reviewer)]);
  }
}

async function decideReviewItem(id, { decision, reviewer = null, comment = null, payloadPatch = null } = {}) {
  assertDecision(decision);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM public.review_queue WHERE id = $1 FOR UPDATE;', [id]);
    const item = existing.rows[0];
    if (!item) {
      await client.query('ROLLBACK');
      return null;
    }

    const result = await client.query(`
      UPDATE public.review_queue
      SET review_status = $2,
          reviewed_by = CASE WHEN $2 IN ('approved','rejected','needs_revision') THEN $3 ELSE reviewed_by END,
          reviewed_at = CASE WHEN $2 IN ('approved','rejected','needs_revision') THEN now() ELSE reviewed_at END,
          review_comment = COALESCE($4, review_comment),
          payload_patch = CASE WHEN $5::jsonb IS NULL THEN payload_patch ELSE $5::jsonb END,
          updated_at = now()
      WHERE id = $1
      RETURNING *;
    `, [id, decision, cleanText(reviewer), cleanText(comment), jsonValue(payloadPatch, null) ? JSON.stringify(payloadPatch) : null]);

    await client.query(`
      INSERT INTO public.review_history (review_queue_id, decision, comment, changed_by, payload_patch)
      VALUES ($1,$2,$3,$4,$5::jsonb);
    `, [id, decision, cleanText(comment), cleanText(reviewer), jsonValue(payloadPatch, null) ? JSON.stringify(payloadPatch) : null]);

    await updateLinkedRecordStatus(client, item, decision, reviewer, comment);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getReviewHistory(id) {
  const result = await pool.query(`
    SELECT *
    FROM public.review_history
    WHERE review_queue_id = $1
    ORDER BY created_at ASC;
  `, [id]);
  return result.rows;
}

module.exports = {
  createReviewItem,
  listReviewItems,
  getReviewItem,
  decideReviewItem,
  getReviewHistory,
};
