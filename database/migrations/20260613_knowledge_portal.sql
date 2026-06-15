-- KRWMP Knowledge Portal
-- Supports published research articles, PDFs, videos, write-ups and GIS-linked catchment management resources.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_knowledge_categories_lower_name
  ON public.knowledge_categories (lower(category_name));

CREATE TABLE IF NOT EXISTS public.knowledge_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_knowledge_tags_lower_name
  ON public.knowledge_tags (lower(tag_name));

CREATE TABLE IF NOT EXISTS public.knowledge_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  summary text,
  content_type text NOT NULL DEFAULT 'article',
  category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  publisher_institution_id bigint REFERENCES public.intervention_institutions(id) ON DELETE SET NULL,
  author_institution_id bigint REFERENCES public.intervention_institutions(id) ON DELETE SET NULL,
  publication_year integer,
  language text NOT NULL DEFAULT 'English',
  keywords text,
  abstract text,
  body_content text,
  external_url text,
  file_url text,
  thumbnail_url text,
  video_url text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed','published','archived')),
  is_featured boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  download_count integer NOT NULL DEFAULT 0,
  geom geometry(Point,4326),
  dsd_name text,
  gnd_name text,
  sub_watershed_id uuid REFERENCES public.sub_watersheds(id) ON DELETE SET NULL,
  sub_watershed_name text,
  created_by text,
  updated_by text,
  reviewed_by text,
  review_remarks text,
  reviewed_at timestamptz,
  published_by text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_content_status ON public.knowledge_content(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_type ON public.knowledge_content(content_type);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_category ON public.knowledge_content(category_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_publisher_institution ON public.knowledge_content(publisher_institution_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_author_institution ON public.knowledge_content(author_institution_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_sub_watershed ON public.knowledge_content(sub_watershed_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_geom ON public.knowledge_content USING gist(geom);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_search ON public.knowledge_content USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(abstract,'') || ' ' || coalesce(keywords,'')));

CREATE TABLE IF NOT EXISTS public.knowledge_content_tags (
  content_id uuid NOT NULL REFERENCES public.knowledge_content(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.knowledge_tags(id) ON DELETE CASCADE,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.knowledge_content_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_content_id uuid NOT NULL REFERENCES public.knowledge_content(id) ON DELETE CASCADE,
  related_module text NOT NULL,
  related_record_id text NOT NULL,
  relation_type text,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_content_relations_content ON public.knowledge_content_relations(knowledge_content_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_content_relations_module_record ON public.knowledge_content_relations(related_module, related_record_id);

CREATE OR REPLACE VIEW public.vw_knowledge_dashboard_summary AS
SELECT
  COUNT(*)::integer AS total_resources,
  COUNT(*) FILTER (WHERE status = 'published')::integer AS published_resources,
  COUNT(*) FILTER (WHERE status IN ('draft','submitted','reviewed'))::integer AS pending_resources,
  COUNT(*) FILTER (WHERE content_type = 'pdf')::integer AS pdf_resources,
  COUNT(*) FILTER (WHERE content_type = 'video')::integer AS video_resources,
  COUNT(*) FILTER (WHERE content_type IN ('article','research_paper'))::integer AS article_resources,
  COUNT(*) FILTER (WHERE is_featured = true)::integer AS featured_resources,
  COUNT(*) FILTER (WHERE geom IS NOT NULL)::integer AS gis_linked_resources,
  COALESCE(SUM(view_count), 0)::integer AS total_views,
  COALESCE(SUM(download_count), 0)::integer AS total_downloads
FROM public.knowledge_content;

INSERT INTO public.knowledge_categories (category_name, description, created_by, updated_by)
VALUES
  ('Watershed Management', 'General catchment and watershed management resources.', 'migration', 'migration'),
  ('Riverbank Conservation', 'Riverbank protection, riparian buffers and erosion control resources.', 'migration', 'migration'),
  ('Flood Risk', 'Flood risk, drainage and resilience knowledge resources.', 'migration', 'migration'),
  ('Water Quality', 'Water quality monitoring, pollution and treatment resources.', 'migration', 'migration'),
  ('Community Participation', 'Community engagement, VWMC and volunteer participation resources.', 'migration', 'migration'),
  ('Biodiversity', 'Biodiversity, forest and habitat related resources.', 'migration', 'migration'),
  ('Climate Change', 'Climate change adaptation and resilience resources.', 'migration', 'migration'),
  ('Soil Erosion', 'Soil erosion, landslide and sediment control resources.', 'migration', 'migration'),
  ('Land Use Planning', 'Land use planning, zoning and spatial management resources.', 'migration', 'migration'),
  ('Policy / Guidelines', 'Policies, standards, manuals and guideline documents.', 'migration', 'migration')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
SELECT r.id, 'knowledge_portal', 'Knowledge Portal', true, true, true, true
FROM public.roles r
WHERE lower(r.role_name) = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_privileges rp
    WHERE rp.role_id = r.id AND rp.privilege_key = 'knowledge_portal'
  );

INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
SELECT r.id, 'knowledge_portal', 'Knowledge Portal', true, false, false, false
FROM public.roles r
WHERE lower(r.role_name) <> 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_privileges rp
    WHERE rp.role_id = r.id AND rp.privilege_key = 'knowledge_portal'
  );
