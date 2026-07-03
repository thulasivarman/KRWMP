const path = require('path');
const { randomUUID } = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const uploadedFilesRepository = require('./uploaded-files.repository');

const DEFAULT_UPLOAD_EXPIRES_SECONDS = 15 * 60;
const DEFAULT_DOWNLOAD_EXPIRES_SECONDS = 10 * 60;
const MODULE_KEY_PATTERN = /^[a-z0-9_]+$/;

let s3Client;

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function requiredEnv(name) {
  const value = cleanText(process.env[name]);
  if (!value) throw new Error(`Critical configuration missing: ${name} is not defined.`);
  return value;
}

function getBucket() {
  const bucket = cleanText(process.env.R2_BUCKET) || cleanText(process.env.R2_BUCKET_NAME);
  if (!bucket) throw new Error('Critical configuration missing: R2_BUCKET is not defined.');
  return bucket;
}

function getR2Endpoint() {
  if (cleanText(process.env.R2_ENDPOINT)) return cleanText(process.env.R2_ENDPOINT);
  const accountId = requiredEnv('R2_ACCOUNT_ID');
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getS3Client() {
  if (s3Client) return s3Client;
  s3Client = new S3Client({
    region: process.env.R2_REGION || 'auto',
    endpoint: getR2Endpoint(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  return s3Client;
}

function resetClientForTests() {
  s3Client = null;
}

function normalizeExpires(value, fallback) {
  const seconds = Number(value || fallback);
  if (!Number.isFinite(seconds)) return fallback;
  return Math.min(Math.max(Math.trunc(seconds), 60), 7 * 24 * 60 * 60);
}

function assertModuleKey(moduleKey) {
  const value = cleanText(moduleKey);
  if (!value || !MODULE_KEY_PATTERN.test(value)) {
    const error = new Error('module_key is required and must contain only lowercase letters, numbers and underscores.');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function sanitizeFilename(filename) {
  const base = path.basename(cleanText(filename) || 'attachment').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const trimmed = base.replace(/^-+|-+$/g, '').slice(0, 160);
  return trimmed || 'attachment';
}

function buildObjectKey(payload = {}) {
  const moduleKey = assertModuleKey(payload.module_key);
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const recordPart = cleanText(payload.record_id) || 'unassigned';
  const filename = sanitizeFilename(payload.original_filename);
  return [
    'attachments',
    moduleKey,
    yyyy,
    mm,
    encodeURIComponent(String(recordPart)),
    `${randomUUID()}-${filename}`,
  ].join('/');
}

function publicUrlForObject(objectKey) {
  const baseUrl = cleanText(process.env.R2_PUBLIC_BASE_URL);
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

function signedMetadataHeaders(attachment = {}) {
  return {
    'x-amz-meta-attachment_id': String(attachment.id),
    'x-amz-meta-module_key': String(attachment.module_key),
  };
}

function uploadHeaders(mimeType, attachment = {}) {
  const headers = signedMetadataHeaders(attachment);
  if (cleanText(mimeType)) headers['Content-Type'] = cleanText(mimeType);
  return headers;
}

async function createPresignedUploadUrl(payload = {}, user = 'system') {
  const bucket = getBucket();
  const objectKey = buildObjectKey(payload);
  const mimeType = cleanText(payload.mime_type);
  const attachment = await uploadedFilesRepository.createUploadedFile({
    module_key: assertModuleKey(payload.module_key),
    record_id: payload.record_id,
    record_kind: cleanText(payload.record_kind),
    attachment_role: cleanText(payload.attachment_role) || 'attachment',
    original_filename: sanitizeFilename(payload.original_filename),
    bucket,
    object_key: objectKey,
    public_url: publicUrlForObject(objectKey),
    mime_type: mimeType,
    file_size_bytes: payload.file_size_bytes === undefined ? 0 : Number(payload.file_size_bytes),
    checksum_sha256: cleanText(payload.checksum_sha256),
    metadata: payload.metadata || {},
    visibility: cleanText(payload.visibility) || 'module',
    status: 'pending',
    uploaded_by: user,
  });

  const objectMetadata = {
    attachment_id: String(attachment.id),
    module_key: String(attachment.module_key),
  };
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: mimeType || undefined,
    Metadata: objectMetadata,
  });
  const expiresIn = normalizeExpires(payload.expires_in || process.env.R2_UPLOAD_URL_EXPIRES_SECONDS, DEFAULT_UPLOAD_EXPIRES_SECONDS);
  const url = await getSignedUrl(getS3Client(), command, { expiresIn });

  return {
    attachment,
    upload: {
      url,
      method: 'PUT',
      headers: uploadHeaders(mimeType, attachment),
      expires_in: expiresIn,
    },
  };
}

async function completeUpload(attachmentId, metadata = {}, user = 'system') {
  const existing = await uploadedFilesRepository.getUploadedFile(attachmentId);
  if (!existing) return null;
  return uploadedFilesRepository.updateUploadedFile(attachmentId, {
    record_id: metadata.record_id,
    record_kind: cleanText(metadata.record_kind),
    attachment_role: cleanText(metadata.attachment_role),
    visibility: cleanText(metadata.visibility),
    file_size_bytes: metadata.file_size_bytes,
    checksum_sha256: cleanText(metadata.checksum_sha256),
    mime_type: cleanText(metadata.mime_type),
    metadata: { ...(existing.metadata || {}), ...(metadata.metadata || {}), completed_by: user },
    status: 'attached',
  });
}

async function getAttachment(attachmentId, options = {}) {
  return uploadedFilesRepository.getUploadedFile(attachmentId, options);
}

async function createPresignedDownloadUrl(attachmentId, options = {}) {
  const attachment = await uploadedFilesRepository.getUploadedFile(attachmentId);
  if (!attachment) return null;
  const expiresIn = normalizeExpires(options.expires_in || process.env.R2_DOWNLOAD_URL_EXPIRES_SECONDS, DEFAULT_DOWNLOAD_EXPIRES_SECONDS);
  const command = new GetObjectCommand({
    Bucket: attachment.bucket || getBucket(),
    Key: attachment.object_key,
    ResponseContentDisposition: options.download === false
      ? undefined
      : `attachment; filename="${sanitizeFilename(attachment.original_filename)}"`,
  });
  const url = await getSignedUrl(getS3Client(), command, { expiresIn });
  return { attachment, download: { url, method: 'GET', expires_in: expiresIn } };
}

async function listAttachments(filters = {}) {
  return uploadedFilesRepository.listUploadedFiles({
    module_key: filters.module_key ? assertModuleKey(filters.module_key) : undefined,
    record_id: filters.record_id,
    attachment_role: cleanText(filters.attachment_role),
    status: cleanText(filters.status) || 'attached',
    includeDeleted: filters.include_deleted === true || filters.includeDeleted === true,
    limit: filters.limit,
  });
}

async function softDeleteAttachment(attachmentId, user = 'system') {
  return uploadedFilesRepository.markUploadedFileDeleted(attachmentId, user);
}

module.exports = {
  buildObjectKey,
  completeUpload,
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  getAttachment,
  getS3Client,
  getBucket,
  listAttachments,
  resetClientForTests,
  softDeleteAttachment,
};
