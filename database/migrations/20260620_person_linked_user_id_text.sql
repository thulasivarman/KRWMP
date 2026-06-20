ALTER TABLE public.persons
ALTER COLUMN linked_user_id TYPE text
USING linked_user_id::text;

CREATE INDEX IF NOT EXISTS idx_persons_linked_user_id
    ON public.persons (linked_user_id)
    WHERE linked_user_id IS NOT NULL;
