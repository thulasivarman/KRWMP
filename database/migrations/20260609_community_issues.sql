CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS public.issue_categories (
    id bigserial PRIMARY KEY,
    category_key text UNIQUE NOT NULL,
    category_name text NOT NULL,
    description text,
    severity_level text DEFAULT 'medium',
    sort_order integer DEFAULT 100,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.solution_library (
    id bigserial PRIMARY KEY,
    category_id bigint REFERENCES public.issue_categories(id) ON DELETE SET NULL,
    solution_title text NOT NULL,
    solution_description text NOT NULL,
    recommended_actions text,
    responsible_party text,
    estimated_timeframe text,
    priority_level text DEFAULT 'medium',
    active boolean DEFAULT true,
    created_by text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_issue_reports (
    id bigserial PRIMARY KEY,
    report_code text UNIQUE NOT NULL,
    category_id bigint REFERENCES public.issue_categories(id) ON DELETE SET NULL,
    issue_title text NOT NULL,
    description text,
    reporter_name text,
    reporter_contact text,
    reporter_email text,
    location_description text,
    latitude numeric,
    longitude numeric,
    geom geometry(Point, 4326),
    photo_url text,
    status text DEFAULT 'submitted',
    severity_level text DEFAULT 'medium',
    admin_notes text,
    assigned_solution_id bigint REFERENCES public.solution_library(id) ON DELETE SET NULL,
    reviewed_by text,
    reviewed_at timestamptz,
    submitted_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_categories_active ON public.issue_categories(active);
CREATE INDEX IF NOT EXISTS idx_solution_library_category ON public.solution_library(category_id);
CREATE INDEX IF NOT EXISTS idx_community_issue_reports_status ON public.community_issue_reports(status);
CREATE INDEX IF NOT EXISTS idx_community_issue_reports_geom ON public.community_issue_reports USING GIST(geom);

INSERT INTO public.issue_categories (category_key, category_name, description, severity_level, sort_order)
VALUES
('solid_waste_dumping', 'Solid Waste Dumping', 'Unauthorized dumping of solid waste in drainage paths, streams, roadsides, or public land.', 'high', 10),
('wastewater_discharge', 'Wastewater Discharge', 'Greywater, sewage, or industrial effluent discharge into waterways or open land.', 'high', 20),
('stream_blockage', 'Stream or Drainage Blockage', 'Blocked drainage paths, culverts, canals, or streams causing local flooding or pollution.', 'medium', 30),
('erosion_siltation', 'Erosion and Siltation', 'Soil erosion, riverbank erosion, sedimentation, or land degradation issues.', 'medium', 40),
('flooding_risk', 'Flooding Risk', 'Flood-prone locations, water stagnation, or unsafe stormwater flow.', 'high', 50),
('other_environmental_issue', 'Other Environmental Issue', 'Other catchment-related environmental or water management issue.', 'medium', 100)
ON CONFLICT (category_key) DO NOTHING;

INSERT INTO public.solution_library (category_id, solution_title, solution_description, recommended_actions, responsible_party, estimated_timeframe, priority_level)
SELECT id, 'Remove dumped solid waste and improve collection control', 'Remove dumped waste, prevent recurrence, and coordinate with relevant local authority or waste collector.', 'Verify location, arrange cleanup, install warning signage if needed, and monitor recurrence.', 'Local authority / waste management team', '1–2 weeks', 'high'
FROM public.issue_categories WHERE category_key = 'solid_waste_dumping'
ON CONFLICT DO NOTHING;

INSERT INTO public.solution_library (category_id, solution_title, solution_description, recommended_actions, responsible_party, estimated_timeframe, priority_level)
SELECT id, 'Investigate and stop unauthorized wastewater discharge', 'Identify discharge source, verify risk level, and initiate control or enforcement action.', 'Inspect source, collect evidence, notify responsible agency, and recommend treatment or containment.', 'Environmental authority / local authority', '1–4 weeks', 'high'
FROM public.issue_categories WHERE category_key = 'wastewater_discharge'
ON CONFLICT DO NOTHING;

INSERT INTO public.solution_library (category_id, solution_title, solution_description, recommended_actions, responsible_party, estimated_timeframe, priority_level)
SELECT id, 'Clear drainage blockage and restore flow path', 'Clear obstruction and maintain hydraulic flow capacity.', 'Inspect obstruction, remove blockage, desilt if required, and schedule periodic maintenance.', 'Drainage maintenance team / local authority', '1–3 weeks', 'medium'
FROM public.issue_categories WHERE category_key = 'stream_blockage'
ON CONFLICT DO NOTHING;
