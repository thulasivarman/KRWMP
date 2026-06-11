ALTER TABLE public.gis_layers ADD COLUMN IF NOT EXISTS required_privilege text DEFAULT 'map_view';
UPDATE public.gis_layers SET required_privilege = 'map_view' WHERE required_privilege IS NULL;
