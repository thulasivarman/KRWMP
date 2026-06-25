-- Automatically represent each VWMC committee as a master institution.

CREATE OR REPLACE FUNCTION public.sync_vwmc_committee_to_institution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_institution_id bigint;
  v_code varchar(50);
  v_address text;
BEGIN
  IF NEW.committee_name IS NULL OR length(trim(NEW.committee_name)) < 3 THEN
    RETURN NEW;
  END IF;

  v_code := upper(left(regexp_replace(coalesce(NEW.committee_code, 'VWMC-' || NEW.id::text), '[^A-Za-z0-9_-]', '-', 'g'), 50));
  v_address := coalesce(nullif(trim(NEW.address), ''), nullif(trim(concat_ws(', ', NEW.village_name, NEW.gnd_name, NEW.dsd_name)), ''), 'VWMC operating area');

  SELECT id INTO v_institution_id
  FROM public.intervention_institutions
  WHERE source_module = 'vwmc'
    AND source_record_id = NEW.id
  LIMIT 1;

  IF v_institution_id IS NULL AND NEW.institution_id IS NOT NULL THEN
    SELECT id INTO v_institution_id
    FROM public.intervention_institutions
    WHERE id = NEW.institution_id
    LIMIT 1;
  END IF;

  IF v_institution_id IS NULL THEN
    INSERT INTO public.intervention_institutions (
      institution_name,
      institution_code,
      institution_type,
      address,
      dsd_name,
      gnd_name,
      description,
      latitude,
      longitude,
      geom,
      active,
      source_module,
      source_record_id,
      created_by,
      updated_by
    ) VALUES (
      NEW.committee_name,
      v_code,
      'VWMC',
      v_address,
      NEW.dsd_name,
      NEW.gnd_name,
      NEW.remarks,
      NEW.latitude,
      NEW.longitude,
      CASE WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN ST_SetSRID(ST_MakePoint((NEW.longitude)::double precision, (NEW.latitude)::double precision), 4326) ELSE NULL END,
      coalesce(NEW.status, 'active') <> 'inactive',
      'vwmc',
      NEW.id,
      coalesce(NEW.created_by, 'system'),
      coalesce(NEW.updated_by, NEW.created_by, 'system')
    ) RETURNING id INTO v_institution_id;
  ELSE
    UPDATE public.intervention_institutions
    SET institution_name = NEW.committee_name,
        institution_code = v_code,
        institution_type = 'VWMC',
        address = v_address,
        dsd_name = NEW.dsd_name,
        gnd_name = NEW.gnd_name,
        description = NEW.remarks,
        latitude = NEW.latitude,
        longitude = NEW.longitude,
        geom = CASE WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN ST_SetSRID(ST_MakePoint((NEW.longitude)::double precision, (NEW.latitude)::double precision), 4326) ELSE geom END,
        active = coalesce(NEW.status, 'active') <> 'inactive',
        source_module = 'vwmc',
        source_record_id = NEW.id,
        updated_by = coalesce(NEW.updated_by, NEW.created_by, 'system'),
        updated_at = now()
    WHERE id = v_institution_id;
  END IF;

  IF NEW.institution_id IS DISTINCT FROM v_institution_id THEN
    NEW.institution_id := v_institution_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vwmc_committee_to_institution ON public.vwmc_committees;
CREATE TRIGGER trg_sync_vwmc_committee_to_institution
BEFORE INSERT OR UPDATE OF committee_name, committee_code, village_name, dsd_name, gnd_name, address, latitude, longitude, status, remarks, created_by, updated_by
ON public.vwmc_committees
FOR EACH ROW
EXECUTE FUNCTION public.sync_vwmc_committee_to_institution();

-- Backfill existing committees once after trigger creation.
UPDATE public.vwmc_committees
SET updated_at = now()
WHERE committee_name IS NOT NULL;
