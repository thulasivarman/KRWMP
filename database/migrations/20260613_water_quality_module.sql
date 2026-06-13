-- KRWMP Portal - Water Quality Test Records Module

CREATE TABLE IF NOT EXISTS public.water_quality_parameters (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('physical','chemical','biological')),
  parameter_key TEXT NOT NULL UNIQUE,
  parameter_name TEXT NOT NULL,
  unit TEXT,
  value_type TEXT NOT NULL DEFAULT 'numeric' CHECK (value_type IN ('numeric','text','presence_absence')),
  min_standard NUMERIC,
  max_standard NUMERIC,
  standard_reference TEXT DEFAULT 'Sri Lanka Water Quality Standard / Project Reference',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.water_quality_tests (
  id BIGSERIAL PRIMARY KEY,
  sample_code TEXT NOT NULL UNIQUE,
  sample_location_name TEXT NOT NULL,
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  geom geometry(Point, 4326),
  sample_collection_datetime TIMESTAMPTZ NOT NULL,
  collected_by TEXT NOT NULL,
  institution_id BIGINT NULL REFERENCES public.intervention_institutions(id) ON DELETE SET NULL,
  dsd_name TEXT,
  gnd_name TEXT,
  sub_watershed_id TEXT,
  sub_watershed_name TEXT,
  overall_status TEXT NOT NULL DEFAULT 'not_assessed' CHECK (overall_status IN ('compliant','caution','non_compliant','not_assessed')),
  signed_report_pdf_url TEXT,
  remarks TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.water_quality_test_results (
  id BIGSERIAL PRIMARY KEY,
  test_id BIGINT NOT NULL REFERENCES public.water_quality_tests(id) ON DELETE CASCADE,
  parameter_id BIGINT NOT NULL REFERENCES public.water_quality_parameters(id) ON DELETE RESTRICT,
  measured_value NUMERIC,
  text_value TEXT,
  unit TEXT,
  compliance_status TEXT NOT NULL DEFAULT 'not_tested' CHECK (compliance_status IN ('compliant','caution','non_compliant','not_tested')),
  remarks TEXT,
  UNIQUE(test_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_wq_tests_geom ON public.water_quality_tests USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_wq_tests_collection_dt ON public.water_quality_tests(sample_collection_datetime DESC);
CREATE INDEX IF NOT EXISTS idx_wq_tests_status ON public.water_quality_tests(overall_status);
CREATE INDEX IF NOT EXISTS idx_wq_results_test_id ON public.water_quality_test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_wq_results_parameter_id ON public.water_quality_test_results(parameter_id);

INSERT INTO public.water_quality_parameters (category, parameter_key, parameter_name, unit, value_type, min_standard, max_standard) VALUES
('physical','colour','Colour','Hazen','numeric',NULL,NULL),
('physical','odour','Odour',NULL,'text',NULL,NULL),
('physical','taste','Taste',NULL,'text',NULL,NULL),
('physical','turbidity','Turbidity','NTU','numeric',NULL,5),
('physical','temperature','Temperature','°C','numeric',NULL,NULL),
('physical','electrical_conductivity','Electrical Conductivity','µS/cm','numeric',NULL,NULL),
('physical','tds','Total Dissolved Solids','mg/L','numeric',NULL,500),
('physical','tss','Total Suspended Solids','mg/L','numeric',NULL,NULL),
('physical','ph','pH',NULL,'numeric',6.5,8.5),
('chemical','alkalinity','Alkalinity','mg/L as CaCO3','numeric',NULL,NULL),
('chemical','hardness','Hardness','mg/L as CaCO3','numeric',NULL,250),
('chemical','chloride','Chloride','mg/L','numeric',NULL,250),
('chemical','sulphate','Sulphate','mg/L','numeric',NULL,250),
('chemical','nitrate','Nitrate','mg/L','numeric',NULL,50),
('chemical','nitrite','Nitrite','mg/L','numeric',NULL,3),
('chemical','ammonia','Ammonia','mg/L','numeric',NULL,0.5),
('chemical','fluoride','Fluoride','mg/L','numeric',NULL,1.5),
('chemical','iron','Iron','mg/L','numeric',NULL,0.3),
('chemical','manganese','Manganese','mg/L','numeric',NULL,0.1),
('chemical','sodium','Sodium','mg/L','numeric',NULL,200),
('chemical','potassium','Potassium','mg/L','numeric',NULL,NULL),
('chemical','calcium','Calcium','mg/L','numeric',NULL,NULL),
('chemical','magnesium','Magnesium','mg/L','numeric',NULL,NULL),
('chemical','arsenic','Arsenic','mg/L','numeric',NULL,0.01),
('chemical','cadmium','Cadmium','mg/L','numeric',NULL,0.003),
('chemical','chromium','Chromium','mg/L','numeric',NULL,0.05),
('chemical','lead','Lead','mg/L','numeric',NULL,0.01),
('chemical','mercury','Mercury','mg/L','numeric',NULL,0.001),
('chemical','copper','Copper','mg/L','numeric',NULL,2),
('chemical','zinc','Zinc','mg/L','numeric',NULL,3),
('chemical','residual_chlorine','Residual Chlorine','mg/L','numeric',NULL,NULL),
('chemical','dissolved_oxygen','Dissolved Oxygen','mg/L','numeric',NULL,NULL),
('chemical','bod','BOD','mg/L','numeric',NULL,NULL),
('chemical','cod','COD','mg/L','numeric',NULL,NULL),
('chemical','phosphate','Phosphate','mg/L','numeric',NULL,NULL),
('chemical','oil_grease','Oil and Grease','mg/L','numeric',NULL,NULL),
('chemical','pesticides','Pesticides','mg/L','numeric',NULL,NULL),
('biological','total_coliform','Total Coliform','CFU/100ml','numeric',NULL,0),
('biological','faecal_coliform','Faecal Coliform','CFU/100ml','numeric',NULL,0),
('biological','e_coli','E. coli','CFU/100ml','numeric',NULL,0),
('biological','hpc','Heterotrophic Plate Count','CFU/ml','numeric',NULL,NULL),
('biological','enterococci','Enterococci','CFU/100ml','numeric',NULL,0)
ON CONFLICT (parameter_key) DO UPDATE SET
  category = EXCLUDED.category,
  parameter_name = EXCLUDED.parameter_name,
  unit = EXCLUDED.unit,
  value_type = EXCLUDED.value_type,
  min_standard = EXCLUDED.min_standard,
  max_standard = EXCLUDED.max_standard,
  active = true,
  updated_at = now();

INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
SELECT r.id, 'water_quality_records', 'Water Quality Test Records', true, true, true, true
FROM public.roles r
WHERE lower(r.role_name) = 'admin'
ON CONFLICT (role_id, privilege_key) DO UPDATE SET privilege_name = EXCLUDED.privilege_name;
