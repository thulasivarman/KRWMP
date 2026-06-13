-- KRWMP Portal - Volunteer Organisation Management Module
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.volunteer_organisation_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id BIGINT NOT NULL UNIQUE REFERENCES public.intervention_institutions(id) ON DELETE CASCADE,
    organisation_category TEXT NOT NULL DEFAULT 'Other',
    approval_status TEXT NOT NULL DEFAULT 'pending',
    registration_status TEXT NOT NULL DEFAULT 'unknown',
    registration_no TEXT,
    focus_areas TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    coverage_level TEXT NOT NULL DEFAULT 'local',
    capacity_score INTEGER NOT NULL DEFAULT 1 CHECK (capacity_score BETWEEN 1 AND 5),
    available_resources TEXT,
    preferred_tasks TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    remarks TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
