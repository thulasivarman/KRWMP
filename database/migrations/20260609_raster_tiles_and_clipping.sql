ALTER TABLE public.raster_layers
ADD COLUMN IF NOT EXISTS clipped_file_name text,
ADD COLUMN IF NOT EXISTS clipped_file_url text,
ADD COLUMN IF NOT EXISTS tile_url_template text,
ADD COLUMN IF NOT EXISTS render_mode text DEFAULT 'preview',
ADD COLUMN IF NOT EXISTS clipped_to_basin boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'ready',
ADD COLUMN IF NOT EXISTS processing_message text,
ADD COLUMN IF NOT EXISTS tile_min_zoom integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS tile_max_zoom integer DEFAULT 14;
