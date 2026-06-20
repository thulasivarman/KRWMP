CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.persons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL,
    preferred_name text,
    nic_number text,
    phone_number text,
    email text,
    gender text,
    date_of_birth date,
    address text,
    dsd text,
    gnd text,
    is_system_user boolean NOT NULL DEFAULT false,
    linked_user_id uuid,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT persons_full_name_not_blank CHECK (length(trim(full_name)) > 0),
    CONSTRAINT persons_status_check CHECK (status IN ('active', 'inactive', 'merged', 'deleted')),
    CONSTRAINT persons_email_format_check CHECK (
        email IS NULL
        OR trim(email) = ''
        OR email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    )
);

CREATE INDEX IF NOT EXISTS idx_persons_full_name
    ON public.persons (lower(full_name));

CREATE INDEX IF NOT EXISTS idx_persons_phone_number
    ON public.persons (phone_number)
    WHERE phone_number IS NOT NULL AND trim(phone_number) <> '';

CREATE INDEX IF NOT EXISTS idx_persons_email
    ON public.persons (lower(email))
    WHERE email IS NOT NULL AND trim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_persons_nic_number
    ON public.persons (upper(nic_number))
    WHERE nic_number IS NOT NULL AND trim(nic_number) <> '';

CREATE INDEX IF NOT EXISTS idx_persons_dsd_gnd
    ON public.persons (dsd, gnd);

CREATE INDEX IF NOT EXISTS idx_persons_linked_user_id
    ON public.persons (linked_user_id)
    WHERE linked_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_persons_status
    ON public.persons (status);

ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.persons FROM anon;
REVOKE ALL ON TABLE public.persons FROM authenticated;
