ALTER TABLE public.community_issue_reports
ADD COLUMN IF NOT EXISTS reporter_person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_community_issue_reports_reporter_person_id
    ON public.community_issue_reports(reporter_person_id)
    WHERE reporter_person_id IS NOT NULL;
