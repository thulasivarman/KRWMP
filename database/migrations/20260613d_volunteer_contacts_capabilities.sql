-- KRWMP Portal - Volunteer contacts and capability libraries

CREATE TABLE IF NOT EXISTS public.volunteer_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_org_id UUID NOT NULL REFERENCES public.volunteer_organisation_profiles(id) ON DELETE CASCADE,
    contact_name TEXT NOT NULL,
    designation TEXT,
    phone TEXT,
    email TEXT,
    whatsapp TEXT,
    preferred_contact_method TEXT DEFAULT 'phone',
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_capability_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capability_name TEXT NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_organisation_capabilities (
    volunteer_org_id UUID NOT NULL REFERENCES public.volunteer_organisation_profiles(id) ON DELETE CASCADE,
    capability_id UUID NOT NULL REFERENCES public.volunteer_capability_library(id),
    proficiency_level TEXT DEFAULT 'basic',
    remarks TEXT,
    PRIMARY KEY (volunteer_org_id, capability_id)
);

CREATE TABLE IF NOT EXISTS public.volunteer_resources_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_name TEXT NOT NULL UNIQUE,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_organisation_resources (
    volunteer_org_id UUID NOT NULL REFERENCES public.volunteer_organisation_profiles(id) ON DELETE CASCADE,
    resource_id UUID NOT NULL REFERENCES public.volunteer_resources_library(id),
    quantity NUMERIC(12,2),
    remarks TEXT,
    PRIMARY KEY (volunteer_org_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_volunteer_contacts_org ON public.volunteer_contacts (volunteer_org_id);
