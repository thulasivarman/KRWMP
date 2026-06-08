-- Vector Layer Management database migration
-- Run this once in Supabase SQL Editor before using database-backed uploads.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.gis_layers
ADD COLUMN IF NOT EXISTS uploaded_by text,
ADD COLUMN IF NOT EXISTS uploaded_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS managed_by_admin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS geometry_type text,
ADD COLUMN IF NOT EXISTS popup_fields jsonb DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.gis_layer_upload_audit (
    id bigserial PRIMARY KEY,
    layer_key text NOT NULL,
    table_name text NOT NULL,
    original_filename text,
    feature_count integer DEFAULT 0,
    geometry_type text,
    uploaded_by text,
    uploaded_at timestamptz DEFAULT now(),
    action text NOT NULL DEFAULT 'upload'
);

CREATE INDEX IF NOT EXISTS idx_gis_layers_managed_by_admin
ON public.gis_layers (managed_by_admin);
