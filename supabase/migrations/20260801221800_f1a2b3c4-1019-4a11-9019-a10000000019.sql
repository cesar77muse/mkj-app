
-- ============ FIX F-25: TWO SOURCES OF TRUTH FOR PROJECT MANAGER ============
-- projects.project_manager_id is the single field every "Project manager"
-- display reads; project_managers is the many-to-many table every
-- permission check (can_write_project, can_see_project) reads. F-07 made
-- sure they stay in sync when project_manager_id changes -- but the Users &
-- Roles page also let an admin add *extra* project_managers rows directly
-- via checkboxes, completely independent of project_manager_id. Someone
-- added that way has real write access to the project and never appears as
-- "the" project manager anywhere -- an actual, ongoing divergence, not just
-- a historical one.
--
-- Decision: a project has exactly one manager. project_managers becomes a
-- strict, trigger-maintained mirror of project_manager_id, not an
-- independently editable table -- closing the divergence at its one write
-- path rather than trying to reconcile two displays. sync_project_manager_assignment()
-- (SECURITY DEFINER, bypasses RLS) is untouched and keeps working exactly
-- as it did after F-07; this only removes the *other* way rows could get
-- into this table.
--
-- Written to be safe to run manually, more than once, via the Lovable SQL
-- Editor.

BEGIN;

DROP POLICY IF EXISTS pm_write ON public.project_managers;

COMMIT;
