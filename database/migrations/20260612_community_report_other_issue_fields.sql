-- KRWMP Portal
-- Community complaint form enhancement: support public 'Other' category and specific issue values.

ALTER TABLE public.community_issue_reports
  ADD COLUMN IF NOT EXISTS other_category_name TEXT,
  ADD COLUMN IF NOT EXISTS other_issue_name TEXT;

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_other_category_name
  ON public.community_issue_reports(other_category_name);

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_other_issue_name
  ON public.community_issue_reports(other_issue_name);

COMMENT ON COLUMN public.community_issue_reports.other_category_name IS 'Free-text issue category submitted when public user selects Other.';
COMMENT ON COLUMN public.community_issue_reports.other_issue_name IS 'Free-text specific issue submitted when public user selects Other.';
