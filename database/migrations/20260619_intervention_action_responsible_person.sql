ALTER TABLE public.intervention_action_timeline
ADD COLUMN IF NOT EXISTS responsible_person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_intervention_action_timeline_responsible_person_id
    ON public.intervention_action_timeline(responsible_person_id)
    WHERE responsible_person_id IS NOT NULL;
