CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.uploaded_files (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    module_key text NOT NULL,
    record_id text,
    record_kind text,
    attachment_role text NOT NULL DEFAULT 'attachment',
    original_filename text NOT NULL,
    storage_provider text NOT NULL DEFAULT 'cloudflare_r2',
    bucket text NOT NULL,
    object_key text NOT NULL,
    public_url text,
    mime_type text,
    file_size_bytes bigint NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
    checksum_sha256 text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    visibility text NOT NULL DEFAULT 'module',
    status text NOT NULL DEFAULT 'attached',
    uploaded_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    deleted_by text,
    CONSTRAINT uploaded_files_visibility_check CHECK (visibility IN ('private', 'module', 'public')),
    CONSTRAINT uploaded_files_status_check CHECK (status IN ('pending', 'attached', 'deleted')),
    CONSTRAINT uploaded_files_module_key_check CHECK (module_key ~ '^[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_module_record_status
    ON public.uploaded_files (module_key, record_id, status);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_uploaded_by_created_at
    ON public.uploaded_files (uploaded_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_attachment_role
    ON public.uploaded_files (attachment_role);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uploaded_files_object_key_active
    ON public.uploaded_files (object_key)
    WHERE deleted_at IS NULL;

ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.uploaded_files FROM anon;
REVOKE ALL ON TABLE public.uploaded_files FROM authenticated;
