-- Add GND-based jurisdiction and review-status columns to operational tables.

ALTER TABLE IF EXISTS public.intervention_institutions
  ADD COLUMN IF NOT EXISTS parent_institution_id bigint NULL,
  ADD COLUMN IF NOT EXISTS institution_level text NULL,
  ADD COLUMN IF NOT EXISTS is_system_owner boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_scope text NULL,
  ADD COLUMN IF NOT EXISTS jurisdiction_notes text NULL;

ALTER TABLE IF EXISTS public.community_issue_reports
  ADD COLUMN IF NOT EXISTS idgnd integer NULL,
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_duplicate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.pollution_sources
  ADD COLUMN IF NOT EXISTS idgnd integer NULL,
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_duplicate boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.pollution_source_monitoring
  ADD COLUMN IF NOT EXISTS idgnd integer NULL,
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.intervention_registry
  ADD COLUMN IF NOT EXISTS idgnd integer NULL,
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.intervention_action_timeline
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.water_quality_tests
  ADD COLUMN IF NOT EXISTS idgnd integer NULL,
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb;

ALTER TABLE IF EXISTS public.vwmc_committees
  ADD COLUMN IF NOT EXISTS idgnd integer NULL,
  ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS review_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS validation_errors jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_idgnd ON public.community_issue_reports(idgnd);
CREATE INDEX IF NOT EXISTS idx_pollution_sources_idgnd ON public.pollution_sources(idgnd);
CREATE INDEX IF NOT EXISTS idx_intervention_registry_idgnd ON public.intervention_registry(idgnd);
CREATE INDEX IF NOT EXISTS idx_water_quality_tests_idgnd ON public.water_quality_tests(idgnd);
CREATE INDEX IF NOT EXISTS idx_vwmc_committees_idgnd ON public.vwmc_committees(idgnd);
