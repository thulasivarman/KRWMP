-- =====================================================
-- KRWMP Dynamic Pollution Pressure Heatmap
-- Migration: 20260630_dynamic_pollution_pressure_heatmap.sql
-- Purpose:
--   1. Store expert-configurable heatmap model logic.
--   2. Seed default pollution pressure model variables.
--   3. Create analytical views for map heatmap and dashboard summaries.
--
-- Expected operational tables for analytical views:
--   public.pollution_sources(id, source_type, status, verification_status, created_at, geom)
--   public.complaints(id, status, verification_status, repeat_count, created_at, geom)
--   public.water_quality_results(id, parameter_code, parameter_value, standard_value, sample_date, geom)
--   public.gnd_boundary(id, gnd_name, geom)
--
-- If any expected operational table is not yet available, the config tables and seed
-- data will still be created. The related views will be skipped with NOTICE messages.
-- Re-run this migration after creating/renaming the operational tables, or adjust the
-- table names in the DO blocks below.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- 1. Expert-configurable heatmap model tables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.heatmap_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_code text UNIQUE NOT NULL,
  model_name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.heatmap_model_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_code text NOT NULL REFERENCES public.heatmap_models(model_code) ON DELETE CASCADE,
  component_code text NOT NULL,
  component_name text NOT NULL,
  weight numeric(8,4) NOT NULL CHECK (weight >= 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_code, component_code)
);

CREATE TABLE IF NOT EXISTS public.heatmap_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_code text NOT NULL REFERENCES public.heatmap_models(model_code) ON DELETE CASCADE,
  component_code text NOT NULL,
  rule_code text NOT NULL,
  rule_name text NOT NULL,
  condition_field text NOT NULL,
  condition_operator text NOT NULL CHECK (condition_operator IN ('=', '!=', '<', '<=', '>', '>=', 'always')),
  condition_value text,
  score numeric(10,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(model_code, component_code, rule_code)
);

CREATE TABLE IF NOT EXISTS public.heatmap_pressure_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_code text NOT NULL REFERENCES public.heatmap_models(model_code) ON DELETE CASCADE,
  class_name text NOT NULL,
  min_score numeric(10,2) NOT NULL,
  max_score numeric(10,2) NOT NULL,
  color_code text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_score <= max_score),
  UNIQUE(model_code, class_name)
);

CREATE INDEX IF NOT EXISTS idx_heatmap_components_model ON public.heatmap_model_components(model_code, is_active);
CREATE INDEX IF NOT EXISTS idx_heatmap_rules_model_component ON public.heatmap_scoring_rules(model_code, component_code, is_active);
CREATE INDEX IF NOT EXISTS idx_heatmap_classes_model ON public.heatmap_pressure_classes(model_code, min_score, max_score);

-- =====================================================
-- 2. Seed default Pollution Pressure model
-- =====================================================

INSERT INTO public.heatmap_models
(model_code, model_name, description, is_active)
VALUES
('pollution_pressure', 'Pollution Pressure Heatmap', 'Dynamic pollution pressure model using pollution sources, community complaints, and water quality exceedances.', true)
ON CONFLICT (model_code) DO UPDATE
SET model_name = EXCLUDED.model_name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    updated_at = now();

INSERT INTO public.heatmap_model_components
(model_code, component_code, component_name, weight, is_active, sort_order)
VALUES
('pollution_pressure', 'pollution_source', 'Pollution Sources', 0.4000, true, 1),
('pollution_pressure', 'complaint', 'Community Complaints', 0.3000, true, 2),
('pollution_pressure', 'water_quality', 'Water Quality Results', 0.3000, true, 3)
ON CONFLICT (model_code, component_code) DO UPDATE
SET component_name = EXCLUDED.component_name,
    weight = EXCLUDED.weight,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO public.heatmap_pressure_classes
(model_code, class_name, min_score, max_score, color_code, sort_order)
VALUES
('pollution_pressure', 'Very Low', 0, 20, '#2ecc71', 1),
('pollution_pressure', 'Low', 20.01, 40, '#a3e635', 2),
('pollution_pressure', 'Moderate', 40.01, 60, '#facc15', 3),
('pollution_pressure', 'High', 60.01, 80, '#f97316', 4),
('pollution_pressure', 'Critical', 80.01, 100, '#dc2626', 5)
ON CONFLICT (model_code, class_name) DO UPDATE
SET min_score = EXCLUDED.min_score,
    max_score = EXCLUDED.max_score,
    color_code = EXCLUDED.color_code,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

INSERT INTO public.heatmap_scoring_rules
(model_code, component_code, rule_code, rule_name, condition_field, condition_operator, condition_value, score, is_active, sort_order)
VALUES
-- Pollution source rules
('pollution_pressure', 'pollution_source', 'source_industrial', 'Industrial Source', 'source_type', '=', 'industrial', 10, true, 1),
('pollution_pressure', 'pollution_source', 'source_sewage', 'Sewage Discharge', 'source_type', '=', 'sewage', 8, true, 2),
('pollution_pressure', 'pollution_source', 'source_solid_waste', 'Solid Waste Dumping', 'source_type', '=', 'solid_waste', 6, true, 3),
('pollution_pressure', 'pollution_source', 'source_agriculture', 'Agriculture Runoff', 'source_type', '=', 'agriculture', 5, true, 4),
('pollution_pressure', 'pollution_source', 'status_active', 'Active Source', 'status', '=', 'active', 3, true, 5),
('pollution_pressure', 'pollution_source', 'status_verified', 'Verified Source', 'verification_status', '=', 'verified', 2, true, 6),
('pollution_pressure', 'pollution_source', 'status_resolved', 'Resolved Source', 'status', '=', 'resolved', -5, true, 7),

-- Complaint rules
('pollution_pressure', 'complaint', 'complaint_base', 'Complaint Base Score', 'record_type', '=', 'complaint', 2, true, 1),
('pollution_pressure', 'complaint', 'complaint_verified', 'Verified Complaint', 'verification_status', '=', 'verified', 2, true, 2),
('pollution_pressure', 'complaint', 'complaint_recent', 'Recent Complaint', 'age_days', '<=', '30', 2, true, 3),
('pollution_pressure', 'complaint', 'complaint_repeated', 'Repeated Complaint', 'repeat_count', '>=', '2', 3, true, 4),

-- Water quality exceedance rules
('pollution_pressure', 'water_quality', 'bod_exceedance', 'BOD Exceedance', 'parameter_code', '=', 'BOD', 5, true, 1),
('pollution_pressure', 'water_quality', 'cod_exceedance', 'COD Exceedance', 'parameter_code', '=', 'COD', 5, true, 2),
('pollution_pressure', 'water_quality', 'low_do', 'Low DO', 'parameter_code', '=', 'DO', 6, true, 3),
('pollution_pressure', 'water_quality', 'fc_exceedance', 'Fecal Coliform Exceedance', 'parameter_code', '=', 'FC', 7, true, 4),
('pollution_pressure', 'water_quality', 'tss_exceedance', 'TSS Exceedance', 'parameter_code', '=', 'TSS', 4, true, 5)
ON CONFLICT (model_code, component_code, rule_code) DO UPDATE
SET rule_name = EXCLUDED.rule_name,
    condition_field = EXCLUDED.condition_field,
    condition_operator = EXCLUDED.condition_operator,
    condition_value = EXCLUDED.condition_value,
    score = EXCLUDED.score,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- =====================================================
-- 3. Unified pollution pressure inputs view
-- =====================================================

DO $$
BEGIN
  IF to_regclass('public.pollution_sources') IS NOT NULL
     AND to_regclass('public.complaints') IS NOT NULL
     AND to_regclass('public.water_quality_results') IS NOT NULL THEN

    EXECUTE $view$
      CREATE OR REPLACE VIEW public.vw_pollution_pressure_inputs AS
      SELECT
        'pollution_source'::text AS component_code,
        ps.id::text AS record_id,
        COALESCE(ps.source_type::text, '') AS source_type,
        COALESCE(ps.status::text, '') AS status,
        COALESCE(ps.verification_status::text, '') AS verification_status,
        NULL::text AS parameter_code,
        NULL::numeric AS parameter_value,
        NULL::numeric AS standard_value,
        NULL::int AS repeat_count,
        ps.created_at::date AS record_date,
        GREATEST(DATE_PART('day', now() - ps.created_at)::int, 0) AS age_days,
        ps.geom
      FROM public.pollution_sources ps
      WHERE ps.geom IS NOT NULL

      UNION ALL

      SELECT
        'complaint'::text AS component_code,
        c.id::text AS record_id,
        NULL::text AS source_type,
        COALESCE(c.status::text, '') AS status,
        COALESCE(c.verification_status::text, '') AS verification_status,
        NULL::text AS parameter_code,
        NULL::numeric AS parameter_value,
        NULL::numeric AS standard_value,
        COALESCE(c.repeat_count, 1)::int AS repeat_count,
        c.created_at::date AS record_date,
        GREATEST(DATE_PART('day', now() - c.created_at)::int, 0) AS age_days,
        c.geom
      FROM public.complaints c
      WHERE c.geom IS NOT NULL

      UNION ALL

      SELECT
        'water_quality'::text AS component_code,
        wq.id::text AS record_id,
        NULL::text AS source_type,
        NULL::text AS status,
        NULL::text AS verification_status,
        COALESCE(wq.parameter_code::text, '') AS parameter_code,
        wq.parameter_value::numeric AS parameter_value,
        wq.standard_value::numeric AS standard_value,
        NULL::int AS repeat_count,
        wq.sample_date::date AS record_date,
        GREATEST(DATE_PART('day', now() - wq.sample_date)::int, 0) AS age_days,
        wq.geom
      FROM public.water_quality_results wq
      WHERE wq.geom IS NOT NULL
        AND wq.parameter_value IS NOT NULL
        AND wq.standard_value IS NOT NULL
        AND wq.parameter_value > wq.standard_value;
    $view$;
  ELSE
    RAISE NOTICE 'Skipping vw_pollution_pressure_inputs. Required tables are missing.';
  END IF;
END $$;

-- =====================================================
-- 4. Scored heatmap view
-- =====================================================

DO $$
BEGIN
  IF to_regclass('public.vw_pollution_pressure_inputs') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW public.vw_pollution_pressure_heatmap AS
      WITH matched_rules AS (
        SELECT
          i.record_id,
          i.component_code,
          i.geom,
          r.rule_code,
          r.score,
          c.weight
        FROM public.vw_pollution_pressure_inputs i
        JOIN public.heatmap_model_components c
          ON c.model_code = 'pollution_pressure'
         AND c.component_code = i.component_code
         AND c.is_active = true
        JOIN public.heatmap_scoring_rules r
          ON r.model_code = c.model_code
         AND r.component_code = c.component_code
         AND r.is_active = true
        WHERE
          CASE
            WHEN r.condition_operator = 'always' THEN true
            WHEN r.condition_operator = '=' THEN
              COALESCE(
                CASE r.condition_field
                  WHEN 'source_type' THEN i.source_type
                  WHEN 'status' THEN i.status
                  WHEN 'verification_status' THEN i.verification_status
                  WHEN 'parameter_code' THEN i.parameter_code
                  WHEN 'record_type' THEN i.component_code
                END,
                ''
              ) = r.condition_value
            WHEN r.condition_operator = '!=' THEN
              COALESCE(
                CASE r.condition_field
                  WHEN 'source_type' THEN i.source_type
                  WHEN 'status' THEN i.status
                  WHEN 'verification_status' THEN i.verification_status
                  WHEN 'parameter_code' THEN i.parameter_code
                  WHEN 'record_type' THEN i.component_code
                END,
                ''
              ) <> r.condition_value
            WHEN r.condition_operator = '<=' THEN
              CASE r.condition_field
                WHEN 'age_days' THEN i.age_days::numeric <= r.condition_value::numeric
                WHEN 'repeat_count' THEN COALESCE(i.repeat_count, 0)::numeric <= r.condition_value::numeric
                WHEN 'parameter_value' THEN COALESCE(i.parameter_value, 0)::numeric <= r.condition_value::numeric
                ELSE false
              END
            WHEN r.condition_operator = '>=' THEN
              CASE r.condition_field
                WHEN 'age_days' THEN i.age_days::numeric >= r.condition_value::numeric
                WHEN 'repeat_count' THEN COALESCE(i.repeat_count, 0)::numeric >= r.condition_value::numeric
                WHEN 'parameter_value' THEN COALESCE(i.parameter_value, 0)::numeric >= r.condition_value::numeric
                ELSE false
              END
            WHEN r.condition_operator = '<' THEN
              CASE r.condition_field
                WHEN 'age_days' THEN i.age_days::numeric < r.condition_value::numeric
                WHEN 'repeat_count' THEN COALESCE(i.repeat_count, 0)::numeric < r.condition_value::numeric
                WHEN 'parameter_value' THEN COALESCE(i.parameter_value, 0)::numeric < r.condition_value::numeric
                ELSE false
              END
            WHEN r.condition_operator = '>' THEN
              CASE r.condition_field
                WHEN 'age_days' THEN i.age_days::numeric > r.condition_value::numeric
                WHEN 'repeat_count' THEN COALESCE(i.repeat_count, 0)::numeric > r.condition_value::numeric
                WHEN 'parameter_value' THEN COALESCE(i.parameter_value, 0)::numeric > r.condition_value::numeric
                ELSE false
              END
            ELSE false
          END
      )
      SELECT
        record_id,
        component_code,
        ST_Y(ST_Transform(geom, 4326)) AS latitude,
        ST_X(ST_Transform(geom, 4326)) AS longitude,
        LEAST(GREATEST(SUM(score * weight), 0), 100) AS intensity,
        geom
      FROM matched_rules
      GROUP BY record_id, component_code, geom;
    $view$;
  ELSE
    RAISE NOTICE 'Skipping vw_pollution_pressure_heatmap. vw_pollution_pressure_inputs is missing.';
  END IF;
END $$;

-- =====================================================
-- 5. GN-level classification and dashboard summary
-- =====================================================

DO $$
BEGIN
  IF to_regclass('public.vw_pollution_pressure_heatmap') IS NOT NULL
     AND to_regclass('public.gnd_boundary') IS NOT NULL THEN

    EXECUTE $view$
      CREATE OR REPLACE VIEW public.vw_gn_pollution_pressure_summary AS
      WITH gn_scores AS (
        SELECT
          g.id AS gn_id,
          COALESCE(g.gnd_name::text, 'Unknown GND') AS gn_name,
          AVG(h.intensity) AS avg_pressure_score
        FROM public.gnd_boundary g
        LEFT JOIN public.vw_pollution_pressure_heatmap h
          ON ST_Intersects(g.geom, h.geom)
        GROUP BY g.id, g.gnd_name
      )
      SELECT
        gs.gn_id,
        gs.gn_name,
        ROUND(COALESCE(gs.avg_pressure_score, 0)::numeric, 2) AS pressure_score,
        pc.class_name AS pressure_level,
        pc.color_code
      FROM gn_scores gs
      JOIN public.heatmap_pressure_classes pc
        ON pc.model_code = 'pollution_pressure'
       AND COALESCE(gs.avg_pressure_score, 0) BETWEEN pc.min_score AND pc.max_score;
    $view$;

    EXECUTE $view$
      CREATE OR REPLACE VIEW public.vw_pollution_pressure_dashboard_summary AS
      SELECT
        pc.class_name AS pressure_level,
        COALESCE(COUNT(gs.gn_id), 0)::int AS gn_count,
        pc.color_code,
        pc.sort_order
      FROM public.heatmap_pressure_classes pc
      LEFT JOIN public.vw_gn_pollution_pressure_summary gs
        ON gs.pressure_level = pc.class_name
      WHERE pc.model_code = 'pollution_pressure'
      GROUP BY pc.class_name, pc.color_code, pc.sort_order
      ORDER BY pc.sort_order;
    $view$;
  ELSE
    RAISE NOTICE 'Skipping GN/dashboard pollution pressure views. Required heatmap view or gnd_boundary table is missing.';
  END IF;
END $$;
