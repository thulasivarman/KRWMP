-- KRWMP Portal - Volunteer participation events

CREATE TABLE IF NOT EXISTS public.volunteer_participation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    volunteer_org_id UUID NOT NULL REFERENCES public.volunteer_organisation_profiles(id) ON DELETE CASCADE,
    event_title TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'Other',
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    location_name TEXT,
    participants_count INTEGER NOT NULL DEFAULT 0 CHECK (participants_count >= 0),
    activity_summary TEXT,
    outputs_delivered TEXT,
    linked_intervention_id TEXT,
    linked_community_issue_id TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    geom geometry(Point, 4326),
    dsd_name TEXT,
    gnd_name TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT volunteer_event_valid_coordinates CHECK (geom IS NULL OR (ST_X(geom) BETWEEN 79 AND 82 AND ST_Y(geom) BETWEEN 5 AND 10))
);

CREATE INDEX IF NOT EXISTS idx_volunteer_events_org ON public.volunteer_participation_events (volunteer_org_id);
CREATE INDEX IF NOT EXISTS idx_volunteer_events_date ON public.volunteer_participation_events (event_date DESC);
CREATE INDEX IF NOT EXISTS idx_volunteer_events_geom ON public.volunteer_participation_events USING GIST (geom);
