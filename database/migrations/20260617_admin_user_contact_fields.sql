ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS phone_number text;

ALTER TABLE public.users
ALTER COLUMN email DROP NOT NULL;
