-- =====================================================
-- KRWMP Portal - Pollution Sources Management
-- Harden spatial autofill function against optional table/column differences.
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
        SELECT s.id, s.watershed_name
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
