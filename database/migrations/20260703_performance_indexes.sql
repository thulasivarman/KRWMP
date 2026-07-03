-- Performance indexes for KRWMP intervention, pollution, complaint and water-quality workflows.
-- These indexes are safe to re-run and are optimized for spatial search, joins, pagination and list filtering.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Spatial search and identify workflows
CREATE INDEX IF NOT EXISTS idx_pollution_sources_geom_gist
  ON public.pollution_sources USING GIST (geom)
  WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_water_quality_tests_geom_gist
  ON public.water_quality_tests USING GIST (geom)
  WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_geom_gist
  ON public.community_issue_reports USING GIST (geom)
  WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dsd_boundary_geom_gist
  ON public.dsd_boundary USING GIST (geom)
  WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gnd_boundary_geom_gist
  ON public.gnd_boundary USING GIST (geom)
  WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intervention_institutions_geom_gist
  ON public.intervention_institutions USING GIST (geom)
  WHERE geom IS NOT NULL;

-- Main intervention list pagination and filters
CREATE INDEX IF NOT EXISTS idx_intervention_registry_updated_at
  ON public.intervention_registry (updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_registry_status_updated_at
  ON public.intervention_registry (status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_registry_library_id
  ON public.intervention_registry (library_id);

CREATE INDEX IF NOT EXISTS idx_intervention_registry_search_trgm
  ON public.intervention_registry USING GIN (
    (coalesce(intervention_code, '') || ' ' ||
     coalesce(intervention_title, '') || ' ' ||
     coalesce(location_name, '') || ' ' ||
     coalesce(village_name, '') || ' ' ||
     coalesce(dsd_name, '') || ' ' ||
     coalesce(gnd_name, '') || ' ' ||
     coalesce(lead_officer_name, '') || ' ' ||
     coalesce(implementing_office, '')) gin_trgm_ops
  );

-- Intervention JOIN and aggregation paths
CREATE INDEX IF NOT EXISTS idx_intervention_action_timeline_intervention_date
  ON public.intervention_action_timeline (intervention_id, action_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_action_timeline_responsible_person
  ON public.intervention_action_timeline (responsible_person_id)
  WHERE responsible_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intervention_officers_intervention_created
  ON public.intervention_officers (intervention_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pollution_source_interventions_intervention_created
  ON public.pollution_source_interventions (intervention_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pollution_source_interventions_source_created
  ON public.pollution_source_interventions (pollution_source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_water_quality_records_intervention_created
  ON public.intervention_water_quality_records (intervention_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_water_quality_records_record_created
  ON public.intervention_water_quality_records (water_quality_record_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_complaint_intervention_mapping_intervention
  ON public.complaint_intervention_mapping (intervention_id, link_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_complaint_intervention_mapping_report
  ON public.complaint_intervention_mapping (report_id, link_status, updated_at DESC);

-- Lookup and search support
CREATE INDEX IF NOT EXISTS idx_pollution_sources_status_type
  ON public.pollution_sources (status, source_type_id);

CREATE INDEX IF NOT EXISTS idx_water_quality_tests_status_date
  ON public.water_quality_tests (overall_status, sample_collection_datetime DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_institutions_active_name
  ON public.intervention_institutions (active, institution_name);
