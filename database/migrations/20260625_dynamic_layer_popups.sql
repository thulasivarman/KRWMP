-- KRWMP dynamic GIS popup configuration
-- Run this once in Supabase SQL Editor or through your database migration process.

ALTER TABLE public.gis_layers
ADD COLUMN IF NOT EXISTS popup_title_field text,
ADD COLUMN IF NOT EXISTS popup_subtitle text,
ADD COLUMN IF NOT EXISTS popup_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.gis_layers.popup_title_field IS
'GeoJSON property key used as the popup title for this layer.';

COMMENT ON COLUMN public.gis_layers.popup_subtitle IS
'Static subtitle displayed below the popup title.';

COMMENT ON COLUMN public.gis_layers.popup_fields IS
'Ordered popup field configuration. Example: [{"key":"district_n","label":"District Name","type":"text"},{"key":"area_ha","label":"Area (ha)","type":"decimal","digits":2}].';

-- Example configuration for a district layer. Adjust layer_key if your district layer uses another key.
UPDATE public.gis_layers
SET
    popup_title_field = COALESCE(popup_title_field, 'district_n'),
    popup_subtitle = COALESCE(popup_subtitle, 'District Boundary'),
    popup_fields = CASE
        WHEN popup_fields = '[]'::jsonb THEN '[
            {"key":"district_n","label":"District Name","type":"text"},
            {"key":"area_ha","label":"Area (ha)","type":"decimal","digits":2}
        ]'::jsonb
        ELSE popup_fields
    END
WHERE layer_key = 'district';