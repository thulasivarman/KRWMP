-- MVT/vector tile support for current and future vector layers.
-- Raster layers are intentionally kept separate; raster uploads should use raster tile/COG-style endpoints.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.gis_layers
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'vector',
  ADD COLUMN IF NOT EXISTS tile_url text,
  ADD COLUMN IF NOT EXISTS mvt_layer text,
  ADD COLUMN IF NOT EXISTS tile_cache_seconds integer DEFAULT 86400;

UPDATE public.gis_layers
SET source_type = 'vector',
    tile_url = '/api/tiles/layers/' || layer_key || '/{z}/{x}/{y}.pbf',
    mvt_layer = regexp_replace(lower(layer_key), '[^a-z0-9_]+', '_', 'g')
WHERE active = true
  AND COALESCE(source_type, 'vector') = 'vector';

CREATE INDEX IF NOT EXISTS idx_gis_layers_active_key
  ON public.gis_layers (active, layer_key);

CREATE INDEX IF NOT EXISTS idx_gis_layers_active_order
  ON public.gis_layers (active, sort_order);

-- Ensure uploaded vector tables already created by the upload workflow remain tile-ready.
-- Each uploaded table receives a GiST index during import; this block is defensive for older uploads.
DO $$
DECLARE
  layer_record record;
BEGIN
  FOR layer_record IN
    SELECT table_name, COALESCE(geom_column, 'geom') AS geom_column
    FROM public.gis_layers
    WHERE managed_by_admin = true
      AND table_name LIKE 'uploaded_%'
      AND active = true
  LOOP
    IF layer_record.table_name ~ '^[A-Za-z_][A-Za-z0-9_]*$'
       AND layer_record.geom_column ~ '^[A-Za-z_][A-Za-z0-9_]*$' THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I USING GIST (%I)',
        layer_record.table_name || '_' || layer_record.geom_column || '_mvt_gist_idx',
        layer_record.table_name,
        layer_record.geom_column
      );
    END IF;
  END LOOP;
END $$;

-- Expression index for intervention registry when it is stored as latitude/longitude rather than geometry.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'intervention_registry' AND column_name = 'latitude'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'intervention_registry' AND column_name = 'longitude'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_intervention_registry_latlng_mvt_gist
      ON public.intervention_registry
      USING GIST (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326))
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
  END IF;
END $$;
