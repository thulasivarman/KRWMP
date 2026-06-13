-- KRWMP Portal - Volunteer dashboard views and RBAC seed

CREATE OR REPLACE VIEW public.vw_volunteer_organisation_performance AS
SELECT
    v.id,
    v.institution_id,
    i.institution_name,
    i.institution_code,
    i.institution_type,
    i.contact_person,
    i.contact_phone,
    i.contact_email,
    i.address,
    i.district,
    i.dsd_name,
    i.gnd_name,
    i.latitude,
    i.longitude,
    i.geom,
    v.organisation_category,
    v.approval_status,
    v.registration_status,
    v.focus_areas,
    v.coverage_level,
    v.capacity_score,
    v.preferred_tasks,
    v.active,
    COUNT(DISTINCT t.id)::integer AS total_tasks,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('completed', 'verified'))::integer AS completed_tasks,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('assigned', 'in_progress'))::integer AS ongoing_tasks,
    COUNT(DISTINCT t.id) FILTER (WHERE (t.target_date < CURRENT_DATE AND t.status NOT IN ('completed', 'verified', 'cancelled')) OR t.status = 'overdue')::integer AS overdue_tasks,
    ROUND(COALESCE(AVG(t.progress_percent), 0)::numeric, 2) AS average_progress,
    COUNT(DISTINCT e.id)::integer AS participation_events,
    COALESCE(SUM(e.participants_count), 0)::integer AS total_participants,
    COUNT(DISTINCT t.id) FILTER (WHERE t.linked_module = 'intervention')::integer AS linked_interventions,
    COUNT(DISTINCT t.id) FILTER (WHERE t.linked_module = 'community_issue')::integer AS linked_complaints,
    ROUND((v.capacity_score * 10 + COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'verified') * 8 + COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'completed') * 5 + COUNT(DISTINCT e.id) * 3 - COUNT(DISTINCT t.id) FILTER (WHERE (t.target_date < CURRENT_DATE AND t.status NOT IN ('completed', 'verified', 'cancelled')) OR t.status = 'overdue') * 6)::numeric, 2) AS performance_score,
    CASE
        WHEN v.active = false OR v.approval_status IN ('inactive', 'suspended') THEN 'Inactive'
        WHEN (v.capacity_score * 10 + COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('completed', 'verified')) * 6 + COUNT(DISTINCT e.id) * 3) >= 80 THEN 'Excellent'
        WHEN (v.capacity_score * 10 + COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('completed', 'verified')) * 5 + COUNT(DISTINCT e.id) * 3) >= 50 THEN 'Good'
        WHEN COUNT(DISTINCT t.id) > 0 OR COUNT(DISTINCT e.id) > 0 THEN 'Moderate'
        ELSE 'Low Engagement'
    END AS performance_class
FROM public.volunteer_organisation_profiles v
JOIN public.intervention_institutions i ON i.id = v.institution_id
LEFT JOIN public.volunteer_task_allocations t ON t.volunteer_org_id = v.id
LEFT JOIN public.volunteer_participation_events e ON e.volunteer_org_id = v.id
GROUP BY v.id, i.id;

CREATE OR REPLACE VIEW public.vw_volunteer_dashboard_summary AS
SELECT
    COUNT(*)::integer AS total_volunteer_organisations,
    COUNT(*) FILTER (WHERE approval_status = 'verified' AND active = true)::integer AS verified_organisations,
    COUNT(*) FILTER (WHERE active = true)::integer AS active_organisations,
    COUNT(*) FILTER (WHERE performance_class = 'Excellent')::integer AS excellent_performers,
    COALESCE(SUM(total_tasks), 0)::integer AS total_tasks,
    COALESCE(SUM(completed_tasks), 0)::integer AS completed_tasks,
    COALESCE(SUM(ongoing_tasks), 0)::integer AS ongoing_tasks,
    COALESCE(SUM(overdue_tasks), 0)::integer AS overdue_tasks,
    COALESCE(SUM(participation_events), 0)::integer AS participation_events,
    COALESCE(SUM(total_participants), 0)::integer AS total_participants,
    COALESCE(SUM(linked_interventions), 0)::integer AS intervention_tasks,
    COALESCE(SUM(linked_complaints), 0)::integer AS complaint_tasks
FROM public.vw_volunteer_organisation_performance;

DO $$
DECLARE
    admin_role_id INTEGER;
BEGIN
    FOR admin_role_id IN SELECT id FROM public.roles WHERE lower(role_name) IN ('admin', 'administrator', 'project admin') LOOP
        IF NOT EXISTS (SELECT 1 FROM public.role_privileges WHERE role_id = admin_role_id AND privilege_key = 'volunteer_organisation_management') THEN
            INSERT INTO public.role_privileges (role_id, privilege_key, privilege_name, can_view, can_create, can_update, can_delete)
            VALUES (admin_role_id, 'volunteer_organisation_management', 'Volunteer Organisation Management', true, true, true, true);
        END IF;
    END LOOP;
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'RBAC tables are not available yet. Skipping volunteer_organisation_management privilege seed.';
END $$;
