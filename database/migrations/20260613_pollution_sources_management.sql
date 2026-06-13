-- =====================================================
-- KRWMP Portal - Pollution Sources Management Module
-- Schema, indexes, risk views, dashboard views, and RBAC integration
-- =====================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. Expert Libraries
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pollution_source_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type_name TEXT NOT NULL UNIQUE,
    description TEXT,
    default_weight NUMERIC(6,2) NOT NULL DEFAULT 1.00 CHECK (default_weight >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pollution_impact_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_name TEXT NOT NULL UNIQUE,
    level_score INTEGER NOT NULL CHECK (level_score BETWEEN 1 AND 5),
    color_code TEXT,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pollution_impact_library (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    impact_name TEXT NOT NULL UNIQUE,
    description TEXT,
    default_level_id UUID REFERENCES public.pollution_impact_levels(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pollution_treatment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method_name TEXT NOT NULL UNIQUE,
    description TEXT,
    recommended_actions TEXT,
    responsible_agency TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 2. Pollution Source Registry
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pollution_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_code TEXT NOT NULL UNIQUE,
    source_name TEXT NOT NULL,
    source_type_id UUID NOT NULL REFERENCES public.pollution_source_types(id),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'under_monitoring', 'closed')),
    location_description TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    geom geometry(Point, 4326) NOT NULL,
    dsd_id BIGINT,
    dsd_name TEXT,
    gnd_id BIGINT,
    gnd_name TEXT,
    sub_watershed_id UUID,
    sub_watershed_name TEXT,
    nearest_river_distance_m NUMERIC(12,2),
    reported_date DATE DEFAULT CURRENT_DATE,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pollution_sources_valid_coordinates CHECK (ST_X(geom) BETWEEN 79 AND 82 AND ST_Y(geom) BETWEEN 5 AND 10)
);

-- =====================================================
-- 3. Monitoring History and Many-to-Many Links
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pollution_source_monitoring (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pollution_source_id UUID NOT NULL REFERENCES public.pollution_sources(id) ON DELETE CASCADE,
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    inspected_by TEXT,
    inspection_agency TEXT,
    observation_summary TEXT,
    evidence_url TEXT,
    photo_url TEXT,
    follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
    follow_up_deadline DATE,
    follow_up_status TEXT DEFAULT 'not_required' CHECK (follow_up_status IN ('not_required', 'pending', 'in_progress', 'completed', 'overdue')),
    water_quality_exceedance BOOLEAN NOT NULL DEFAULT FALSE,
    repeat_offender BOOLEAN NOT NULL DEFAULT FALSE,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pollution_monitoring_impacts (
    monitoring_id UUID NOT NULL REFERENCES public.pollution_source_monitoring(id) ON DELETE CASCADE,
    impact_id UUID NOT NULL REFERENCES public.pollution_impact_library(id),
    impact_level_id UUID REFERENCES public.pollution_impact_levels(id),
    remarks TEXT,
    PRIMARY KEY (monitoring_id, impact_id)
);

CREATE TABLE IF NOT EXISTS public.pollution_monitoring_treatments (
    monitoring_id UUID NOT NULL REFERENCES public.pollution_source_monitoring(id) ON DELETE CASCADE,
    treatment_method_id UUID NOT NULL REFERENCES public.pollution_treatment_methods(id),
    recommendation TEXT,
    implementation_status TEXT DEFAULT 'recommended' CHECK (implementation_status IN ('recommended', 'accepted', 'in_progress', 'completed', 'rejected')),
    PRIMARY KEY (monitoring_id, treatment_method_id)
);

-- =====================================================
-- 4. Manual Linkages
-- Existing module IDs are stored as text to support both BIGINT and UUID source tables.
-- Service layer joins by id::text.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pollution_source_community_issues (
    pollution_source_id UUID NOT NULL REFERENCES public.pollution_sources(id) ON DELETE CASCADE,
    community_issue_id TEXT NOT NULL,
    linkage_note TEXT,
    linked_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pollution_source_id, community_issue_id)
);

CREATE TABLE IF NOT EXISTS public.pollution_source_water_quality_records (
    pollution_source_id UUID NOT NULL REFERENCES public.pollution_sources(id) ON DELETE CASCADE,
    water_quality_record_id TEXT NOT NULL,
    linkage_note TEXT,
    linked_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pollution_source_id, water_quality_record_id)
);

CREATE TABLE IF NOT EXISTS public.pollution_source_interventions (
    pollution_source_id UUID NOT NULL REFERENCES public.pollution_sources(id) ON DELETE CASCADE,
    intervention_id TEXT NOT NULL,
    linkage_note TEXT,
    linked_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pollution_source_id, intervention_id)
);

-- =====================================================
-- 5. Enforcement Management
-- =====================================================

CREATE TABLE IF NOT EXISTS public.pollution_enforcement_notices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pollution_source_id UUID NOT NULL REFERENCES public.pollution_sources(id) ON DELETE CASCADE,
    notice_no TEXT UNIQUE,
    notice_date DATE NOT NULL DEFAULT CURRENT_DATE,
    issued_by_agency TEXT,
    notice_type TEXT NOT NULL DEFAULT 'warning' CHECK (notice_type IN ('warning', 'improvement_notice', 'legal_notice', 'closure_notice')),
    compliance_deadline DATE,
    agency_response TEXT,
    response_date DATE,
    closure_status TEXT NOT NULL DEFAULT 'open' CHECK (closure_status IN ('open', 'responded', 'complied', 'non_complied', 'closed')),
    closure_date DATE,
    remarks TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================
-- 6. Auto-fill spatial admin names
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_pollution_source_autofill_admin_boundaries()
RETURNS TRIGGER AS $$
BEGIN
    NEW.latitude := ST_Y(NEW.geom);
    NEW.longitude := ST_X(NEW.geom);

    SELECT d.id, d.dsd_n
    INTO NEW.dsd_id, NEW.dsd_name
    FROM public.dsd_boundary d
    WHERE d.geom IS NOT NULL AND ST_Contains(d.geom, NEW.geom)
    LIMIT 1;

    SELECT g.id, g.gnd_name
    INTO NEW.gnd_id, NEW.gnd_name
    FROM public.gnd_boundary g
    WHERE g.geom IS NOT NULL AND ST_Contains(g.geom, NEW.geom)
    LIMIT 1;

    IF to_regclass('public.sub_watersheds') IS NOT NULL THEN
        SELECT s.id, COALESCE(s.watershed_name, s.sub_watershed_name, s.name)
        INTO NEW.sub_watershed_id, NEW.sub_watershed_name
        FROM public.sub_watersheds s
        WHERE s.geom IS NOT NULL AND ST_Contains(s.geom, NEW.geom)
        LIMIT 1;
    END IF;

    IF to_regclass('public.streams') IS NOT NULL THEN
        SELECT ROUND((ST_Distance(NEW.geom::geography, st.geom::geography))::numeric, 2)
        INTO NEW.nearest_river_distance_m
        FROM public.streams st
        WHERE st.geom IS NOT NULL
        ORDER BY NEW.geom <-> st.geom
        LIMIT 1;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pollution_source_autofill_admin_boundaries ON public.pollution_sources;
CREATE TRIGGER trg_pollution_source_autofill_admin_boundaries
BEFORE INSERT OR UPDATE OF geom
ON public.pollution_sources
FOR EACH ROW
EXECUTE FUNCTION public.fn_pollution_source_autofill_admin_boundaries();

-- =====================================================
-- 7. Indexes
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_pollution_sources_geom ON public.pollution_sources USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_pollution_sources_type ON public.pollution_sources (source_type_id);
CREATE INDEX IF NOT EXISTS idx_pollution_sources_status ON public.pollution_sources (status);
CREATE INDEX IF NOT EXISTS idx_pollution_sources_dsd ON public.pollution_sources (dsd_id);
CREATE INDEX IF NOT EXISTS idx_pollution_sources_gnd ON public.pollution_sources (gnd_id);
CREATE INDEX IF NOT EXISTS idx_pollution_sources_sub_watershed ON public.pollution_sources (sub_watershed_id);
CREATE INDEX IF NOT EXISTS idx_pollution_monitoring_source ON public.pollution_source_monitoring (pollution_source_id);
CREATE INDEX IF NOT EXISTS idx_pollution_monitoring_date ON public.pollution_source_monitoring (inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_pollution_enforcement_source ON public.pollution_enforcement_notices (pollution_source_id);
CREATE INDEX IF NOT EXISTS idx_pollution_enforcement_deadline ON public.pollution_enforcement_notices (compliance_deadline);
CREATE INDEX IF NOT EXISTS idx_pollution_link_issues_issue ON public.pollution_source_community_issues (community_issue_id);
CREATE INDEX IF NOT EXISTS idx_pollution_link_wq_record ON public.pollution_source_water_quality_records (water_quality_record_id);
CREATE INDEX IF NOT EXISTS idx_pollution_link_intervention ON public.pollution_source_interventions (intervention_id);

-- =====================================================
-- 8. Risk and dashboard views
-- =====================================================

CREATE OR REPLACE VIEW public.vw_pollution_source_risk AS
SELECT
    ps.id,
    ps.source_code,
    ps.source_name,
    ps.status,
    ps.geom,
    ps.dsd_name,
    ps.gnd_name,
    ps.sub_watershed_id,
    ps.sub_watershed_name,
    ps.nearest_river_distance_m,
    pst.type_name,
    pst.default_weight AS source_type_weight,
    COALESCE(MAX(pil.level_score), 1) AS max_impact_score,
    CASE
        WHEN ps.nearest_river_distance_m IS NULL THEN 0
        WHEN ps.nearest_river_distance_m <= 100 THEN 5
        WHEN ps.nearest_river_distance_m <= 250 THEN 4
        WHEN ps.nearest_river_distance_m <= 500 THEN 3
        WHEN ps.nearest_river_distance_m <= 1000 THEN 2
        ELSE 1
    END AS river_distance_score,
    CASE WHEN COALESCE(bool_or(psm.repeat_offender), false) THEN 5 ELSE 0 END AS repeat_offender_score,
    CASE WHEN COALESCE(bool_or(psm.water_quality_exceedance), false) THEN 5 ELSE 0 END AS water_quality_score,
    CASE WHEN COALESCE(bool_or(psm.follow_up_deadline < CURRENT_DATE AND psm.follow_up_status <> 'completed'), false) THEN 5 ELSE 0 END AS overdue_followup_score,
    ROUND((
        COALESCE(MAX(pil.level_score), 1) * 20
        + pst.default_weight * 10
        + CASE
            WHEN ps.nearest_river_distance_m IS NULL THEN 0
            WHEN ps.nearest_river_distance_m <= 100 THEN 20
            WHEN ps.nearest_river_distance_m <= 250 THEN 15
            WHEN ps.nearest_river_distance_m <= 500 THEN 10
            ELSE 5
          END
        + CASE WHEN COALESCE(bool_or(psm.repeat_offender), false) THEN 15 ELSE 0 END
        + CASE WHEN COALESCE(bool_or(psm.water_quality_exceedance), false) THEN 15 ELSE 0 END
        + CASE WHEN COALESCE(bool_or(psm.follow_up_deadline < CURRENT_DATE AND psm.follow_up_status <> 'completed'), false) THEN 15 ELSE 0 END
    )::numeric, 2) AS risk_score,
    CASE
        WHEN (
            COALESCE(MAX(pil.level_score), 1) * 20 + pst.default_weight * 10
            + CASE WHEN COALESCE(bool_or(psm.repeat_offender), false) THEN 15 ELSE 0 END
            + CASE WHEN COALESCE(bool_or(psm.water_quality_exceedance), false) THEN 15 ELSE 0 END
            + CASE WHEN COALESCE(bool_or(psm.follow_up_deadline < CURRENT_DATE AND psm.follow_up_status <> 'completed'), false) THEN 15 ELSE 0 END
        ) >= 120 THEN 'Critical'
        WHEN (
            COALESCE(MAX(pil.level_score), 1) * 20 + pst.default_weight * 10
            + CASE WHEN COALESCE(bool_or(psm.water_quality_exceedance), false) THEN 15 ELSE 0 END
        ) >= 80 THEN 'High'
        WHEN (COALESCE(MAX(pil.level_score), 1) * 20 + pst.default_weight * 10) >= 45 THEN 'Moderate'
        ELSE 'Low'
    END AS risk_class,
    MAX(psm.inspection_date) AS last_inspection_date
FROM public.pollution_sources ps
JOIN public.pollution_source_types pst ON ps.source_type_id = pst.id
LEFT JOIN public.pollution_source_monitoring psm ON ps.id = psm.pollution_source_id
LEFT JOIN public.pollution_monitoring_impacts pmi ON psm.id = pmi.monitoring_id
LEFT JOIN public.pollution_impact_levels pil ON pmi.impact_level_id = pil.id
GROUP BY ps.id, pst.type_name, pst.default_weight;

CREATE OR REPLACE VIEW public.vw_pollution_dashboard_summary AS
SELECT
    COUNT(*)::integer AS total_sources,
    COUNT(*) FILTER (WHERE risk_class = 'Critical')::integer AS critical_sources,
    COUNT(*) FILTER (WHERE risk_class = 'High')::integer AS high_risk_sources,
    COUNT(*) FILTER (WHERE status = 'active')::integer AS active_sources,
    COUNT(*) FILTER (WHERE last_inspection_date IS NULL OR last_inspection_date < CURRENT_DATE - INTERVAL '90 days')::integer AS less_frequently_monitored_sources,
    COUNT(*) FILTER (WHERE id IN (
        SELECT pollution_source_id FROM public.pollution_source_monitoring
        WHERE follow_up_deadline < CURRENT_DATE AND follow_up_status <> 'completed'
    ))::integer AS overdue_followups,
    COUNT(*) FILTER (WHERE id IN (
        SELECT pollution_source_id FROM public.pollution_source_monitoring WHERE repeat_offender = true
    ))::integer AS repeat_offenders,
    COUNT(*) FILTER (WHERE id IN (
        SELECT pollution_source_id FROM public.pollution_source_monitoring WHERE water_quality_exceedance = true
    ))::integer AS water_quality_linked_exceedances
FROM public.vw_pollution_source_risk;

-- =====================================================
-- 9. RBAC privilege integration
-- Current KRWMP RBAC stores privilege rows in public.role_privileges.
-- =====================================================

DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    FOR admin_role_id IN SELECT id FROM public.roles WHERE lower(role_name) IN ('admin', 'administrator', 'project admin') LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.role_privileges
            WHERE role_id = admin_role_id AND privilege_key = 'pollution_sources_management'
        ) THEN
            INSERT INTO public.role_privileges
                (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
            VALUES
                (admin_role_id, 'pollution_sources_management', 'Pollution Sources Management', true, true, true, true);
        END IF;
    END LOOP;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'RBAC tables are not available yet. Skipping pollution_sources_management privilege seed.';
END $$;

-- =====================================================
-- 10. Seed library values
-- =====================================================

INSERT INTO public.pollution_source_types (type_name, description, default_weight)
VALUES
('Industrial wastewater outlet', 'Point discharge from industrial or commercial process wastewater.', 1.50),
('Solid waste dumping site', 'Open or unauthorized solid waste disposal location.', 1.30),
('Sewerage discharge point', 'Direct or indirect sewage discharge location.', 1.60),
('Agricultural pollution source', 'Runoff or diffuse pollution source related to agriculture.', 1.10),
('Other pollution source', 'Other identified pollution source requiring monitoring.', 1.00)
ON CONFLICT (type_name) DO NOTHING;

INSERT INTO public.pollution_impact_levels (level_name, level_score, color_code, description)
VALUES
('Low', 1, '#22c55e', 'Low environmental impact.'),
('Moderate', 2, '#eab308', 'Moderate environmental impact requiring monitoring.'),
('High', 4, '#f97316', 'High environmental impact requiring corrective action.'),
('Critical', 5, '#dc2626', 'Critical impact requiring immediate action.')
ON CONFLICT (level_name) DO NOTHING;

INSERT INTO public.pollution_impact_library (impact_name, description, default_level_id)
SELECT impact_name, description, id
FROM (
    VALUES
    ('Surface water contamination', 'Potential or confirmed contamination of river, stream, canal, or tank water.', 'High'),
    ('Groundwater contamination', 'Potential impact on wells or groundwater resources.', 'High'),
    ('Public health nuisance', 'Odour, vectors, direct contact risk, or public health complaint.', 'Moderate'),
    ('Aquatic ecosystem impact', 'Impact on aquatic organisms, habitats, or riparian ecosystem.', 'High'),
    ('Visual pollution', 'Visible pollution or dumping affecting environmental quality.', 'Moderate')
) AS seed(impact_name, description, level_name)
JOIN public.pollution_impact_levels l ON l.level_name = seed.level_name
ON CONFLICT (impact_name) DO NOTHING;

INSERT INTO public.pollution_treatment_methods (method_name, description, recommended_actions, responsible_agency)
VALUES
('Immediate source inspection', 'Field verification and technical inspection of the pollution source.', 'Assign officer, inspect site, collect evidence, and update monitoring record.', 'Relevant Local Authority / CEA'),
('Wastewater pre-treatment', 'Installation or improvement of wastewater pre-treatment before discharge.', 'Require screening, sedimentation, oil trap, biological treatment, or other suitable pre-treatment.', 'CEA / Industry Operator'),
('Solid waste removal and site rehabilitation', 'Removal of dumped waste and restoration of affected site.', 'Clear waste, dispose through authorized facility, restrict further dumping, and monitor site.', 'Local Authority'),
('Compliance notice and follow-up', 'Formal enforcement action with compliance deadline.', 'Issue notice, set deadline, record agency response, and close after verification.', 'CEA / Local Authority'),
('Awareness and source control', 'Non-structural control for agricultural or community-linked pollution.', 'Conduct awareness, promote best practices, and monitor behavioural change.', 'Agrarian Services / Local Authority')
ON CONFLICT (method_name) DO NOTHING;
