const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

let s3Client;
const memoryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ITEMS = 20;

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
  const bucket = cleanText(process.env.RASTER_R2_BUCKET) || cleanText(process.env.R2_BUCKET) || cleanText(process.env.R2_BUCKET_NAME);
  if (!bucket) throw new Error('Critical configuration missing: RASTER_R2_BUCKET or R2_BUCKET is not defined.');
  return bucket;
}

function getR2Endpoint() {
  if (cleanText(process.env.R2_ENDPOINT)) return cleanText(process.env.R2_ENDPOINT);
  const accountId = requiredEnv('R2_ACCOUNT_ID');
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function getClient() {
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

function publicUrlForObject(objectKey) {
  const baseUrl = cleanText(process.env.RASTER_R2_PUBLIC_BASE_URL) || cleanText(process.env.R2_PUBLIC_BASE_URL);
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}`;
}

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) return stream;
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function cacheGet(key) {
  const item = memoryCache.get(key);
  if (!item) return null;
  if (Date.now() - item.createdAt > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return item.buffer;
}

function cacheSet(key, buffer) {
  if (memoryCache.size >= MAX_CACHE_ITEMS) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, { buffer, createdAt: Date.now() });
}

async function putObject({ objectKey, buffer, contentType = 'application/octet-stream', metadata = {} }) {
  const bucket = getBucket();
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: buffer,
    ContentType: contentType,
    Metadata: Object.fromEntries(Object.entries(metadata || {}).map(([key, value]) => [key, String(value)])),
  }));
  cacheSet(objectKey, buffer);
  return { bucket, object_key: objectKey, public_url: publicUrlForObject(objectKey) };
}

async function getObjectBuffer(objectKey, { useCache = true } = {}) {
  if (useCache) {
    const cached = cacheGet(objectKey);
    if (cached) return cached;
  }
  const response = await getClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: objectKey }));
  const buffer = await streamToBuffer(response.Body);
  cacheSet(objectKey, buffer);
  return buffer;
}

async function deleteObject(objectKey) {
  if (!objectKey) return false;
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: objectKey }));
  memoryCache.delete(objectKey);
  return true;
}

module.exports = {
  deleteObject,
  getBucket,
  getObjectBuffer,
  publicUrlForObject,
  putObject,
};
