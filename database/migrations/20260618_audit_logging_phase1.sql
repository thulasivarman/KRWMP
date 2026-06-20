CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid,
    username text,
    action_type text NOT NULL,
    module_name text,
    record_id uuid,
    request_method text,
    request_url text,
    ip_address text,
    user_agent text,
    summary text,
    details jsonb,
    severity text NOT NULL DEFAULT 'info',
    archive_status text NOT NULL DEFAULT 'pending',
    r2_archive_path text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_action_type_check CHECK (
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
    ),
    CONSTRAINT audit_logs_severity_check CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    CONSTRAINT audit_logs_archive_status_check CHECK (archive_status IN ('pending', 'archived', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.audit_archive_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    archive_date date NOT NULL,
    r2_path text,
    records_archived integer NOT NULL DEFAULT 0 CHECK (records_archived >= 0),
    status text NOT NULL DEFAULT 'pending',
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    error_message text,
    CONSTRAINT audit_archive_runs_status_check CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON public.audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
    ON public.audit_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
    ON public.audit_logs (action_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_module_name
    ON public.audit_logs (module_name);

CREATE INDEX IF NOT EXISTS idx_audit_logs_record_id
    ON public.audit_logs (record_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_archive_status
    ON public.audit_logs (archive_status);

CREATE INDEX IF NOT EXISTS idx_audit_archive_runs_archive_date
    ON public.audit_archive_runs (archive_date DESC);

CREATE INDEX IF NOT EXISTS idx_audit_archive_runs_status
    ON public.audit_archive_runs (status);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_archive_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.audit_logs FROM anon;
REVOKE ALL ON TABLE public.audit_logs FROM authenticated;
REVOKE ALL ON TABLE public.audit_archive_runs FROM anon;
REVOKE ALL ON TABLE public.audit_archive_runs FROM authenticated;
