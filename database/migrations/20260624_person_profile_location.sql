ALTER TABLE public.persons
ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
ADD COLUMN IF NOT EXISTS longitude numeric(10,7);
