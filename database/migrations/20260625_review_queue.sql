-- Generic first-level validation and review queue for KRWMP/WIS data submissions

CREATE TABLE IF NOT EXISTS public.review_queue (
  id bigserial PRIMARY KEY,
  module_name text NOT NULL,
  record_kind text NOT NULL,
  record_id text NOT NULL,
  record_code text,
  title text,
  review_status text NOT NULL DEFAULT 'pending_review'
    CHECK (review_status IN ('pending_review','under_review','approved','rejected','needs_revision','sync_conflict')),
  submitted_by text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  assigned_reviewer text,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicate_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_patch jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_kind, record_id)
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON public.review_queue (review_status);
CREATE INDEX IF NOT EXISTS idx_review_queue_module ON public.review_queue (module_name);
CREATE INDEX IF NOT EXISTS idx_review_queue_record ON public.review_queue (record_kind, record_id);
CREATE INDEX IF NOT EXISTS idx_review_queue_submitted_at ON public.review_queue (submitted_at DESC);

CREATE TABLE IF NOT EXISTS public.review_history (
  id bigserial PRIMARY KEY,
  review_queue_id bigint NOT NULL REFERENCES public.review_queue(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('under_review','approved','rejected','needs_revision')),
  comment text,
  changed_by text,
  payload_patch jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_history_queue ON public.review_history (review_queue_id, created_at);

CREATE TABLE IF NOT EXISTS public.sync_conflicts (
  id bigserial PRIMARY KEY,
  module_name text NOT NULL,
  record_kind text NOT NULL,
  record_id text NOT NULL,
  incoming_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  conflict_summary text,
  conflict_status text NOT NULL DEFAULT 'pending_review'
    CHECK (conflict_status IN ('pending_review','resolved','rejected')),
  review_queue_id bigint REFERENCES public.review_queue(id) ON DELETE SET NULL,
  created_by text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_record ON public.sync_conflicts (record_kind, record_id);
CREATE INDEX IF NOT EXISTS idx_sync_conflicts_status ON public.sync_conflicts (conflict_status);
