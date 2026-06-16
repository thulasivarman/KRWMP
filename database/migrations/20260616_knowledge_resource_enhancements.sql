-- KRWMP Knowledge Resource Enhancements
-- Adds production controls for public access, admin status workflow, soft delete and source validation.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.knowledge_content
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_by text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_mime_type text;

ALTER TABLE public.knowledge_content
  DROP CONSTRAINT IF EXISTS knowledge_content_status_check;

ALTER TABLE public.knowledge_content
  ADD CONSTRAINT knowledge_content_status_check
  CHECK (status IN ('draft','pending','submitted','reviewed','published','rejected','archived'));

CREATE INDEX IF NOT EXISTS idx_knowledge_content_public
  ON public.knowledge_content(status, published_at DESC)
  WHERE COALESCE(is_deleted, false) = false;

CREATE INDEX IF NOT EXISTS idx_knowledge_content_deleted
  ON public.knowledge_content(is_deleted);

CREATE OR REPLACE VIEW public.vw_knowledge_dashboard_summary AS
SELECT
  COUNT(*) FILTER (WHERE COALESCE(is_deleted, false) = false)::integer AS total_resources,
  COUNT(*) FILTER (WHERE status = 'published' AND COALESCE(is_deleted, false) = false)::integer AS published_resources,
  COUNT(*) FILTER (WHERE status IN ('draft','pending','submitted','reviewed') AND COALESCE(is_deleted, false) = false)::integer AS pending_resources,
  COUNT(*) FILTER (WHERE content_type = 'pdf' AND COALESCE(is_deleted, false) = false)::integer AS pdf_resources,
  COUNT(*) FILTER (WHERE content_type IN ('video','video_link') AND COALESCE(is_deleted, false) = false)::integer AS video_resources,
  COUNT(*) FILTER (WHERE content_type IN ('article','research_paper') AND COALESCE(is_deleted, false) = false)::integer AS article_resources,
  COUNT(*) FILTER (WHERE is_featured = true AND COALESCE(is_deleted, false) = false)::integer AS featured_resources,
  COUNT(*) FILTER (WHERE geom IS NOT NULL AND COALESCE(is_deleted, false) = false)::integer AS gis_linked_resources,
  COALESCE(SUM(view_count) FILTER (WHERE COALESCE(is_deleted, false) = false), 0)::integer AS total_views,
  COALESCE(SUM(download_count) FILTER (WHERE COALESCE(is_deleted, false) = false), 0)::integer AS total_downloads
FROM public.knowledge_content;
