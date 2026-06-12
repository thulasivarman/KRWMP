-- KRWMP Portal
-- Community report form enhancement: persist detected DSD/GND/Sub-watershed and selected applicable solution.
-- Apply in Supabase SQL editor or deployment migration pipeline.

ALTER TABLE public.community_issue_reports
  ADD COLUMN IF NOT EXISTS dsd_name TEXT,
  ADD COLUMN IF NOT EXISTS gnd_name TEXT,
  ADD COLUMN IF NOT EXISTS sub_watershed_id TEXT,
  ADD COLUMN IF NOT EXISTS sub_watershed_name TEXT;

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_dsd_name
  ON public.community_issue_reports(dsd_name);

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_gnd_name
  ON public.community_issue_reports(gnd_name);

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_sub_watershed_name
  ON public.community_issue_reports(sub_watershed_name);

COMMENT ON COLUMN public.community_issue_reports.dsd_name IS 'Auto-detected DSD name from selected map location.';
COMMENT ON COLUMN public.community_issue_reports.gnd_name IS 'Auto-detected GND name from selected map location.';
COMMENT ON COLUMN public.community_issue_reports.sub_watershed_id IS 'Auto-detected sub-watershed identifier from selected map location, stored as text to support UUID or numeric source IDs.';
COMMENT ON COLUMN public.community_issue_reports.sub_watershed_name IS 'Auto-detected sub-watershed name from selected map location.';
