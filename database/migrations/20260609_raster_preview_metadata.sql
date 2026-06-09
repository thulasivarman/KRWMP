ALTER TABLE public.raster_layers
ADD COLUMN IF NOT EXISTS original_file_name text,
ADD COLUMN IF NOT EXISTS original_file_url text,
ADD COLUMN IF NOT EXISTS preview_file_name text,
ADD COLUMN IF NOT EXISTS preview_file_url text,
ADD COLUMN IF NOT EXISTS crs text,
ADD COLUMN IF NOT EXISTS raster_width integer,
ADD COLUMN IF NOT EXISTS raster_height integer,
ADD COLUMN IF NOT EXISTS pixel_size_x numeric,
ADD COLUMN IF NOT EXISTS pixel_size_y numeric;
