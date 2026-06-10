ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS institution_id bigint REFERENCES public.intervention_institutions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.role_privileges (
    id bigserial PRIMARY KEY,
    role_id bigint NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    privilege_key text NOT NULL,
    privilege_name text NOT NULL,
    can_view boolean DEFAULT true,
    can_create boolean DEFAULT false,
    can_update boolean DEFAULT false,
    can_delete boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(role_id, privilege_key)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
    id bigserial PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role_id bigint NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    assigned_at timestamptz DEFAULT now(),
    UNIQUE(user_id, role_id)
);

INSERT INTO public.user_roles (user_id, role_id)
SELECT id, role_id FROM public.users
WHERE role_id IS NOT NULL
ON CONFLICT DO NOTHING;
