-- KRWMP Portal - Volunteer task allocation and progress tracking

CREATE TABLE IF NOT EXISTS public.volunteer_task_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_org_id UUID NOT NULL REFERENCES public.volunteer_organisation_profiles(id) ON DELETE CASCADE,
    task_code TEXT NOT NULL UNIQUE,
    task_title TEXT NOT NULL,
    task_description TEXT,
    task_type TEXT NOT NULL DEFAULT 'Other',
    linked_module TEXT NOT NULL DEFAULT 'general_activity',
    linked_record_id TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'assigned',
    assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
    target_date DATE,
    completion_date DATE,
    verification_date DATE,
    progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    assigned_by TEXT,
    verified_by TEXT,
    evidence_quality TEXT,
    remarks TEXT,
    location_name TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    geom geometry(Point, 4326),
    dsd_id BIGINT,
    dsd_name TEXT,
    gnd_id BIGINT,
    gnd_name TEXT,
    sub_watershed_id UUID,
    sub_watershed_name TEXT,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT volunteer_task_valid_coordinates CHECK (geom IS NULL OR (ST_X(geom) BETWEEN 79 AND 82 AND ST_Y(geom) BETWEEN 5 AND 10))
);

CREATE TABLE IF NOT EXISTS public.volunteer_task_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.volunteer_task_allocations(id) ON DELETE CASCADE,
    progress_date DATE NOT NULL DEFAULT CURRENT_DATE,
    progress_percent INTEGER NOT NULL CHECK (progress_percent BETWEEN 0 AND 100),
    status TEXT NOT NULL,
    progress_note TEXT,
    evidence_url TEXT,
    photo_url TEXT,
    reported_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_task_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.volunteer_task_allocations(id) ON DELETE CASCADE,
    evidence_type TEXT DEFAULT 'photo',
    evidence_url TEXT NOT NULL,
    caption TEXT,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.volunteer_task_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.volunteer_task_allocations(id) ON DELETE CASCADE,
    verification_status TEXT NOT NULL DEFAULT 'pending',
    verification_date DATE NOT NULL DEFAULT CURRENT_DATE,
    verified_by TEXT,
    verification_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_org ON public.volunteer_task_allocations (volunteer_org_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_status ON public.volunteer_task_allocations (status);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_linked ON public.volunteer_task_allocations (linked_module, linked_record_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_tasks_geom ON public.volunteer_task_allocations USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_volunteer_progress_task ON public.volunteer_task_progress (task_id);
