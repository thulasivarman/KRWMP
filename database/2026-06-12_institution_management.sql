-- KRWMP Portal - Institution Management Migration
-- Apply this migration in Supabase SQL Editor before using Institution Management UI.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.intervention_institutions
  ADD COLUMN IF NOT EXISTS institution_code varchar(50),
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS district varchar(100),
  ADD COLUMN IF NOT EXISTS dsd_name varchar(150),
  ADD COLUMN IF NOT EXISTS gnd_name varchar(150),
  ADD COLUMN IF NOT EXISTS latitude numeric(10,8),
  ADD COLUMN IF NOT EXISTS longitude numeric(11,8),
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS geom geometry(Point,4326);

CREATE UNIQUE INDEX IF NOT EXISTS intervention_institutions_code_uidx
  ON public.intervention_institutions (institution_code)
  WHERE institution_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS intervention_institutions_geom_gix
  ON public.intervention_institutions USING GIST (geom);

CREATE INDEX IF NOT EXISTS intervention_institutions_active_idx
  ON public.intervention_institutions (active);

UPDATE public.intervention_institutions
SET geom = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)
WHERE geom IS NULL
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.institution_types (
  id serial PRIMARY KEY,
  type_name varchar(100) UNIQUE NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

INSERT INTO public.institution_types (type_name)
VALUES
  ('Government Department'),
  ('Provincial Council'),
  ('Local Authority'),
  ('Community Based Organization'),
  ('NGO'),
  ('Private Sector'),
  ('Research Institution'),
  ('University'),
  ('Funding Agency'),
  ('Development Partner'),
  ('River Basin Committee'),
  ('VWMC')
ON CONFLICT (type_name) DO NOTHING;

-- Privilege seed. Admin role receives full management access.
INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
SELECT r.id, 'institution_management', 'Institution Management', true, true, true, true
FROM public.roles r
WHERE lower(r.role_name) = 'admin'
ON CONFLICT DO NOTHING;

-- Optional read-only access for all non-public project roles. Edit role names as required.
INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
SELECT r.id, 'institution_management', 'Institution Management', true, false, false, false
FROM public.roles r
WHERE lower(r.role_name) <> 'admin'
ON CONFLICT DO NOTHING;
