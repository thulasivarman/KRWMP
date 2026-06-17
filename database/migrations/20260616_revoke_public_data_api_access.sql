-- KRWMP Portal uses the Fastify backend as the authorization boundary.
-- Do not expose operational public-schema tables directly through Supabase
-- Data API roles unless a future migration adds an explicit allowlist with RLS.

REVOKE USAGE ON SCHEMA public FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- PostGIS installs these with explicit public API-role ACLs on Supabase.
REVOKE ALL PRIVILEGES ON TABLE public.geometry_columns FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.geography_columns FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.spatial_ref_sys FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES
  FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT, UPDATE ON SEQUENCES
  FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM anon, authenticated, PUBLIC;
