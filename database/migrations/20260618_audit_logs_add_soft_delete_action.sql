DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    ALTER TABLE public.audit_logs
      DROP CONSTRAINT IF EXISTS audit_logs_action_type_check;

    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_action_type_check CHECK (
        action_type IN (
          'page_view',
          'create',
          'update',
          'delete',
          'soft_delete',
          'upload',
          'download',
          'login',
          'logout',
          'approve',
          'reject',
          'status_change',
          'solution_assignment',
          'intervention_assignment'
        )
      );
  END IF;
END $$;
