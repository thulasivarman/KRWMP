-- KRWMP jurisdiction governance core schema

CREATE TABLE IF NOT EXISTS public.jurisdictions (
  id bigserial PRIMARY KEY,
  jurisdiction_name text NOT NULL,
  jurisdiction_type text NOT NULL,
  source_code integer NULL,
  description text NULL,
  is_system_generated boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by text NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.jurisdiction_gnds (
  id bigserial PRIMARY KEY,
  jurisdiction_id bigint NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  idgnd integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (jurisdiction_id, idgnd)
);

CREATE INDEX IF NOT EXISTS idx_jurisdiction_gnds_jurisdiction ON public.jurisdiction_gnds(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_gnds_idgnd ON public.jurisdiction_gnds(idgnd);

CREATE TABLE IF NOT EXISTS public.organization_jurisdictions (
  id bigserial PRIMARY KEY,
  institution_id bigint NOT NULL,
  jurisdiction_id bigint NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  module_key text NULL,
  access_level text DEFAULT 'manage',
  is_primary boolean DEFAULT false,
  assigned_by text NULL,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE (institution_id, jurisdiction_id, module_key)
);

CREATE TABLE IF NOT EXISTS public.user_jurisdictions (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL,
  jurisdiction_id bigint NOT NULL REFERENCES public.jurisdictions(id) ON DELETE CASCADE,
  module_key text NULL,
  access_level text DEFAULT 'manage',
  assigned_by text NULL,
  assigned_at timestamptz DEFAULT now(),
  UNIQUE (user_id, jurisdiction_id, module_key)
);
