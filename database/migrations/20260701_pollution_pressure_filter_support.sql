-- =====================================================
-- KRWMP Pollution Pressure Filter Support
-- Migration: 20260701_pollution_pressure_filter_support.sql
-- Purpose: expose record_date in the heatmap view so dashboard/map filters can use date windows.
-- Requires: public.vw_pollution_pressure_inputs and heatmap configuration tables.
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
          i.record_date,
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
        record_date,
        ST_Y(ST_Transform(geom, 4326)) AS latitude,
        ST_X(ST_Transform(geom, 4326)) AS longitude,
        LEAST(GREATEST(SUM(score * weight), 0), 100) AS intensity,
        geom
      FROM matched_rules
      GROUP BY record_id, component_code, record_date, geom;
    $view$;
  ELSE
    RAISE NOTICE 'Skipping vw_pollution_pressure_heatmap filter support. vw_pollution_pressure_inputs is missing.';
  END IF;
END $$;
