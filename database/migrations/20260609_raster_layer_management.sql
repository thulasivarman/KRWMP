-- Raster Layer Management database migration
-- Run once in Supabase SQL Editor before using raster uploads.

CREATE TABLE IF NOT EXISTS public.raster_layers (
    id bigserial PRIMARY KEY,
    layer_key text UNIQUE NOT NULL,
    layer_name text NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_type text,
    attribution text,
    default_visible boolean DEFAULT false,
    opacity numeric DEFAULT 0.7,
    min_zoom numeric DEFAULT 0,
    max_zoom numeric DEFAULT 22,
    bounds jsonb,
    active boolean DEFAULT true,
    uploaded_by text,
    uploaded_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    sort_order integer DEFAULT 100
);

CREATE INDEX IF NOT EXISTS idx_raster_layers_active
ON public.raster_layers (active);

CREATE INDEX IF NOT EXISTS idx_raster_layers_sort_order
ON public.raster_layers (sort_order);

CREATE TABLE IF NOT EXISTS public.raster_layer_upload_audit (
    id bigserial PRIMARY KEY,
    layer_key text NOT NULL,
    file_name text,
    file_url text,
    uploaded_by text,
    uploaded_at timestamptz DEFAULT now(),
    action text NOT NULL DEFAULT 'upload'
);
