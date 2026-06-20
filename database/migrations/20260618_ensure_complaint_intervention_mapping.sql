-- Ensure Community Issue Review can link complaints to Intervention Registry records.
-- This is intentionally idempotent for environments that missed the original 20260612 migration.

CREATE TABLE IF NOT EXISTS public.complaint_intervention_mapping (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT NOT NULL REFERENCES public.community_issue_reports(id) ON DELETE CASCADE,
  intervention_id BIGINT NOT NULL REFERENCES public.intervention_registry(id) ON DELETE CASCADE,
  link_status TEXT NOT NULL DEFAULT 'active' CHECK (link_status IN ('active', 'under_review', 'resolved', 'not_applicable')),
  link_note TEXT,
  linked_by TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_complaint_intervention_mapping UNIQUE (report_id, intervention_id)
);

CREATE INDEX IF NOT EXISTS idx_cim_report_id ON public.complaint_intervention_mapping(report_id);
CREATE INDEX IF NOT EXISTS idx_cim_intervention_id ON public.complaint_intervention_mapping(intervention_id);
CREATE INDEX IF NOT EXISTS idx_cim_link_status ON public.complaint_intervention_mapping(link_status);
CREATE INDEX IF NOT EXISTS idx_cim_linked_at ON public.complaint_intervention_mapping(linked_at DESC);

INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
SELECT r.id, 'community_issue_intervention_mapping', 'Community Issue Intervention Mapping', true, true, true, true
FROM public.roles r
WHERE lower(r.role_name) = 'admin'
ON CONFLICT (role_id, privilege_key) DO UPDATE SET
  privilege_name = EXCLUDED.privilege_name,
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_update = EXCLUDED.can_update,
  can_delete = EXCLUDED.can_delete;
