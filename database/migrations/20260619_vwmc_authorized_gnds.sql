CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.vwmc_authorized_gnds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vwmc_id bigint NOT NULL REFERENCES public.vwmc_committees(id) ON DELETE CASCADE,
  dsd_name text,
  gnd_name text NOT NULL,
  gnd_code text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT uq_vwmc_authorized_gnd UNIQUE (vwmc_id, gnd_name)
);

CREATE INDEX IF NOT EXISTS idx_vwmc_authorized_gnds_vwmc ON public.vwmc_authorized_gnds(vwmc_id);
CREATE INDEX IF NOT EXISTS idx_vwmc_authorized_gnds_dsd_gnd ON public.vwmc_authorized_gnds(dsd_name, gnd_name);
