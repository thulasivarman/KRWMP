CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.intervention_library (
    id bigserial PRIMARY KEY,
    intervention_key text UNIQUE NOT NULL,
    intervention_name text NOT NULL,
    intervention_category text,
    description text,
    standard_actions text,
    expected_outputs text,
    responsible_institution text,
    default_priority text DEFAULT 'medium',
    active boolean DEFAULT true,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_by text,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intervention_registry (
    id bigserial PRIMARY KEY,
    intervention_code text UNIQUE NOT NULL,
    library_id bigint REFERENCES public.intervention_library(id) ON DELETE SET NULL,
    intervention_title text NOT NULL,
    location_name text,
    village_name text,
    dsd_name text,
    gnd_name text,
    latitude numeric,
    longitude numeric,
    geom geometry(Point, 4326),
    priority text DEFAULT 'medium',
    status text DEFAULT 'planned',
    progress_percent integer DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
    planned_start_date date,
    planned_end_date date,
    actual_start_date date,
    actual_end_date date,
    lead_officer_name text,
    lead_officer_contact text,
    implementing_office text,
    remarks text,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_by text,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intervention_action_timeline (
    id bigserial PRIMARY KEY,
    intervention_id bigint NOT NULL REFERENCES public.intervention_registry(id) ON DELETE CASCADE,
    action_date date NOT NULL DEFAULT CURRENT_DATE,
    action_title text NOT NULL,
    action_description text,
    action_status text DEFAULT 'completed',
    progress_percent integer CHECK (progress_percent >= 0 AND progress_percent <= 100),
    officer_name text,
    officer_contact text,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_by text,
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intervention_officers (
    id bigserial PRIMARY KEY,
    intervention_id bigint NOT NULL REFERENCES public.intervention_registry(id) ON DELETE CASCADE,
    officer_name text NOT NULL,
    designation text,
    institution text,
    phone text,
    email text,
    responsibility text,
    active boolean DEFAULT true,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_by text,
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intervention_registry_geom ON public.intervention_registry USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_intervention_registry_status ON public.intervention_registry(status);
CREATE INDEX IF NOT EXISTS idx_intervention_timeline_intervention ON public.intervention_action_timeline(intervention_id);
CREATE INDEX IF NOT EXISTS idx_intervention_officers_intervention ON public.intervention_officers(intervention_id);

CREATE OR REPLACE FUNCTION public.intervention_set_geom_from_latlng()
RETURNS trigger AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_intervention_set_geom ON public.intervention_registry;
CREATE TRIGGER trg_intervention_set_geom
BEFORE INSERT OR UPDATE ON public.intervention_registry
FOR EACH ROW
EXECUTE FUNCTION public.intervention_set_geom_from_latlng();

INSERT INTO public.intervention_library (intervention_key, intervention_name, intervention_category, description, standard_actions, expected_outputs, responsible_institution, default_priority, created_by, updated_by)
VALUES
('solid_waste_cleanup', 'Solid Waste Cleanup and Prevention', 'Pollution Control', 'Removal and prevention of illegal solid waste dumping in catchment areas.', 'Site inspection, cleanup, disposal coordination, signage, and monitoring.', 'Cleared site and reduced recurrent dumping.', 'Local Authority / Waste Management Unit', 'high', 'system', 'system'),
('drainage_clearance', 'Drainage and Stream Blockage Clearance', 'Flood Risk Reduction', 'Clear blocked drains, canals, streams, culverts and flow paths.', 'Inspection, desilting, debris removal, and maintenance scheduling.', 'Restored drainage flow and reduced flooding risk.', 'Drainage Maintenance Team', 'medium', 'system', 'system'),
('wastewater_control', 'Unauthorized Wastewater Discharge Control', 'Water Quality Protection', 'Identify and control unauthorized wastewater discharge sources.', 'Source tracing, inspection, enforcement notice, and treatment recommendation.', 'Reduced pollution load to streams and drainage paths.', 'Environmental Authority / Local Authority', 'high', 'system', 'system')
ON CONFLICT (intervention_key) DO NOTHING;
