-- Ensure intervention action progress is always available for calculated registry progress.

UPDATE public.intervention_action_timeline
SET progress_percent = 0
WHERE progress_percent IS NULL;

ALTER TABLE public.intervention_action_timeline
  ALTER COLUMN progress_percent SET DEFAULT 0,
  ALTER COLUMN progress_percent SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_intervention_action_progress_percent'
      AND conrelid = 'public.intervention_action_timeline'::regclass
  ) THEN
    ALTER TABLE public.intervention_action_timeline
      ADD CONSTRAINT chk_intervention_action_progress_percent
      CHECK (progress_percent >= 0 AND progress_percent <= 100);
  END IF;
END $$;
