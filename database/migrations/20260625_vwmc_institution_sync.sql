-- Link VWMC committees to the master institution table.
ALTER TABLE IF EXISTS public.vwmc_committees
  ADD COLUMN IF NOT EXISTS institution_id bigint NULL;

CREATE INDEX IF NOT EXISTS idx_vwmc_committees_institution_id
  ON public.vwmc_committees(institution_id);

INSERT INTO public.institution_types (type_name, description, active)
VALUES ('VWMC', 'Village Watershed Management Committee / Community watershed institution', true)
ON CONFLICT DO NOTHING;

ALTER TABLE IF EXISTS public.intervention_institutions
  ADD COLUMN IF NOT EXISTS source_module text NULL,
  ADD COLUMN IF NOT EXISTS source_record_id bigint NULL;

CREATE INDEX IF NOT EXISTS idx_intervention_institutions_source
  ON public.intervention_institutions(source_module, source_record_id);
