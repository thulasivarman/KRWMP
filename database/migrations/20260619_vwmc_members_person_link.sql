ALTER TABLE public.vwmc_members
ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.persons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vwmc_members_person_id
    ON public.vwmc_members(person_id)
    WHERE person_id IS NOT NULL;
