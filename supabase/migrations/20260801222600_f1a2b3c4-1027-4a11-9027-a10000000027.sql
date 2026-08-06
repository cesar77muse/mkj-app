
-- ============ FIX L-04: NAME RESOLUTION BROKEN FOR NON-ADMINS ============
-- useAssignableUsers() and useManagers() (assignee-select.tsx,
-- project-manager-select.tsx) both pre-query user_roles to build an id
-- list before resolving names from user_directory. user_roles RLS is
-- self-or-admin, so for any non-admin that pre-query returns exactly one
-- row -- their own -- collapsing the whole lookup to "just me." Every
-- other user's PM/assignee field then renders "Unassigned", even though
-- the name is freely available in user_directory. Same root cause as
-- F-15 (profiles locked down, non-admins couldn't resolve names), just
-- recurring for user_roles instead of profiles.
--
-- v_user_roles mirrors the exact fix already used for this class of
-- problem this session (v_project_directory, v_project_inventory): a
-- plain view, which bypasses the underlying table's RLS via Postgres's
-- view-owner semantics, gated by has_any_role so it stays "every real
-- user" rather than reopening this to zero-role signups.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

CREATE OR REPLACE VIEW public.v_user_roles AS
SELECT user_id, role
FROM public.user_roles
WHERE public.has_any_role(auth.uid());
GRANT SELECT ON public.v_user_roles TO authenticated;

COMMIT;
