CREATE TABLE IF NOT EXISTS public.intervention_institutions (
    id bigserial PRIMARY KEY,
    institution_name text UNIQUE NOT NULL,
    institution_type text,
    contact_person text,
    contact_phone text,
    contact_email text,
    active boolean DEFAULT true,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_by text,
    updated_at timestamptz DEFAULT now()
);
