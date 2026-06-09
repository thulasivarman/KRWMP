CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.vwmc_committees (
    id bigserial PRIMARY KEY,
    committee_code text UNIQUE NOT NULL,
    committee_name text NOT NULL,
    village_name text,
    dsd_name text,
    gnd_name text,
    address text,
    latitude numeric,
    longitude numeric,
    geom geometry(Point, 4326),
    status text DEFAULT 'active',
    remarks text,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_by text,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vwmc_members (
    id bigserial PRIMARY KEY,
    committee_id bigint NOT NULL REFERENCES public.vwmc_committees(id) ON DELETE CASCADE,
    member_name text NOT NULL,
    member_type text NOT NULL DEFAULT 'village_representative',
    organization text,
    designation text,
    gender text,
    phone text,
    email text,
    address text,
    role_in_committee text,
    active boolean DEFAULT true,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_by text,
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vwmc_committees_geom ON public.vwmc_committees USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_vwmc_committees_status ON public.vwmc_committees(status);
CREATE INDEX IF NOT EXISTS idx_vwmc_members_committee ON public.vwmc_members(committee_id);

CREATE OR REPLACE FUNCTION public.vwmc_set_geom_from_latlng()
RETURNS trigger AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vwmc_set_geom ON public.vwmc_committees;
CREATE TRIGGER trg_vwmc_set_geom
BEFORE INSERT OR UPDATE ON public.vwmc_committees
FOR EACH ROW
EXECUTE FUNCTION public.vwmc_set_geom_from_latlng();
