-- Ensure Admin privilege groups have full access to the Master Person Registry,
-- including delete permission used by /admin-persons.html.

INSERT INTO public.role_privileges (
  role_id,
  privilege_key,
  privilege_name,
  can_view,
  can_create,
  can_update,
  can_delete
)
SELECT
  r.id,
  'person_registry',
  'Master Person Registry',
  true,
  true,
  true,
  true
FROM public.roles r
WHERE lower(r.role_name) = 'admin'
ON CONFLICT (role_id, privilege_key)
DO UPDATE SET
  privilege_name = EXCLUDED.privilege_name,
  can_view = true,
  can_create = true,
  can_update = true,
  can_delete = true,
  updated_at = now();
