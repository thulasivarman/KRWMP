-- R2-backed raster storage and PNG raster tile endpoint support.
-- Existing local raster records remain usable through local preview fallback.

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

ALTER TABLE public.raster_layers
  ADD COLUMN IF NOT EXISTS original_file_name text,
  ADD COLUMN IF NOT EXISTS original_file_url text,
  ADD COLUMN IF NOT EXISTS preview_file_name text,
  ADD COLUMN IF NOT EXISTS preview_file_url text,
  ADD COLUMN IF NOT EXISTS crs text,
  ADD COLUMN IF NOT EXISTS raster_width integer,
  ADD COLUMN IF NOT EXISTS raster_height integer,
  ADD COLUMN IF NOT EXISTS pixel_size_x numeric,
  ADD COLUMN IF NOT EXISTS pixel_size_y numeric,
  ADD COLUMN IF NOT EXISTS original_bounds jsonb,
  ADD COLUMN IF NOT EXISTS symbology jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS symbology_mode text DEFAULT 'stretch',
  ADD COLUMN IF NOT EXISTS storage_provider text DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS r2_bucket text,
  ADD COLUMN IF NOT EXISTS original_object_key text,
  ADD COLUMN IF NOT EXISTS preview_object_key text,
  ADD COLUMN IF NOT EXISTS tile_url_template text,
  ADD COLUMN IF NOT EXISTS tile_min_zoom numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tile_max_zoom numeric DEFAULT 22,
  ADD COLUMN IF NOT EXISTS tile_status text DEFAULT 'ready';

UPDATE public.raster_layers
SET tile_url_template = COALESCE(tile_url_template, '/api/raster-tiles/' || layer_key || '/{z}/{x}/{y}.png'),
    tile_min_zoom = COALESCE(tile_min_zoom, min_zoom, 0),
    tile_max_zoom = COALESCE(tile_max_zoom, max_zoom, 22),
    tile_status = COALESCE(tile_status, 'ready'),
    storage_provider = COALESCE(storage_provider, 'local')
WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_raster_layers_active_sort
  ON public.raster_layers (active, sort_order, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_raster_layers_key_active
  ON public.raster_layers (layer_key, active);
