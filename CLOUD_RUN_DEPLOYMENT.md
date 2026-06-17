# Cloud Run Deployment

This project is a Node.js/Fastify application that serves static frontend files from `public/` and API routes from `src/server.js`. It connects directly to Supabase Postgres/PostGIS through the `pg` package using `DATABASE_URL`.

## Prerequisites

- Google Cloud project with Cloud Run and Artifact Registry or Cloud Build enabled.
- Supabase project with the required migrations applied from `database/migrations/`.
- A production `DATABASE_URL` for Supabase Postgres.
- A strong production `JWT_SECRET`.
- `gcloud` CLI authenticated to the target project.

Set the project and region once:

```sh
gcloud config set project YOUR_GCP_PROJECT_ID
gcloud config set run/region asia-southeast1
```

## Build

The repository includes a `Dockerfile` that installs Node dependencies and runs `npm start` on port `8080`.

Build with Cloud Build:

```sh
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/krwmp/portal:latest
```

If the Artifact Registry repository does not exist yet:

```sh
gcloud artifacts repositories create krwmp \
  --repository-format=docker \
  --location=asia-southeast1
```

## Deploy

Deploy the built image to Cloud Run:

```sh
gcloud run deploy krwmp-portal \
  --image asia-southeast1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/krwmp/portal:latest \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars NODE_ENV=production,PORT=8080,JWT_EXPIRES_IN=8h,RATE_LIMIT_MAX=300,RATE_LIMIT_WINDOW="1 minute" \
  --set-secrets DATABASE_URL=krwmp-database-url:latest,JWT_SECRET=krwmp-jwt-secret:latest
```

Use Secret Manager for `DATABASE_URL` and `JWT_SECRET`:

```sh
printf '%s' 'postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true' | \
  gcloud secrets create krwmp-database-url --data-file=-

printf '%s' 'REPLACE_WITH_A_LONG_RANDOM_SECRET' | \
  gcloud secrets create krwmp-jwt-secret --data-file=-
```

For an existing secret, add a new version:

```sh
printf '%s' 'NEW_SECRET_VALUE' | \
  gcloud secrets versions add krwmp-jwt-secret --data-file=-
```

## Environment Variables

Required:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres connection string used by `config/database.js`. |
| `JWT_SECRET` | Required in production for login/session JWT signing. The app throws on startup if this is missing in `NODE_ENV=production`. |
| `NODE_ENV` | Set to `production` on Cloud Run. Enables secure session cookies and Postgres SSL config. |
| `PORT` | Cloud Run injects this automatically; the Dockerfile defaults to `8080`. |

Optional:

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_EXPIRES_IN` | `8h` | Session JWT lifetime. |
| `RATE_LIMIT_MAX` | `300` | Global Fastify rate limit. |
| `RATE_LIMIT_WINDOW` | `1 minute` | Global rate-limit window. |
| `PUBLIC_COMPLAINT_RATE_LIMIT` | `20` | Public complaint submission rate limit. |
| `MAX_LAYER_UPLOAD_SIZE` | `250 MB` | Multipart file limit for layer uploads. |
| `MAX_RASTER_UPLOAD_SIZE` | `250 MB` | Fallback multipart file limit for raster uploads. |
| `MAX_COMPLAINT_PHOTO_SIZE` | `5 MB` | Complaint photo validation limit. |
| `MAX_WATER_QUALITY_PDF_SIZE` | `10 MB` | Water quality PDF validation limit. |
| `KRWMP_SUPERUSERS` | `thulasi` | Comma-separated identifiers treated as superusers by the privilege middleware. |
| `KRWMP_PUBLIC_MAP_USER` | `thulasi` | Fallback map user for public layer access. |

## Supabase SSL

The app enables SSL for Postgres when `NODE_ENV=production`:

```js
ssl: process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: false }
  : false
```

This matches the common Supabase connection-string setup used from managed runtimes, where TLS is required but a local CA bundle is not configured in the container. Use the Supabase connection string from the dashboard, preferably the pooler URL for serverless-style workloads.

Recommended Supabase connection settings for Cloud Run:

- Use the transaction pooler URL when request traffic may scale across multiple instances.
- Keep Cloud Run `--max-instances` aligned with Supabase connection limits.
- Avoid using Supabase service-role credentials in frontend code; this server currently uses direct Postgres credentials only on the backend.

## Storage Persistence Expectations

Cloud Run container filesystems are ephemeral. Files written during a request may disappear when an instance is replaced and are not shared across instances.

The database records persist in Supabase, but these local file paths are not durable on Cloud Run:

| Feature | Local path |
| --- | --- |
| Community issue photos | `public/data/community-issue-photos/` |
| Water quality PDF reports | `public/data/water-quality-reports/` |
| Raster GeoTIFF uploads | `public/data/raster-layers/` |
| Raster preview PNGs | `public/data/raster-previews/` |
| GDAL clipped rasters | `public/data/raster-clipped/` |
| GDAL raster tiles | `public/data/raster-tiles/` |
| GDAL temporary cutlines | `public/data/raster-temp/` |
| Volunteer organisation documents | `public/uploads/volunteer-organisations/` |

For production, move uploaded/generated files to durable object storage before relying on these features across deployments or multiple instances. Suitable options include:

- Google Cloud Storage with signed or public object URLs.
- Supabase Storage with server-side upload/download routes.
- A Cloud Run volume mount backed by Cloud Storage FUSE, if its performance and consistency model fit the workload.

Until storage is externalized, treat uploaded files, generated previews, clipped rasters, and raster tiles as temporary per-instance artifacts.

## GDAL Availability

Raster clipping and tile generation call external binaries:

- `gdalwarp`
- `gdal2tiles.py`

The current `Dockerfile` uses `node:20` and does not install GDAL. The application will still start, but raster clipping/tile generation will return:

```text
GDAL not available. Install GDAL to enable basin clipping and tile generation.
```

To enable GDAL in the container, extend the Dockerfile with GDAL packages before `npm install`:

```dockerfile
FROM node:20

RUN apt-get update \
  && apt-get install -y --no-install-recommends gdal-bin python3-gdal python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
```

After deploying a GDAL-enabled image, verify availability from Cloud Run logs by exercising a raster clipping operation. Locally, you can check:

```sh
docker run --rm IMAGE_NAME gdalwarp --version
docker run --rm IMAGE_NAME gdal2tiles.py --help
```

## Post-Deploy Checks

After deploy:

```sh
gcloud run services describe krwmp-portal \
  --format='value(status.url)'
```

Then verify:

- The root frontend loads.
- Login succeeds and sets the secure `krwmp_session` cookie.
- API routes can query Supabase/PostGIS.
- Public map layers render.
- Upload workflows either use durable storage or are understood to be temporary.
- Raster clipping/tile generation works only if GDAL is installed in the image.
