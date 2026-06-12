-- KRWMP Portal - Issue & Solution Library Restructure
-- New model: Issue Categories -> Specific Issues -> Solutions linked to one or more Specific Issues.
-- Apply in Supabase SQL Editor before using the restructured admin page.

CREATE TABLE IF NOT EXISTS public.specific_issues (
  id bigserial PRIMARY KEY,
  category_id bigint NOT NULL REFERENCES public.issue_categories(id) ON DELETE RESTRICT,
  issue_key varchar(150) NOT NULL,
  issue_name text NOT NULL,
  description text,
  severity_level varchar(30) DEFAULT 'medium',
  sort_order integer DEFAULT 100,
  active boolean DEFAULT true,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT specific_issues_category_key_unique UNIQUE (category_id, issue_key)
);

CREATE INDEX IF NOT EXISTS specific_issues_category_idx ON public.specific_issues(category_id);
CREATE INDEX IF NOT EXISTS specific_issues_active_idx ON public.specific_issues(active);

CREATE TABLE IF NOT EXISTS public.solution_issue_links (
  solution_id bigint NOT NULL REFERENCES public.solution_library(id) ON DELETE CASCADE,
  issue_id bigint NOT NULL REFERENCES public.specific_issues(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (solution_id, issue_id)
);

CREATE INDEX IF NOT EXISTS solution_issue_links_issue_idx ON public.solution_issue_links(issue_id);

ALTER TABLE public.community_issue_reports
  ADD COLUMN IF NOT EXISTS issue_id bigint REFERENCES public.specific_issues(id) ON DELETE SET NULL;

-- Optional backward-compatible migration:
-- Existing category-level solutions are converted into a default specific issue per category.
INSERT INTO public.specific_issues (category_id, issue_key, issue_name, description, severity_level, sort_order, active, created_by)
SELECT DISTINCT c.id, 'general_' || c.category_key, c.category_name || ' - General Issue', c.description, c.severity_level, 999, true, 'migration'
FROM public.issue_categories c
JOIN public.solution_library s ON s.category_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.specific_issues si WHERE si.category_id = c.id AND si.issue_key = 'general_' || c.category_key
);

INSERT INTO public.solution_issue_links (solution_id, issue_id)
SELECT s.id, si.id
FROM public.solution_library s
JOIN public.issue_categories c ON c.id = s.category_id
JOIN public.specific_issues si ON si.category_id = c.id AND si.issue_key = 'general_' || c.category_key
WHERE NOT EXISTS (
  SELECT 1 FROM public.solution_issue_links sil WHERE sil.solution_id = s.id AND sil.issue_id = si.id
);

-- Suggested initial categories and issues. Adjust as required.
INSERT INTO public.issue_categories (category_key, category_name, description, severity_level, sort_order, active)
VALUES
  ('drainage', 'Drainage', 'Issues related to blocked drainage, stormwater flow and canal drainage.', 'medium', 10, true),
  ('deforestation', 'Deforestation', 'Issues related to tree cutting, forest degradation and vegetation loss.', 'high', 20, true),
  ('solid_waste', 'Solid Waste', 'Issues related to dumping, littering and poor waste management.', 'medium', 30, true),
  ('water_pollution', 'Water Pollution', 'Issues related to wastewater discharge, chemical pollution and contaminated waterways.', 'high', 40, true)
ON CONFLICT (category_key) DO UPDATE SET
  category_name = EXCLUDED.category_name,
  description = EXCLUDED.description,
  severity_level = EXCLUDED.severity_level,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();

INSERT INTO public.specific_issues (category_id, issue_key, issue_name, description, severity_level, sort_order, active, created_by)
SELECT c.id, x.issue_key, x.issue_name, x.description, x.severity_level, x.sort_order, true, 'seed'
FROM public.issue_categories c
JOIN (
  VALUES
    ('drainage', 'blocked_drainage', 'Blocked drainage', 'Blocked or poorly maintained drainage lines causing stagnation or flooding.', 'medium', 10),
    ('drainage', 'canal_siltation', 'Canal siltation', 'Sediment accumulation reducing canal flow capacity.', 'medium', 20),
    ('deforestation', 'illegal_tree_cutting', 'Illegal tree cutting', 'Unauthorized tree cutting or vegetation clearance.', 'high', 10),
    ('deforestation', 'riverbank_vegetation_loss', 'Riverbank vegetation loss', 'Loss of riparian vegetation along streams or riverbanks.', 'high', 20),
    ('solid_waste', 'open_dumping', 'Open dumping', 'Open dumping of mixed solid waste in public or environmentally sensitive areas.', 'medium', 10),
    ('solid_waste', 'garbage_thrown_into_canals', 'Garbage thrown into canals', 'Disposal of garbage into drainage canals, streams or waterways.', 'high', 20),
    ('water_pollution', 'wastewater_discharge', 'Wastewater discharge', 'Untreated wastewater discharge to stream, canal or river.', 'high', 10),
    ('water_pollution', 'chemical_pollution', 'Chemical pollution', 'Potential chemical or hazardous substance pollution affecting water bodies.', 'high', 20)
) AS x(category_key, issue_key, issue_name, description, severity_level, sort_order)
  ON c.category_key = x.category_key
ON CONFLICT (category_id, issue_key) DO UPDATE SET
  issue_name = EXCLUDED.issue_name,
  description = EXCLUDED.description,
  severity_level = EXCLUDED.severity_level,
  sort_order = EXCLUDED.sort_order,
  active = true,
  updated_at = now();
