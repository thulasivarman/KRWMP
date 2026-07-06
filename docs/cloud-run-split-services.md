# Cloud Run Split Services

This repository can deploy the same container image as two Cloud Run services:

- API Core: `npm run start:api`, backed by `src/server.js`.
- GIS Service: `npm run start:gis`, backed by `src/gis-server.js`.

`npm start` aliases API Core. The `Dockerfile` defaults to `npm run start:api`, so GIS deployments should override the Cloud Run command.

## Required Shared Variables

Set these for both API Core and GIS Service.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Supabase/Postgres connection string. Required at startup by `config/database.js`. |
| `JWT_SECRET` | Yes in production | Used to verify session tokens and protect privileged GIS/API routes. `NODE_ENV=production` fails without it. |
| `NODE_ENV` | Yes | Use `production` on Cloud Run. Enables production cookie and database SSL behavior. |
| `PORT` | Yes on Cloud Run | Cloud Run injects this automatically. Use `8080` in examples. |
| `KRWMP_PUBLIC_MAP_USER` | Recommended | Fallback identifier for public map/layer requests when no user token is present. Defaults to `thulasi` if unset. |
| `KRWMP_SUPERUSERS` | Recommended | Comma-separated superuser identifiers. Defaults to `thulasi`. |

## API Core Variables

API Core should normally disable GIS-heavy route registration and let the GIS service serve map traffic.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ENABLE_GIS_ROUTES` | Recommended | `true` | Set to `false` for split API Core deployments. When unset, current monolith behavior is preserved. |
| `GIS_API_BASE_URL` | Recommended for split deployment | empty | Public base URL for the GIS Cloud Run service, for example `https://krwmp-gis-abc.a.run.app`. Exposed to the browser by `/api/runtime-config`. |
| `RATE_LIMIT_MAX` | No | `300` | Global API Core rate limit. |
| `RATE_LIMIT_WINDOW` | No | `1 minute` | Global API Core rate-limit window. |
| `JWT_EXPIRES_IN` | No | `8h` | Session JWT lifetime. |
| `PUBLIC_COMPLAINT_RATE_LIMIT` | No | `20` | Public complaint submission rate limit. |
| `MAX_LAYER_UPLOAD_SIZE` | No | `250 MB` | Multipart upload limit. Still relevant if API Core keeps vector/raster admin routes. |
| `MAX_RASTER_UPLOAD_SIZE` | No | `250 MB` | Fallback multipart raster upload limit. |
| `MAX_COMPLAINT_PHOTO_SIZE` | No | `5 MB` | Community issue photo validation limit. |
| `MAX_WATER_QUALITY_PDF_SIZE` | No | `10 MB` | Water quality PDF validation limit. |

## GIS Service Variables

GIS Service registers only map-serving and GIS-heavy routes: spatial boundaries, dynamic layers, vector tiles, raster tiles, display raster registry, and read-only pollution-pressure map analytics.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `GIS_RATE_LIMIT_MAX` | No | `RATE_LIMIT_MAX` or `600` | GIS service rate limit. |
| `GIS_RATE_LIMIT_WINDOW` | No | `RATE_LIMIT_WINDOW` or `1 minute` | GIS service rate-limit window. |
| `GIS_PORT` | No | `PORT` or `8080` | Useful for local runs. On Cloud Run, prefer `PORT`. |
| `GIS_CORS_ORIGIN` | Recommended for split deployment | `*` | Comma-separated allowed browser origins for GIS responses. Use the API/frontend service URL in production. |
| `KRWMP_PUBLIC_MAP_USER` | Recommended | `thulasi` | Used by layer, vector tile, and raster tile routes when requests are unauthenticated. |

## Frontend GIS Base URL

Map-facing frontend code resolves GIS URLs in this order:

1. `window.KRWMP_CONFIG.GIS_API_BASE_URL`
2. `window.KRWMP_GIS_API_BASE_URL`
3. `<meta name="gis-api-base-url" content="...">`
4. `localStorage.GIS_API_BASE_URL`
5. Same-origin paths such as `/api/layers`

API Core exposes `process.env.GIS_API_BASE_URL` through `/api/runtime-config`, and `public/assets/js/app.js` loads that config before the map layer registry starts. If no GIS base URL is configured, vector tile URLs, raster tile URLs, and GeoJSON layer URLs continue to use the current same-origin `/api/...` paths for local development.

## R2 / Object Storage Variables

These are required when GIS raster previews or API file attachments are stored in R2-compatible object storage.

| Variable | Required | Used By | Notes |
| --- | --- | --- | --- |
| `R2_ACCOUNT_ID` | Required unless `R2_ENDPOINT` is set | API Core, GIS Service | Used to build `https://<account>.r2.cloudflarestorage.com`. |
| `R2_ENDPOINT` | Optional | API Core, GIS Service | Explicit S3-compatible endpoint. If set, `R2_ACCOUNT_ID` is not needed for endpoint construction. |
| `R2_REGION` | No | API Core, GIS Service | Defaults to `auto`. |
| `R2_ACCESS_KEY_ID` | Yes for R2 operations | API Core, GIS Service | Access key for signed upload/download and raster preview reads. |
| `R2_SECRET_ACCESS_KEY` | Yes for R2 operations | API Core, GIS Service | Secret key for signed upload/download and raster preview reads. |
| `R2_BUCKET` or `R2_BUCKET_NAME` | Yes for general attachments | API Core | Used by `file-attachment.service.js`. |
| `R2_PUBLIC_BASE_URL` | Recommended | API Core, GIS Service | Public base URL for stored objects. |
| `RASTER_R2_BUCKET` | Recommended for GIS | GIS Service | Raster-specific bucket override. Falls back to `R2_BUCKET` or `R2_BUCKET_NAME`. |
| `RASTER_R2_PUBLIC_BASE_URL` | Recommended for GIS | GIS Service | Raster-specific public base URL override. Falls back to `R2_PUBLIC_BASE_URL`. |
| `R2_UPLOAD_URL_EXPIRES_SECONDS` | No | API Core | Signed upload URL lifetime. |
| `R2_DOWNLOAD_URL_EXPIRES_SECONDS` | No | API Core | Signed download URL lifetime. |

If raster previews are only on the local filesystem, GIS can still serve existing `public/data/raster-*` paths from the container. Cloud Run filesystems are ephemeral and not shared across instances, so production raster workflows should use object storage.

## Cloud Run Examples

Build one image:

```sh
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/krwmp/portal:latest
```

Deploy API Core:

```sh
gcloud run deploy krwmp-api \
  --image asia-southeast1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/krwmp/portal:latest \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars NODE_ENV=production,PORT=8080,ENABLE_GIS_ROUTES=false,GIS_API_BASE_URL=https://YOUR_GIS_SERVICE_URL,RATE_LIMIT_MAX=300,RATE_LIMIT_WINDOW="1 minute",KRWMP_PUBLIC_MAP_USER=thulasi \
  --set-secrets DATABASE_URL=krwmp-database-url:latest,JWT_SECRET=krwmp-jwt-secret:latest
```

Deploy GIS Service from the same image:

```sh
gcloud run deploy krwmp-gis \
  --image asia-southeast1-docker.pkg.dev/YOUR_GCP_PROJECT_ID/krwmp/portal:latest \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --command npm \
  --args run,start:gis \
  --set-env-vars NODE_ENV=production,PORT=8080,GIS_RATE_LIMIT_MAX=600,GIS_RATE_LIMIT_WINDOW="1 minute",GIS_CORS_ORIGIN=https://YOUR_API_SERVICE_URL,KRWMP_PUBLIC_MAP_USER=thulasi \
  --set-secrets DATABASE_URL=krwmp-database-url:latest,JWT_SECRET=krwmp-jwt-secret:latest,R2_ACCESS_KEY_ID=krwmp-r2-access-key-id:latest,R2_SECRET_ACCESS_KEY=krwmp-r2-secret-access-key:latest
```

Add the R2 bucket, endpoint, and public URL values as regular environment variables or secrets according to the deployment's security policy.

## Recommended Split

API Core:

- `npm run start:api`
- `ENABLE_GIS_ROUTES=false`
- Handles auth, admin, CRUD, audits, reports, uploads, and non-map workflows.

GIS Service:

- `npm run start:gis`
- Handles `/api/spatial/*`, `/api/layers`, `/api/tiles/*`, `/api/raster-tiles/*`, `/api/raster-layers`, and read-only pollution-pressure map analytics.
- Needs the same `JWT_SECRET` as API Core so authenticated map requests continue to authorize correctly.
